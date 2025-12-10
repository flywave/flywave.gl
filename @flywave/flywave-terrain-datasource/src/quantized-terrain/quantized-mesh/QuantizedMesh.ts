/* Copyright (C) 2025 flywave.gl contributors */

import "./Shader";

import { type TilingScheme, GeoBox, geographicTerrainStandardTiling, ProjectionType } from "@flywave/flywave-geoutils";
import { MapView } from "@flywave/flywave-mapview";
import * as THREE from "three";

import { type GroundOverlayTextureResource } from "../../ground-overlay-provider";
import { type WebTile } from "../../WebImageryTileProvider";
import { type QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
import { ProjectionSwitchController } from "../../ProjectionSwitchController";

/**
 * Custom material for quantized mesh rendering with specialized shader modifications
 *
 * This material extends THREE.MeshStandardMaterial to provide specialized support for:
 * - Clip UV transformations for texture coordinate clamping
 * - Image UV transformations for proper texture mapping
 * - Water mask rendering with animated wave effects
 * - Normal mapping for realistic water surface rendering
 *
 * The material integrates custom shader chunks for terrain-specific rendering features.
 */

interface CommonUniforms {
    /**
     * Transform parameters for UV coordinate clipping
     * @private
     */
    clipUvTransform: { value: THREE.Vector3 };
    /**
     * Transform parameters for UV coordinate mapping
     * @private
     */
    imageryPatchTransform: { value: THREE.Vector4[] };
    /**
     * Array of image textures for patch mapping
     * @private
     */
    imageryPatchArray: { value: THREE.Texture[] };

    imageryPatchCount: { value: number };
    /**
     * Transform parameters for UV coordinate mapping
     * @private
     */
    overlayerImageryTransform: { value: THREE.Vector4 };
    /**
     * Array of image textures for patch mapping
     * @private
     */
    overlayerImagery: { value: THREE.Texture };
    /**
     * Texture for height map
     * @private
     */
    waterMaskTranslationAndScale: { value: THREE.Vector4 };
    /**
     * Texture for noisy height map
     * @private
     */
    waterMaskNoisyTranslationAndScale: { value: THREE.Vector4 };
    /**
     * Texture for water mask
     * @private
     */
    waterMaskTexture: { value: THREE.Texture };

    normalSampler: { value: THREE.Texture };
    frameNumber: { value: number }; 
}

export class QuantizedMeshMaterial extends THREE.MeshStandardMaterial {
    private readonly commonUniform: CommonUniforms = {
        clipUvTransform: { value: new THREE.Vector3() },
        imageryPatchTransform: { value: new Array(5).fill(new THREE.Vector4()) },
        imageryPatchArray: { value: new Array(5).fill(new THREE.Texture()) },
        imageryPatchCount: { value: 0 },
        waterMaskTranslationAndScale: { value: new THREE.Vector4() },
        waterMaskNoisyTranslationAndScale: { value: new THREE.Vector4() },
        waterMaskTexture: { value: new THREE.DataTexture() },
        normalSampler: { value: new THREE.DataTexture() },
        overlayerImageryTransform: { value: new THREE.Vector4() },
        overlayerImagery: { value: new THREE.Texture() },
        frameNumber: { value: 0 }, 
    };

    public defines: Record<string, any> = {};
    /**
     * Creates a new QuantizedMeshMaterial instance
     *
     * @param parameters - Optional standard material parameters
     */
    constructor(parameters?: THREE.MeshStandardMaterialParameters) {
        super(parameters);

        // Setup shader modifications before compilation
        this.onBeforeCompile = (shader: THREE.WebGLProgramParametersWithUniforms) => {
            this._setupShader(shader);
        };
    }

    /**
     * Sets up custom shader modifications for terrain rendering
     *
     * This method injects custom shader chunks and uniforms to enable:
     * - UV coordinate transformations
     * - Water mask rendering with animated waves
     * - Clip UV functionality for texture clamping
     *
     * @param shader - The shader parameters to modify
     * @private
     */
    private _setupShader(shader: THREE.WebGLProgramParametersWithUniforms): void {
        // Inject vertex shader modifications
        shader.vertexShader = shader.vertexShader
            .replace(
                `#include <uv_pars_vertex>`,
                `#include <uv_pars_vertex>\n#include <tinterrain_common>`
            )
            .replace(
                `#include <begin_vertex>`,
                `#include <begin_vertex>\n#include <begin_tinterrain_vertex>`
            );

        // Inject fragment shader modifications
        shader.fragmentShader = shader.fragmentShader
            .replace(
                `#include <color_pars_fragment>`,
                `#include <color_pars_fragment>\n#include <water_mask_pars_fragment>`
            )
            .replace(
                `#include <color_fragment>`,
                `#include <color_fragment>\n#include <discard_out_range_frag>\n#include <water_mask_compute_color_fragment>`
            );

        // Setup shader defines for feature toggling
        shader.defines = {};
        shader.defines["SHOW_REFLECTIVE_OCEAN"] = false;
        shader.defines["USE_UV"] = true;

        Object.assign(shader.uniforms, this.commonUniform);
        Object.assign(shader.defines, this.defines);
    }

    /**
     * Sets the clip UV transform parameters
     * Used for texture coordinate clamping and clipping
     */
    public set clipUvTransform(value: THREE.Vector3) {
        this.commonUniform.clipUvTransform.value.copy(value);
    }

    /**
     * Sets the image UV transform parameters
     * Used for proper texture mapping and alignment
     */
    public set imageryPatchs(
        value: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }>
    ) {
        value.forEach((item, index) => {
            this.commonUniform.imageryPatchArray.value[index] = item.texture;
            this.commonUniform.imageryPatchTransform.value[index] = item.transform;
        });
        this.commonUniform.imageryPatchCount.value = value.length;
    }

    public setupOverlayerTexture(overlayer?: {
        transform: THREE.Vector4;
        texture: THREE.Texture;
    }): void {
        const USE_OVERLAYER = this.defines.USE_OVERLAYER;
        if (overlayer) {
            this.commonUniform.overlayerImagery.value = overlayer.texture;
            this.commonUniform.overlayerImageryTransform.value = overlayer.transform;
            this.defines.USE_OVERLAYER = true;
        } else {
            this.commonUniform.overlayerImagery.value = null;
            this.commonUniform.overlayerImageryTransform.value = null;
            this.defines.USE_OVERLAYER = false;
        }

        this.needsUpdate = USE_OVERLAYER == this.defines.USE_OVERLAYER;
    }

    /**
     * Sets the water mask translation and scale parameters
     * Controls positioning and scaling of water mask texture
     */
    public set waterMaskTranslationAndScale(value: THREE.Vector4) {
        this.commonUniform.waterMaskTranslationAndScale.value.copy(value);
    }

    /**
     * Sets the water mask noisy translation and scale parameters
     * Controls positioning and scaling of noisy water effect
     */
    public set waterMaskNoisyTranslationAndScale(value: THREE.Vector4) {
        this.commonUniform.waterMaskNoisyTranslationAndScale.value.copy(value);
    }

    /**
     * Sets the water mask texture
     * Used for detecting ocean/sea areas for water rendering
     */
    public set waterMaskTexture(value: THREE.Texture) {
        this.commonUniform.waterMaskTexture.value = value;
    }

    /**
     * Sets the normal sampler texture
     * Used for water surface wave normal mapping effects
     */
    public set normalSampler(value: THREE.Texture) {
        this.commonUniform.normalSampler.value = value;
    }

    /**
     * Sets the current frame number for animation purposes
     * Controls timing of water wave animations
     */
    public set frameNumber(value: number) {
        this.commonUniform.frameNumber.value = value;
    }
 
}

/**
 * Mesh class for rendering quantized terrain data with specialized texture handling
 *
 * This mesh class provides comprehensive support for:
 * - Quantized terrain geometry rendering
 * - Multi-layer texture mapping (imagery, water masks)
 * - UV coordinate transformations for proper texture alignment
 * - Water rendering with animated wave effects
 * - Clip UV functionality for texture clamping
 *
 * The mesh handles both terrain geometry and associated textures, providing a
 * complete solution for 3D terrain visualization.
 */
export class QuantizedMesh extends THREE.Mesh {
    /**
     * Creates a new QuantizedMesh instance
     *
     * @param tileKey - The tile key identifying this mesh
     * @param tileScheme - The tiling scheme used for coordinate calculations
     */
    constructor(
        private readonly selfGeoBox: GeoBox,
        private readonly quantizedTerrainMesh: QuantizedTerrainMesh,
        protected readonly projectionSwitchController: ProjectionSwitchController,
        protected readonly mapView?: MapView
    ) {
        super(undefined, new QuantizedMeshMaterial({ wireframe: false }));
        this.receiveShadow = true;

        this.setupFromQuantizedTerrainMesh(quantizedTerrainMesh);
    }

    /**
     * Sets up the mesh from quantized terrain mesh data
     *
     * This method configures the mesh geometry, transforms, and associated
     * textures from quantized terrain data including:
     * - Geometry and spatial transforms
     * - Parent tile key for clip UV calculations
     * - Water mask data for ocean rendering
     *
     * @param quantizedData - The quantized terrain mesh data
     */
    private setupFromQuantizedTerrainMesh(quantizedData: QuantizedTerrainMesh): void {
        // Apply geometry and spatial transforms
        this.geometry = quantizedData.quantizedGeometry;
        this.position.copy(quantizedData.position);
        this.scale.copy(quantizedData.scale);
        this.quaternion.copy(quantizedData.quaternion);

        // Setup texture coordinate transformations
        this.setupParentTileKey(quantizedData.geoBox);
        this.setupWaterMask(quantizedData);
    }

    /**
     * Sets up the imagery texture for this mesh with proper UV coordinate transformation
     *
     * @param imageryResource - The imagery resource containing tile key and texture
     */
    public setupImageryTexture(
        webTiles: WebTile[],
        webTingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        const material = this.material as QuantizedMeshMaterial;

        const webTilesUnifrom: Array<{
            transform: THREE.Vector4;
            texture: THREE.Texture;
        }> = [];
        webTiles.map(tile => {
            const transform = this.computeTextureUvTransform(
                tile.geoBox,
                webTingScheme,
                quantizedTilingScheme
            );
            if (transform !== false) {
                webTilesUnifrom.push({
                    texture: tile.texture,
                    transform
                });
            }
        });
        // Calculate and set UV transform for proper texture alignment
        material.imageryPatchs = webTilesUnifrom;
    }

    public setupOverlayerTexture(
        groundOverlay: GroundOverlayTextureResource | null,
        webTingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): void {
        const material = this.material as QuantizedMeshMaterial;
        if (groundOverlay) {
            const transform = this.computeTextureUvTransform(
                groundOverlay.geoBox,
                webTingScheme,
                quantizedTilingScheme
            );
            if (transform) {
                material.setupOverlayerTexture({
                    transform,
                    texture: groundOverlay.texture
                });
                return;
            }
        }
        material.setupOverlayerTexture(null);
    }

    /**
     * Sets up the water mask for ocean/sea area rendering with animated wave effects
     *
     * @param waterResource - The water mask resource containing tile key and terrain data
     */
    private setupWaterMask(waterResource: QuantizedTerrainMesh): void {
        // Skip if no water mask data is available
        if (!waterResource.waterMask) return;

        const material = this.material as QuantizedMeshMaterial;

        // Set water mask texture for ocean detection
        material.waterMaskTexture = waterResource.waterMaskTexture;

        // Calculate and set water mask transforms for proper positioning
        const waterGeoBox = GeoBox.fromArray(waterResource.waterMask.geoBox);
        material.waterMaskTranslationAndScale = this._computeWaterMaskTransform(waterGeoBox);

        // Calculate and set noisy water effect transforms
        material.waterMaskNoisyTranslationAndScale = this._computeWaterMaskNoisyTransform(
            this.selfGeoBox
        );
    }

    /**
     * Sets up the parent tile key for clip UV calculations
     * Used to determine texture coordinate clamping boundaries
     *
     * @param parentTileKey - The parent tile key for reference
     */
    private setupParentTileKey(parentGeobox: GeoBox): void {
        const material = this.material as QuantizedMeshMaterial;
        material.clipUvTransform = this._computeClipUvTransform(parentGeobox);
    }
 

    /**
     * Computes the texture UV transform between imagery and quantized tiles
     * Ensures proper alignment and scaling of imagery textures
     *
     * @param imageryTileKey - The imagery tile key for source coordinates
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed UV transform as a Vector4 (scaleX, scaleY, offsetX, offsetY)
     */
    private computeTextureUvTransform(
        imageryGeoBox: GeoBox,
        imageryTilingScheme: TilingScheme,
        quantizedTilingScheme: TilingScheme
    ): THREE.Vector4 | false {
        // 1. 计算投影后的坐标范围
        const quantizedWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.southWest,
                new THREE.Vector3()
            ),
            imageryTilingScheme.projection.projectPoint(
                this.quantizedTerrainMesh.geoBox.northEast,
                new THREE.Vector3()
            )
        );
        const imageryWorldBox = new THREE.Box3(
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.southWest,
                new THREE.Vector3()
            ),
            imageryTilingScheme.projection.projectPoint(
                imageryGeoBox.northEast,
                new THREE.Vector3()
            )
        );

        // 2. 计算缩放比例（保留符号）
        const textureSize = new THREE.Vector2().subVectors(
            imageryWorldBox.max,
            imageryWorldBox.min
        );
        const tileSize = new THREE.Vector2().subVectors(
            quantizedWorldBox.max,
            quantizedWorldBox.min
        );

        const scaleX = tileSize.x / textureSize.x;
        const scaleY = tileSize.y / textureSize.y;

        // 3. 计算偏移量（注意Y轴方向）
        let offsetX;
        let offsetY;
        if (quantizedTilingScheme == geographicTerrainStandardTiling) {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (imageryWorldBox.max.y - quantizedWorldBox.max.y) / textureSize.y; // 反转Y轴
        } else {
            offsetX = (quantizedWorldBox.min.x - imageryWorldBox.min.x) / textureSize.x;
            offsetY = (quantizedWorldBox.min.y - imageryWorldBox.min.y) / textureSize.y; // 反转Y轴
        }

        const transform = new THREE.Vector4(scaleX, scaleY, offsetX, offsetY);

        // 4. 验证变换是否有效
        if (Number.isFinite(transform.length()) && Math.abs(scaleX) > 0 && Math.abs(scaleY) > 0) {
            return transform;
        }
        return false;
    }

    /**
     * Computes the clip UV transform between parent and current tiles
     * Used for texture coordinate clamping to prevent bleeding
     *
     * @param parentTileKey - The parent tile key for reference
     * @param currentTileKey - The current tile key for target coordinates
     * @returns The computed clip UV transform as a Vector3 (scale, offsetX, offsetY)
     */
    private _computeClipUvTransform(parentGeobox: GeoBox): THREE.Vector3 {
        const currentGeobox = this.selfGeoBox;
        // 计算当前瓦片在父瓦片坐标系中的UV范围
        const parentWidth = parentGeobox.longitudeSpan;
        const parentHeight = parentGeobox.latitudeSpan;

        // 计算当前瓦片相对于父瓦片的偏移和缩放
        const uScale = currentGeobox.longitudeSpan / parentWidth;
        const vScale = currentGeobox.latitudeSpan / parentHeight;

        // 计算UV偏移（从父瓦片的西北角到当前瓦片的西北角）
        const uOffset = (currentGeobox.west - parentGeobox.west) / parentWidth;
        const vOffset = (currentGeobox.south - parentGeobox.south) / parentHeight;

        // 合并缩放因子（假设在片段着色器中使用）
        const scale = uScale * vScale;

        return new THREE.Vector3(scale, uOffset, vOffset);
    }

    /**
     * Computes the water mask transform between water and quantized tiles
     * Ensures proper positioning and scaling of water mask textures
     *
     * @param waterGeoBox - The geographic bounding box of the water mask
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed water mask transform as a Vector4 (offsetX, offsetY, scaleX, scaleY)
     */
    private _computeWaterMaskTransform(waterGeoBox: GeoBox): THREE.Vector4 {
        const quantizedGeoBox = this.quantizedTerrainMesh.geoBox;

        const tileWidth = quantizedGeoBox.longitudeSpan;
        const tileHeight = quantizedGeoBox.latitudeSpan;

        const scaleX = tileWidth / waterGeoBox.longitudeSpan;
        const scaleY = tileHeight / waterGeoBox.latitudeSpan;

        return new THREE.Vector4(
            (scaleX * (quantizedGeoBox.west - waterGeoBox.west)) / tileWidth,
            (scaleY * (quantizedGeoBox.south - waterGeoBox.south)) / tileHeight,
            scaleX,
            scaleY
        );
    }

    /**
     * Computes the noisy water mask transform for animated wave effects
     * Provides proper positioning and scaling for water surface animations
     *
     * @param quantizedTileKey - The quantized mesh tile key for target coordinates
     * @param tilingScheme - The tiling scheme for coordinate calculations
     * @returns The computed noisy water mask transform as a Vector4 (offsetX, offsetY, scaleX, scaleY)
     */
    private _computeWaterMaskNoisyTransform(quantizedGeoBox: GeoBox): THREE.Vector4 {
        const tileWidth = quantizedGeoBox.longitudeSpan;
        const tileHeight = quantizedGeoBox.latitudeSpan;

        const scaleX = tileWidth / 180; // Global scaling factor
        const scaleY = tileHeight / 90; // Global scaling factor

        return new THREE.Vector4(
            (scaleX * (quantizedGeoBox.west - 0)) / tileWidth,
            (scaleY * (quantizedGeoBox.south - 0)) / tileHeight,
            scaleX,
            scaleY
        );
    }
}
