/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoCoordinates, type TileKey } from "@flywave/flywave-geoutils";
import { type ElevationProvider } from "@flywave/flywave-mapview";

/**
 * Extended elevation provider interface with additional terrain-specific functionality
 *
 * This interface extends the base ElevationProvider to include methods for retrieving
 * elevation data with additional terrain-specific information such as the tile key
 * that contains the elevation data.
 */
export interface InnerElevationProvider extends ElevationProvider {
    /**
     * Gets the elevation at a specific geographic point along with the tile key
     *
     * This method retrieves the elevation value at the specified geographic coordinates
     * and also returns the tile key of the tile that contains the elevation data.
     * This is useful for terrain applications where knowing which tile provided
     * the elevation data is important for further processing.
     *
     * @param geoPoint - The geographic coordinates to get elevation for
     * @param defaultIfNotLoaded - Default elevation value to return if data is not loaded
     * @param level - Optional level to get elevation at specific zoom level
     * @param ignoreGroundModification - Whether to ignore ground modifications
     * @returns Object containing the elevation value and optionally the tile key
     */
    getHeightWithInTileKey(
        geoPoint: GeoCoordinates,
        defaultIfNotLoaded: number | null,
        level?: number,
        ignoreGroundModification?: boolean
    ): { altitude: number; tileKey?: TileKey };
}
