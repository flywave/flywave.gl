/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox } from "@flywave/flywave-geoutils";
import * as THREE from "three";

import { type GroundOverlayTexture } from "../../ground-overlay-provider/GroundOverlayTexture";
import { type RenderEnvironment, getGlobalRenderEnvironment } from "../core/RenderEnvironment";
import { type RenderOptions } from "../core/types";
import { CoordinateUtils } from "../utils/coordinate-utils";
import { GeometryUtils } from "../utils/geometry-utils";

/**
 * Ground overlay processor class
 *
 * This class is responsible for rendering ground overlay textures onto map tiles.
 * It handles the conversion of geographic overlay data into rendered image data
 * that can be used for terrain visualization with overlaid imagery.
 */
export class GroundOverlayProcessor {
    /** The rendering environment to use for overlay generation */
    private environment?: RenderEnvironment;

    /**
     * Creates a new ground overlay processor
     *
     * @param environment - Optional rendering environment to use
     */
    constructor(environment?: RenderEnvironment) {
        this.environment = environment;
    }

    /**
     * Renders ground overlay textures onto a map tile
     *
     * This method takes an array of ground overlay textures and renders them
     * onto a specific map tile defined by its geographic bounding box. The
     * resulting image data can be used as an overlay on the terrain surface.
     *
     * @param overlays - Array of ground overlay textures to render
     * @param tileGeoBox - Geographic bounding box of the target tile
     * @param options - Rendering options including width, height, and Y-axis flipping
     * @returns ImageData containing the rendered overlay
     */
    renderGroundOverlays(
        overlays: GroundOverlayTexture[],
        tileGeoBox: GeoBox,
        options: RenderOptions = {}
    ): ImageData {
        const { width = 256, height = 256, flipY = true } = options;
        const renderEnvironment = this.environment || getGlobalRenderEnvironment();

        renderEnvironment.clearScene();

        const worldGeobox = CoordinateUtils.createBoundingBoxForCoordinates(overlays);
        const southWest = CoordinateUtils.geoToTileSpace(
            tileGeoBox.southWest,
            worldGeobox,
            width,
            height
        );
        const northEast = CoordinateUtils.geoToTileSpace(
            tileGeoBox.northEast,
            worldGeobox,
            width,
            height
        );

        if (flipY) {
            renderEnvironment.setupCamera(southWest.x, northEast.x, southWest.y, northEast.y);
        } else {
            renderEnvironment.setupCamera(southWest.x, northEast.x, northEast.y, southWest.y);
        }

        for (const overlay of overlays) {
            this.createOverlayMesh(overlay, worldGeobox, width, height, renderEnvironment);
        }

        const data = renderEnvironment.render(width, height);
        return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height);
    }

    /**
     * Creates a mesh for a ground overlay
     *
     * This method creates a Three.js mesh for a specific ground overlay texture,
     * setting up the appropriate geometry and material based on the overlay's
     * geographic area and texture properties.
     *
     * @param overlay - The ground overlay texture to create a mesh for
     * @param worldGeobox - The overall geographic bounding box of all overlays
     * @param width - The rendering width
     * @param height - The rendering height
     * @param renderEnvironment - The rendering environment to add the mesh to
     */
    private createOverlayMesh(
        overlay: GroundOverlayTexture,
        worldGeobox: GeoBox,
        width: number,
        height: number,
        renderEnvironment: RenderEnvironment
    ): void {
        const { geometry, position } = GeometryUtils.createGeometryForGeoArea(
            overlay.geoArea,
            worldGeobox,
            width,
            height
        );

        const material = new THREE.MeshBasicMaterial({
            map: overlay.texture,
            transparent: true,
            opacity: overlay.opacity ?? 1.0,
            side: THREE.BackSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(position.x, position.y, 0);
        renderEnvironment.getScene().add(mesh);
        mesh.frustumCulled = false;
    }

    /**
     * Sets the rendering environment
     *
     * @param environment - The rendering environment to use
     */
    setEnvironment(environment: RenderEnvironment): void {
        this.environment = environment;
    }

    /**
     * Gets the current rendering environment
     *
     * @returns The current rendering environment or undefined if not set
     */
    getEnvironment(): RenderEnvironment | undefined {
        return this.environment;
    }
}

/**
 * Renders ground overlay textures onto a map tile
 *
 * This function provides a convenient way to render ground overlays without
 * explicitly creating a GroundOverlayProcessor instance. It creates a temporary
 * processor and uses it to render the overlays.
 *
 * @param overlays - Array of ground overlay textures to render
 * @param tileGeoBox - Geographic bounding box of the target tile
 * @param flipY - Whether to flip the Y axis during rendering
 * @param width - The rendering width (default: 1024)
 * @param height - The rendering height (default: 1024)
 * @returns ImageData containing the rendered overlay
 */
export function renderGroundOverlays(
    overlays: GroundOverlayTexture[],
    tileGeoBox: GeoBox,
    flipY: boolean = true,
    width: number = 1024,
    height: number = 1024
): ImageData {
    const processor = new GroundOverlayProcessor();
    return processor.renderGroundOverlays(overlays, tileGeoBox, { width, height, flipY });
}
