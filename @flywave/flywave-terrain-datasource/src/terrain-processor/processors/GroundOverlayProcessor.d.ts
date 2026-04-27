import { type GeoBox } from "@flywave/flywave-geoutils";
import { type GroundOverlayTexture } from "../../ground-overlay-provider/GroundOverlayTexture";
import { type RenderEnvironment } from "../core/RenderEnvironment";
import { type RenderOptions } from "../core/types";
/**
 * Ground overlay processor class
 *
 * This class is responsible for rendering ground overlay textures onto map tiles.
 * It handles the conversion of geographic overlay data into rendered image data
 * that can be used for terrain visualization with overlaid imagery.
 */
export declare class GroundOverlayProcessor {
    /** The rendering environment to use for overlay generation */
    private environment?;
    /**
     * Creates a new ground overlay processor
     *
     * @param environment - Optional rendering environment to use
     */
    constructor(environment?: RenderEnvironment);
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
    renderGroundOverlays(overlays: GroundOverlayTexture[], tileGeoBox: GeoBox, options?: RenderOptions): ImageData;
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
    private createOverlayMesh;
    /**
     * Sets the rendering environment
     *
     * @param environment - The rendering environment to use
     */
    setEnvironment(environment: RenderEnvironment): void;
    /**
     * Gets the current rendering environment
     *
     * @returns The current rendering environment or undefined if not set
     */
    getEnvironment(): RenderEnvironment | undefined;
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
export declare function renderGroundOverlays(overlays: GroundOverlayTexture[], tileGeoBox: GeoBox, flipY?: boolean, width?: number, height?: number): ImageData;
