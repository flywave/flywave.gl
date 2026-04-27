import { TerrainAdaptedSubdivisionModifier } from "@flywave/flywave-geometry/TerrainAdaptedSubdivisionModifier";
import { type GeoCoordinates, type Projection } from "@flywave/flywave-geoutils";
import { type ElevationProvider } from "@flywave/flywave-mapview";
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
export declare class ElevationBasedPolygonSubdivisionModifier extends TerrainAdaptedSubdivisionModifier {
    private readonly elevationProvider;
    /**
     * Creates an elevation-based polygon subdivision modifier
     *
     * @param projection - Map projection system used for coordinate transformations
     * @param elevationProvider - Provider for elevation data to query terrain heights
     * @param options - Subdivision configuration options
     */
    constructor(projection: Projection, elevationProvider: ElevationProvider, options: SubdivisionModifierOptions);
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
    protected getElevation(geoPoint: GeoCoordinates): number | undefined;
}
export {};
