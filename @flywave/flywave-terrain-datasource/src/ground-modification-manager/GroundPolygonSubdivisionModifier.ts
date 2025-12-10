/* Copyright (C) 2025 flywave.gl contributors */

import { TerrainAdaptedSubdivisionModifier } from "@flywave/flywave-geometry/TerrainAdaptedSubdivisionModifier";
import { type GeoCoordinates, type Projection } from "@flywave/flywave-geoutils";
import { type ElevationProvider } from "@flywave/flywave-mapview";

import { type InnerElevationProvider } from "../InnerElevationProvider";

/**
 * Subdivision modifier options interface
 *
 * This interface defines the configuration options for the subdivision modifier,
 * which controls how polygon edges are subdivided based on terrain elevation data.
 */
interface SubdivisionModifierOptions {
    /**
     * Interpolation distance (meters), controls how often to interpolate points
     *
     * This parameter determines the maximum distance between interpolated points
     * along polygon edges. Smaller values result in more detailed geometry that
     * better follows the terrain, while larger values produce simpler geometry.
     */
    interpolationDistance?: number;
}

/**
 * Elevation-based polygon subdivision modifier implementation for ground side walls
 *
 * This class extends the TerrainAdaptedSubdivisionModifier to provide elevation-aware
 * subdivision of polygon edges for ground side wall generation. It queries the
 * terrain elevation data to create geometry that follows the natural terrain contours.
 */
export class ElevationBasedPolygonSubdivisionModifier extends TerrainAdaptedSubdivisionModifier {
    /**
     * Creates an elevation-based polygon subdivision modifier
     *
     * @param projection - Map projection system used for coordinate transformations
     * @param elevationProvider - Provider for elevation data to query terrain heights
     * @param options - Subdivision configuration options
     */
    constructor(
        projection: Projection,
        private readonly elevationProvider: ElevationProvider,
        options: SubdivisionModifierOptions
    ) {
        super(projection, options.interpolationDistance);
    }

    /**
     * Retrieves elevation data for a geographic point
     *
     * This method queries the elevation provider to get the height of the terrain
     * at the specified geographic coordinates. It first attempts to use the
     * InnerElevationProvider interface for more detailed information, falling
     * back to the standard getHeight method if that's not available.
     *
     * @param geoPoint - Geographic coordinates to query for elevation
     * @returns Elevation value in meters, or undefined if unavailable
     */
    protected getElevation(geoPoint: GeoCoordinates): number | undefined {
        try {
            // Check if elevation provider implements InnerElevationProvider interface
            if (
                typeof (this.elevationProvider as InnerElevationProvider).getHeightWithInTileKey ===
                "function"
            ) {
                const elevationData = (
                    this.elevationProvider as InnerElevationProvider
                ).getHeightWithInTileKey(geoPoint, null, undefined, true);
                return elevationData?.altitude ?? undefined;
            } else {
                // Fallback to standard getHeight method
                return this.elevationProvider.getHeight(geoPoint);
            }
        } catch (error) {
            console.warn("Failed to get elevation for point:", geoPoint, error);
            return undefined;
        }
    }
}
