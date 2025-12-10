/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBoxArray, GeoBox } from "@flywave/flywave-geoutils";

import { renderGroundOverlays } from "../terrain-processor";
import {
    type GroundOverlayTextureJSON,
    deserializeGroundOverlayTexture
} from "./GroundOverlayTexture";

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
export function processGroundOverlayTile(data: {
    overlays: GroundOverlayTextureJSON[];
    geoBox: GeoBoxArray;
    flipY: boolean;
}) {
    const overlays = data.overlays.map(deserializeGroundOverlayTexture);
    const geoBox = GeoBox.fromArray(data.geoBox);

    return renderGroundOverlays(overlays, geoBox, true);
}
