/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Env, getPropertyValue, ImageTexture } from "@flywave/flywave-datasource-protocol";
import { IconMaterial } from "@flywave/flywave-materials";
import { MemoryUsage } from "@flywave/flywave-text-canvas";
import { assert, LoggerManager, Math2D } from "@flywave/flywave-utils";
import * as THREE from "three";

import { ImageItem } from "../image/Image";
import { MapViewImageCache } from "../image/MapViewImageCache";
import { MipMapGenerator } from "../image/MipMapGenerator";
import { ScreenCollisions } from "../ScreenCollisions";
import { PoiInfo, TextElement } from "../text/TextElement";
import { BoxBuffer } from "./BoxBuffer";
import { PoiManager } from "./PoiManager";

const logger = LoggerManager.instance.create("PoiRenderer");

/**
 * Neutral color used as `vColor` attribute of [[IconMaterial]] if no `iconColor` color was
 * specified.
 */
const neutralColor = new THREE.Color(1, 1, 1);

/**
 * Temporary color instance used by `addPoi` to pass color derived from `iconBrightness` property.
 */
const tmpIconColor = new THREE.Color();

export interface PoiLayer {
    id: number;
    scene: THREE.Scene;
}

/**
 * @internal
 * Buffer for POIs sharing same material and render order, renderable in a single draw call
 * (WebGL limits apply, see {@link BoxBuffer}).
 */
export class PoiBuffer {
    private m_refCount: number = 0;

    /**
     * Creates a `PoiBuffer`
     * @param buffer -
     * @param layer - The {@link TextCanvas} layer used to render the POIs.
     */
    constructor(
        readonly buffer: BoxBuffer,
        readonly layer: PoiLayer,
        private readonly m_onDispose: () => void
    ) {}

    /**
     * Increases this `PoiBuffer`'s reference count.
     * @returns this `PoiBuffer`.
     */
    increaseRefCount(): PoiBuffer {
        ++this.m_refCount;
        return this;
    }

    /**
     * Decreases this `PoiBuffer`'s reference count. All resources will be disposed when the
     * reference count reaches 0.
     * @returns this `PoiBuffer`.
     */
    decreaseRefCount(): PoiBuffer {
        assert(this.m_refCount > 0);

        if (--this.m_refCount === 0) {
            this.dispose();
        }
        return this;
    }

    private dispose() {
        this.layer.scene.remove(this.buffer.mesh);
        this.buffer.dispose();
        this.m_onDispose();
    }
}

/**
 * @internal
 *
 * The `PoiBatch` contains the geometry and the material for all POIs that share the same icon image
 * ({@link @flywave/flywave-datasource-protocol#ImageTexture}).
 *
 * There is a `PoiBatch` for every icon in a texture atlas, since the size of the icon in the atlas
 * as well as the texture coordinates are specified in the `PoiBatch`.
 */
class PoiBatch {
    // Enable trilinear filtering to reduce flickering due to distance scaling
    static readonly trilinear: boolean = true;

    // Map of buffers and their corresponding canvas layers, with render order as key.
    private readonly m_poiBuffers: Map<number, PoiBuffer>;

    private readonly m_material: IconMaterial;

    /**
     * Create the `PoiBatch`.
     *
     * @param m_rendererCapabilities - The {@link THREE.WebGLCapabilities} used for material
     * creation.
     * @param imageItem - The icon that will have his material shared.
     * @param m_onDispose - Callback executed when the `PoiBatch` is disposed.
     */
    constructor(
        private readonly m_rendererCapabilities: THREE.WebGLCapabilities,
        readonly imageItem: ImageItem,
        private readonly m_onDispose: () => void,
        haloParams?: { haloColor?: THREE.Color; haloAlpha?: number; haloWidth?: number; haloBlur?: number }
    ) {
        // Texture images should be generated with premultiplied alpha
        const premultipliedAlpha = true;

        const texture = new THREE.Texture(
            this.imageItem.image as any,
            THREE.UVMapping,
            undefined,
            undefined,
            PoiBatch.trilinear ? THREE.LinearFilter : THREE.LinearFilter,
            PoiBatch.trilinear ? THREE.LinearMipMapLinearFilter : THREE.LinearFilter,
            THREE.RGBAFormat
        );
        if (PoiBatch.trilinear && this.imageItem.mipMaps) {
            // Generate mipmaps for distance scaling of icon
            texture.mipmaps = this.imageItem.mipMaps;
            texture.image = texture.mipmaps[0];
        }
        texture.flipY = false;
        texture.premultiplyAlpha = premultipliedAlpha;
        texture.needsUpdate = true;

        this.m_material = new IconMaterial({
            rendererCapabilities: this.m_rendererCapabilities,
            map: texture,
            sdf: this.imageItem.sdf === true,
            haloColor: haloParams?.haloColor,
            haloAlpha: haloParams?.haloAlpha,
            haloWidth: haloParams?.haloWidth,
            haloBlur: haloParams?.haloBlur
        });

        this.m_poiBuffers = new Map();
    }

    /**
     * Gets the {@link PoiBuffer} for a given layer, creating it if necessary.
     * @param layer - The {@link PoiLayer} to be used.
     * @returns The {@link PoiBuffer}.
     */
    getBuffer(layer: PoiLayer): PoiBuffer {
        let poiBuffer = this.m_poiBuffers.get(layer.id);
        if (poiBuffer) {
            return poiBuffer.increaseRefCount();
        }
        const boxBuffer = new BoxBuffer(this.m_material, layer.id);
        const mesh = boxBuffer.mesh;
        mesh.frustumCulled = false;

        layer.scene.add(mesh);

        poiBuffer = new PoiBuffer(boxBuffer, layer, () => {
            this.disposeBuffer(layer.id);
        });
        this.m_poiBuffers.set(layer.id, poiBuffer);

        return poiBuffer.increaseRefCount();
    }

    /**
     * Clean the `PoiBatch`, remove all icon boxes. Called before starting a new frame.
     */
    reset(): void {
        for (const poiBuffer of this.m_poiBuffers.values()) {
            poiBuffer.buffer.reset();
        }
    }

    /**
     * Update the geometry with all the added boxes during the frame.
     */
    update(): void {
        for (const poiBuffer of this.m_poiBuffers.values()) {
            poiBuffer.buffer.updateBufferGeometry();
        }
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * boxes are found, the order of the results is unspecified.
     *
     * @param screenPosition - Screen coordinate of picking position.
     * @param pickCallback - Callback to be called for every picked element.
     * @param image - Image to test if the pixel is transparent
     */
    pickBoxes(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void,
        image?: CanvasImageSource | ImageData
    ) {
        for (const poiBuffer of this.m_poiBuffers.values()) {
            poiBuffer.buffer.pickBoxes(screenPosition, pickCallback, image);
        }
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `PoiBatch`.
     *
     * @param info - The info object to increment with the values from this `PoiBatch`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        if (this.imageItem.image !== undefined) {
            const imageBytes = this.imageItem.image.width * this.imageItem.image.height * 4;
            info.heapSize += imageBytes;
            info.gpuSize += imageBytes;
        }
        for (const poiBuffer of this.m_poiBuffers.values()) {
            poiBuffer.buffer.updateMemoryUsage(info);
        }
    }

    private dispose() {
        this.m_poiBuffers.clear();
        this.m_material.map.dispose();
        this.m_material.dispose();
        this.m_onDispose();
    }

    private disposeBuffer(renderOrder: number) {
        assert(this.m_poiBuffers.size > 0);

        this.m_poiBuffers.delete(renderOrder);
        if (this.m_poiBuffers.size === 0) {
            this.dispose();
        }
    }
}

/**
 * @internal
 * Contains all [[PoiBatch]]es. Selects (and initializes) the correct batch for a POI.
 */
export class PoiBatchRegistry {
    private readonly m_batchMap: Map<string, PoiBatch> = new Map();

    /**
     * Create the `PoiBatchRegistry`.
     *
     * @param m_rendererCapabilities - The {@link THREE.WebGLCapabilities} to be used.
     */
    constructor(private readonly m_rendererCapabilities: THREE.WebGLCapabilities) {}

    /**
     * Register the POI and prepare the [[PoiBatch]] for the POI at first usage.
     *
     * @param poiInfo - Describes the POI icon.
     * @param layer - The {@link PoiLayer} to render to.
     */
    registerPoi(poiInfo: PoiInfo, layer: PoiLayer): PoiBuffer | undefined {
        const { imageItem, imageTexture } = poiInfo;

        if (!imageItem) {
            // No image found, therefore just return undefined. It will probably come in soon?
            return undefined;
        }

        // There is a batch for every ImageDefinition, which could be a texture atlas with many
        // ImageTextures in it. If the imageTexture is not set, imageTextureName has the actual
        // image name.
        assert(poiInfo.imageTextureName !== undefined);
        let batchKey = imageTexture?.image ?? poiInfo.imageTextureName!;

        // SDF icons: the halo uniforms change the rendered pixels, so split
        // the batch per (icon, halo) signature. Mapbox halo_width/blur are in
        // ems; the shader uses SDF field units with SDF_PX=8 (symbol.fragment:
        // buff=(6-halo_width)/SDF_PX, gamma=(halo_blur*1.19/SDF_PX+EDGE_GAMMA)).
        let haloParams: { haloColor?: THREE.Color; haloAlpha?: number; haloWidth?: number; haloBlur?: number } | undefined;
        if (imageItem.sdf) {
            const widthField = (poiInfo.iconHaloWidth ?? 0) / 8;
            const blurField = (poiInfo.iconHaloBlur ?? 0) * 1.19 / 8;
            const colorHex = poiInfo.iconHaloColor?.getHexString() ?? '0';
            const haloAlpha = poiInfo.iconHaloAlpha ?? 1;
            batchKey += `#h${widthField.toFixed(3)},${blurField.toFixed(3)},${colorHex},${haloAlpha.toFixed(3)}`;
            haloParams = {
                haloColor: poiInfo.iconHaloColor,
                haloAlpha,
                haloWidth: widthField,
                haloBlur: blurField
            };
        }

        let batch = this.m_batchMap.get(batchKey);

        if (batch === undefined) {
            batch = new PoiBatch(this.m_rendererCapabilities, imageItem, () => {
                this.deleteBatch(batchKey);
            }, haloParams);
            this.m_batchMap.set(batchKey, batch);
        }

        return batch.getBuffer(layer);
    }

    /**
     * Render a POI image at the specified location.
     *
     * @param poiInfo - PoiInfo containing information for rendering the POI icon.
     * @param screenBox - Box to render icon into in 2D coordinates.
     * @param viewDistance - Box's distance to camera.
     * @param opacity - Opacity of icon to allow fade in/out.
     */
    addPoi(poiInfo: PoiInfo, screenBox: Math2D.Box, viewDistance: number, opacity: number) {
        if (poiInfo.isValid === false || !poiInfo.buffer) {
            logger.warn(
                "PoiBatchRegistry: trying to add poiInfo without buffer prepared: ",
                poiInfo.poiName
            );
            return;
        }
        assert(poiInfo.uvBox !== undefined);

        let color: THREE.Color;
        // Mapbox only applies `icon-color` (and brightness) to SDF icons.
        // Raster/non-SDF icons sample the texture directly — tinting them with
        // the default black `icon-color` would render a solid black box.
        const applyColor = poiInfo.imageItem?.sdf === true;
        if (applyColor && poiInfo.iconBrightness !== undefined) {
            color = tmpIconColor.setScalar(poiInfo.iconBrightness);
            if (poiInfo.iconColor !== undefined) {
                color = tmpIconColor.multiply(poiInfo.iconColor);
            }
        } else if (applyColor && poiInfo.iconColor !== undefined) {
            color = poiInfo.iconColor;
        } else {
            color = neutralColor;
        }
        poiInfo.buffer.buffer.addBox(
            screenBox,
            poiInfo.uvBox!,
            color,
            opacity,
            viewDistance,
            poiInfo.textElement,
            poiInfo.iconRotate
        );
    }

    /**
     * Reset all batches, removing all content from the [[PoiBatch]]es. Called at the
     * beginning of a frame before the POIs are placed.
     */
    reset(): void {
        for (const batch of this.m_batchMap.values()) {
            batch.reset();
        }
    }

    /**
     * Update the geometry of all [[PoiBatch]]es. Called before rendering.
     */
    update(): void {
        for (const batch of this.m_batchMap.values()) {
            batch.update();
        }
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * {@link PoiInfo}s are found, the order of the results is unspecified.
     *
     * @param screenPosition - Screen coordinate of picking position.
     * @param pickCallback - Callback to be called for every picked element.
     */
    pickTextElements(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void
    ) {
        for (const batch of this.m_batchMap.values()) {
            batch.pickBoxes(screenPosition, pickCallback, batch.imageItem.image);
        }
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `PoiBatchRegistry`.
     *
     * @param info - The info object to increment with the values from this `PoiBatchRegistry`.
     */
    updateMemoryUsage(info: MemoryUsage) {
        for (const batch of this.m_batchMap.values()) {
            batch.updateMemoryUsage(info);
        }
    }

    private deleteBatch(batchKey: string) {
        this.m_batchMap.delete(batchKey);
    }
}

// keep track of the missing textures, we throw an error if the number of attempts goes over some
// threshold.
const missingTextureName: Map<string, number> = new Map();
const SEARCH_CACHE_ATTEMPTS = 5;

function findImageItem(
    poiInfo: PoiInfo,
    imageCaches: MapViewImageCache[],
    imageTexture?: ImageTexture
): ImageItem | undefined {
    assert(poiInfo.imageTextureName !== undefined);
    const imageTextureName = imageTexture ? imageTexture.image : poiInfo.imageTextureName!;

    for (const imageCache of imageCaches) {
        const imageItem = imageCache.findImageByName(imageTextureName);
        if (imageItem) {
            missingTextureName.delete(imageTextureName);
            return imageItem;
        }
    }

    // There is a texture missing in the cache, we attempt again, and then error out.
    const missingTextureCount = missingTextureName.get(imageTextureName);
    missingTextureName.set(imageTextureName, missingTextureCount ? missingTextureCount + 1 : 0);
    if (missingTextureName.get(imageTextureName)! === SEARCH_CACHE_ATTEMPTS) {
        logger.error(`PoiRenderer::findImageItem: No imageItem found with name:
            '${imageTexture?.image ?? imageTextureName}'
            after ${SEARCH_CACHE_ATTEMPTS} attempts.`);
    }
    return undefined;
}

/**
 * @internal
 * Manage POI rendering. Uses a [[PoiBatchRegistry]] to actually create the geometry that is being
 * rendered.
 */
export class PoiRenderer {
    /**
     * Compute screen box for icon. It is required that `prepareRender` has been successfully called
     * before `computeScreenBox` may be called.
     *
     * @param poiInfo - PoiInfo containing information for rendering the POI icon.
     * @param screenPosition - Position on screen (2D).
     * @param scale - Scale to apply to icon.
     * @param env - Current zoom level.
     * @param screenBox - Box that will be used to store the result.
     * @returns The computed screen box for the icon.
     */
    static computeIconScreenBox(
        poiInfo: PoiInfo,
        screenPosition: THREE.Vector2,
        scale: number,
        env: Env,
        /* out */ screenBox: Math2D.Box = new Math2D.Box()
    ): Math2D.Box {
        assert(poiInfo.buffer !== undefined);

        const width = poiInfo.computedWidth! * scale;
        const height = poiInfo.computedHeight! * scale;
        const technique = poiInfo.technique;
        const iconXOffset = getPropertyValue(technique.iconXOffset, env);
        const iconYOffset = getPropertyValue(technique.iconYOffset, env);

        // Mapbox `icon-text-fit`: stretch the icon box to the shaped text bounds
        // (mgl shaping_shared.fitIconToText). The fitted box is positioned at the
        // anchor-relative text edges (emitter emits _iconFitTextL/R/T/B in px),
        // and icon-anchor is ignored (the icon is centered on / stretched to the
        // text). For the non-fitted dimension the icon is centered on the text.
        const iconTextFit = poiInfo.iconTextFit;
        let fitWidth = width;
        let fitHeight = height;
        let fitCenterX = screenPosition.x + (typeof iconXOffset === "number" ? iconXOffset : 0) * scale;
        let fitCenterY = screenPosition.y + (typeof iconYOffset === "number" ? iconYOffset : 0) * scale;
        let anchorShiftX = 0;
        let anchorShiftY = 0;
        if (iconTextFit !== undefined) {
            const pad = poiInfo.iconTextFitPadding ?? [0, 0, 0, 0];
            const textL = poiInfo.iconFitTextL;
            const textR = poiInfo.iconFitTextR;
            const textT = poiInfo.iconFitTextT;
            const textB = poiInfo.iconFitTextB;
            const fitW = poiInfo.iconFitTextW ?? 0;
            const fitH = poiInfo.iconFitTextH ?? 0;
            // Fall back to a centered box when the emitter did not provide
            // anchor-relative edges (defensive).
            const hasEdges =
                typeof textL === "number" && typeof textR === "number" &&
                typeof textT === "number" && typeof textB === "number";
            let leftPx = hasEdges ? textL! : -fitW / 2;
            let rightPx = hasEdges ? textR! : fitW / 2;
            let topPx = hasEdges ? textT! : -fitH / 2;
            let bottomPx = hasEdges ? textB! : fitH / 2;

            if (iconTextFit === "width" || iconTextFit === "both") {
                // left = textLeft - pad[3]; right = textRight + pad[1]
                leftPx -= pad[3];
                rightPx += pad[1];
                fitWidth = (rightPx - leftPx) * scale;
            } else {
                // Non-fitted dimension: centered on the text, natural icon size.
                fitWidth = width;
            }
            if (iconTextFit === "height" || iconTextFit === "both") {
                // top = textTop - pad[0]; bottom = textBottom + pad[2]
                topPx -= pad[0];
                bottomPx += pad[2];
                fitHeight = (bottomPx - topPx) * scale;
            } else {
                fitHeight = height;
            }

            // Center the fitted box at the mid-point of the fitted bounds
            // (mgl: box is drawn between left..right / top..bottom, plus the
            // icon-offset shift already applied to the center). Mapbox Y is
            // screen-down while the native screenPosition.y is screen-up, so
            // the vertical text offset is negated (same as the icon-anchor
            // shift above).
            fitCenterX = screenPosition.x +
                (typeof iconXOffset === "number" ? iconXOffset : 0) * scale +
                ((leftPx + rightPx) / 2) * scale;
            fitCenterY = screenPosition.y +
                (typeof iconYOffset === "number" ? iconYOffset : 0) * scale -
                ((topPx + bottomPx) / 2) * scale;
        } else {
            // Mapbox `icon-anchor` aligns the icon box so the named edge/corner
            // is at the symbol point. The native box is centered at
            // screenPosition + offset, so shift the center by
            // (0.5 - alignment) * (icon size in px at scale 1) to reproduce the
            // anchor (mapbox shapeIcon: x1 = dx - w*hAlign, etc.).
            const iconAnchor = getPropertyValue((technique as any)._iconAnchor, env) as string | undefined;
            if (typeof iconAnchor === "string" && iconAnchor !== "center") {
                let horizontalAlign = 0.5;
                let verticalAlign = 0.5;
                if (/right/.test(iconAnchor)) horizontalAlign = 1;
                else if (/left/.test(iconAnchor)) horizontalAlign = 0;
                if (/bottom/.test(iconAnchor)) verticalAlign = 1;
                else if (/top/.test(iconAnchor)) verticalAlign = 0;
                const pxWidth = poiInfo.computedWidth!;
                const pxHeight = poiInfo.computedHeight!;
                anchorShiftX = (0.5 - horizontalAlign) * pxWidth;
                // Mapbox Y is screen-down; the native screenPosition.y is
                // screen-up (three.js), so negate the vertical alignment shift.
                anchorShiftY = (verticalAlign - 0.5) * pxHeight;
            }
            fitCenterX = screenPosition.x + (typeof iconXOffset === "number" ? iconXOffset : 0) * scale +
                anchorShiftX * scale;
            fitCenterY = screenPosition.y + (typeof iconYOffset === "number" ? iconYOffset : 0) * scale +
                anchorShiftY * scale;
        }

        screenBox.x = fitCenterX - fitWidth / 2;
        screenBox.y = fitCenterY - fitHeight / 2;
        screenBox.w = fitWidth;
        screenBox.h = fitHeight;

        return screenBox;
    }

    // the render buffer containing all batches, one batch per texture/material.
    private readonly m_poiBatchRegistry: PoiBatchRegistry;

    // temporary variable to save allocations
    private readonly m_tempScreenBox = new Math2D.Box();

    private readonly m_layers: PoiLayer[] = [];

    /**
     * Create the `PoiRenderer` for the specified {@link MapView}.
     *
     * @param m_renderer - The {@link THREE.WebGLRenderer} to be rendered to.
     * @param m_poiManager - The {@link PoiManager} to be used.
     * @param m_imageCaches - The {@link ImageCache}s to look for loaded images.
     */
    constructor(
        private readonly m_renderer: THREE.WebGLRenderer,
        private readonly m_poiManager: PoiManager,
        private readonly m_imageCaches: MapViewImageCache[]
    ) {
        this.m_poiBatchRegistry = new PoiBatchRegistry(this.renderer.capabilities);
    }

    get renderer(): THREE.WebGLRenderer {
        return this.m_renderer;
    }

    /**
     * Prepare the POI for rendering, and determine which {@link PoiBuffer} should be used. If a
     * {@link PoiBuffer} is assigned, the POI is ready to be rendered.
     *
     * @param pointLabel - TextElement with PoiInfo for rendering the POI icon.
     * @param env - TODO! The current zoomLevel level of {@link MapView}
     *
     * @returns `True` if the space is not already allocated by another object (text label or POI)
     */
    prepareRender(pointLabel: TextElement, env: Env): boolean {
        const poiInfo = pointLabel.poiInfo;
        if (poiInfo === undefined) {
            return false;
        }
        if (poiInfo.buffer === undefined) {
            this.preparePoi(pointLabel, env);
        }
        return poiInfo.buffer !== undefined;
    }

    /**
     * Reset all batches, removing all content from the [[PoiBatchRegistry]]. Called at the
     * beginning of a frame before the POIs are placed.
     */
    reset(): void {
        this.m_poiBatchRegistry.reset();
    }

    /**
     * Add the icon. Icon will only be added if opacity > 0, otherwise only its space will be
     * allocated.
     *
     * @param poiInfo - PoiInfo containing information for rendering the POI icon.
     * @param screenPosition - Position on screen (2D):
     * @param screenCollisions - Object handling the collision checks for screen-aligned 2D boxes.
     * @param viewDistance - Box's distance to camera.
     * @param scale - Scaling factor to apply to text and icon.
     * @param allocateScreenSpace - If `true` screen space will be allocated for the icon.
     * @param opacity - Opacity of icon to allow fade in/out.
     * @returns - `true` if icon has been actually rendered, `false` otherwise.
     */
    addPoi(
        poiInfo: PoiInfo,
        screenPosition: THREE.Vector2,
        screenCollisions: ScreenCollisions,
        viewDistance: number,
        scale: number,
        allocateScreenSpace: boolean,
        opacity: number,
        env: Env
    ): void {
        assert(poiInfo.buffer !== undefined);

        PoiRenderer.computeIconScreenBox(poiInfo, screenPosition, scale, env, this.m_tempScreenBox);

        if (allocateScreenSpace) {
            screenCollisions.allocate(this.m_tempScreenBox);
        }

        if (opacity > 0) {
            if (!poiInfo.buffer) {
                this.preparePoi(poiInfo.textElement, env);
            }
            this.m_poiBatchRegistry.addPoi(poiInfo, this.m_tempScreenBox, viewDistance, opacity);
        }
    }

    /**
     * Update the geometry of all [[PoiBatch]]es. Called before rendering.
     */
    update(): void {
        this.m_poiBatchRegistry.update();
    }

    /**
     * @internal
     *
     * Adds a layer to the PoiRenderer
     * @param layerId
     */
    addLayer(layerId: number): PoiLayer {
        let result = this.getLayer(layerId);
        if (result === undefined) {
            result = {
                id: layerId,
                scene: new THREE.Scene()
            };

            this.m_layers.push(result);
            this.m_layers.sort((a: PoiLayer, b: PoiLayer) => {
                return a.id - b.id;
            });
        }
        return result;
    }

    /**
     * Retrieves a specific `Poi` rendering layer.
     *
     * @param layerId - Desired layer identifier.
     *
     * @returns Selected {@link PoiLayer}
     */
    private getLayer(layerId: number): PoiLayer | undefined {
        return this.m_layers.find(layer => layer.id === layerId);
    }

    /**
     * @internal
     *
     * Returns all {@link PoiLayer}s of this {@link PoiRenderer}
     */
    get layers(): PoiLayer[] {
        return this.m_layers;
    }

    /**
     * Renders the content of this `PoiRenderer`.
     *
     * @param camera - Orthographic camera.
     * @param layer - The Layer to be rendered.
     */
    render(camera: THREE.OrthographicCamera, layer: PoiLayer) {
        this.m_renderer.render(layer.scene, camera);
    }

    /**
     * Fill the picking results for the pixel with the given screen coordinate. If multiple
     * {@link PoiInfo}s are found, the order of the results is unspecified.
     *
     * @param screenPosition - Screen coordinate of picking position.
     * @param pickCallback - Callback to be called for every picked element.
     */
    pickTextElements(
        screenPosition: THREE.Vector2,
        pickCallback: (pickData: any | undefined) => void
    ) {
        this.m_poiBatchRegistry.pickTextElements(screenPosition, pickCallback);
    }

    /**
     * Update the info with the memory footprint caused by objects owned by the `PoiRenderer`.
     *
     * @param info - The info object to increment with the values from this `PoiRenderer`.
     */
    getMemoryUsage(info: MemoryUsage) {
        this.m_poiBatchRegistry.updateMemoryUsage(info);
    }

    /**
     * Register the POI at the [[PoiBatchRegistry]] which may require some setup, for example
     * loading of the actual image.
     */
    private preparePoi(pointLabel: TextElement, env: Env): void {
        const poiInfo = pointLabel.poiInfo;
        if (!poiInfo || !pointLabel.visible) {
            return;
        }

        if (poiInfo.buffer !== undefined || poiInfo.isValid === false) {
            // Already set up, nothing to be done here.
            return;
        }

        if (poiInfo.poiTableName !== undefined) {
            if (this.m_poiManager.updatePoiFromPoiTable(pointLabel)) {
                if (!pointLabel.visible) {
                    // PoiTable set this POI to not visible.
                    return;
                }
            } else {
                // PoiTable has not been loaded, but is required to determine visibility.
                return;
            }
        }

        const imageTextureName = poiInfo.imageTextureName;
        if (imageTextureName === undefined) {
            poiInfo.isValid = false;
            return;
        }

        const imageTexture = this.m_poiManager.getImageTexture(imageTextureName);
        const imageItem = findImageItem(poiInfo, this.m_imageCaches, imageTexture);
        if (!imageItem) {
            poiInfo.imageItem = null;
            return;
        }

        if (imageItem.loaded) {
            this.setupPoiInfo(poiInfo, imageItem, env, imageTexture);
            return;
        }

        if (imageItem.loading) {
            // already being loaded, will be rendered once available
            return;
        }

        imageItem
            .loadImage()
            .then(loadedImageItem => {
                // Skip setup if image was not loaded (cancelled).
                if (loadedImageItem?.image) {
                    this.setupPoiInfo(poiInfo, loadedImageItem, env, imageTexture);
                }
            })
            .catch(error => {
                logger.error(`preparePoi: Failed to load imageItem: '${imageItem.url}`, error);
                poiInfo.isValid = false;
            });
    }

    /**
     * Setup texture and material for the batch.
     *
     * @param poiInfo - {@link PoiInfo} to initialize.
     * @param imageTexture - Shared {@link @flywave/flywave-datasource-protocol#ImageTexture},
     *                       defines used area in atlas.
     * @param imageItem - Shared {@link ImageItem}, contains cached image for texture.
     * @param env - The current zoom level of {@link MapView}
     */
    private setupPoiInfo(
        poiInfo: PoiInfo,
        imageItem: ImageItem,
        env: Env,
        imageTexture?: ImageTexture
    ) {
        assert(poiInfo.uvBox === undefined);

        if (!imageItem.image) {
            logger.error("setupPoiInfo: No imageItem/imageData found");
            poiInfo.isValid = false;
            return;
        }

        const technique = poiInfo.technique;

        const imageWidth = imageItem.image.width;
        const imageHeight = imageItem.image.height;
        const paddedSize = MipMapGenerator.getPaddedSize(imageWidth, imageHeight);
        const trilinearFiltering = PoiBatch.trilinear && imageItem.mipMaps;
        const paddedImageWidth = trilinearFiltering ? paddedSize.width : imageWidth;
        const paddedImageHeight = trilinearFiltering ? paddedSize.height : imageHeight;

        const iconWidth = imageTexture?.width !== undefined ? imageTexture.width : imageWidth;
        const iconHeight = imageTexture?.height !== undefined ? imageTexture.height : imageHeight;

        const width = imageTexture?.width !== undefined ? imageTexture.width : imageWidth;
        const height = imageTexture?.height !== undefined ? imageTexture.height : imageHeight;
        const xOffset = imageTexture?.xOffset !== undefined ? imageTexture.xOffset : 0;
        const yOffset = imageTexture?.yOffset !== undefined ? imageTexture.yOffset : 0;

        const minS = xOffset / paddedImageWidth;
        const maxS = (xOffset + width) / paddedImageWidth;
        const minT = yOffset / paddedImageHeight;
        const maxT = (yOffset + height) / paddedImageHeight;

        let iconScaleH = technique.iconScale !== undefined ? technique.iconScale : 1;
        let iconScaleV = technique.iconScale !== undefined ? technique.iconScale : 1;

        // By default, iconScaleV should be equal to iconScaleH, whatever is set in the style.
        const screenWidth = getPropertyValue(technique.screenWidth, env);
        if (screenWidth !== undefined && screenWidth !== null) {
            iconScaleV = iconScaleH = screenWidth / iconWidth;
        }

        const screenHeight = getPropertyValue(technique.screenHeight, env);
        if (screenHeight !== undefined && screenHeight !== null) {
            iconScaleV = screenHeight / iconHeight;
            if (screenWidth !== undefined) {
                iconScaleH = iconScaleV;
            }
        }

        // compute stored values in imageTexture
        poiInfo.computedWidth = iconWidth * iconScaleH;
        poiInfo.computedHeight = iconHeight * iconScaleV;
        poiInfo.uvBox = {
            s0: minS,
            t0: maxT,
            s1: maxS,
            t1: minT
        };
        poiInfo.imageItem = imageItem;
        poiInfo.imageTexture = imageTexture;
        poiInfo.buffer = this.m_poiBatchRegistry.registerPoi(
            poiInfo,
            this.addLayer(poiInfo.renderOrder!)
        );
        poiInfo.isValid = true;
    }
}
