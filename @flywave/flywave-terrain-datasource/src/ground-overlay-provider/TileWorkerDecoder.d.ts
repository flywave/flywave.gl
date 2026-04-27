import { type GeoBoxArray } from "@flywave/flywave-geoutils";
import { type GroundOverlayTextureJSON } from "./GroundOverlayTexture";
/**
 * Processes ground overlay data for a specific tile
 *
 * This function takes serialized ground overlay data and processes it
 * to generate the appropriate texture data for a specific map tile.
 * It deserializes the overlay textures and renders them within the
 * specified geographic bounding box.
 *
 * @param data - The serialized ground overlay data to process
 * @param data.overlays - Array of serialized ground overlay textures
 * @param data.geoBox - Geographic bounding box of the tile as an array
 * @param data.flipY - Whether to flip the Y axis when rendering
 * @returns The rendered ground overlay image data
 */
export declare function processGroundOverlayTile(data: {
    overlays: GroundOverlayTextureJSON[];
    geoBox: GeoBoxArray;
    flipY: boolean;
}): ImageData;
