import { type GeoBox, GeoCoordinates, TileKey, webMercatorTerrainTilingScheme } from "@flywave/flywave-geoutils";
import { type TileDisplacementMap } from "@flywave/flywave-mapview";
import { type DataTexture, type Matrix3, Vector3 } from "three";
import { type InnerElevationProvider } from "../InnerElevationProvider";
import { type DEMTerrainSource } from "./DEMTerrainSource";
/**
 * Interface representing a displacement map for terrain rendering
 *
 * This interface defines the structure of a displacement map that can be
 * used for terrain rendering, including the tile key, displacement data,
 * texture, UV transformation matrix, and geographic bounds.
 */
export interface DisplacementMap {
    /** The tile key for this displacement map */
    tileKey: TileKey;
    /** The displacement map data */
    displacementMap: {
        /** Number of vertices in the X direction */
        xCountVertices: number;
        /** Number of vertices in the Y direction */
        yCountVertices: number;
        /** The displacement buffer data */
        buffer: Float32Array<ArrayBufferLike>;
    };
    /** The texture containing the displacement data */
    texture: DataTexture;
    /** The UV transformation matrix */
    uvMatrix: Matrix3;
    /** The geographic bounding box of this displacement map */
    geoBox: GeoBox;
}
/**
 * Elevation provider for DEM (Digital Elevation Model) terrain data
 *
 * This class implements the InnerElevationProvider interface to provide
 * elevation data from DEM tiles. It can sample heights at specific geographic
 * coordinates and provides methods for ray casting and displacement map generation.
 */
declare class ElevationProvider implements InnerElevationProvider {
    private readonly dataSource;
    /**
     * Samples the height at a specific geographic point using a tile displacement map
     *
     * @param geoPoint - The geographic coordinates to sample
     * @param tileDisplacementMap - The tile displacement map to use for sampling
     * @returns The elevation at the specified point
     */
    sampleHeight(geoPoint: GeoCoordinates, tileDisplacementMap: TileDisplacementMap): number;
    /**
     * Creates a new elevation provider
     *
     * @param dataSource - The DEM terrain data source to use for elevation data
     */
    constructor(dataSource: DEMTerrainSource);
    /**
     * Gets the elevation at a specific geographic point along with the tile key
     *
     * This method retrieves the elevation value at the specified geographic coordinates
     * and also returns the tile key of the tile that contains the elevation data.
     *
     * @param geoPoint - The geographic coordinates to get elevation for
     * @param defaultIfNotLoaded - Default elevation value to return if data is not loaded
     * @param level - Optional level to get elevation at specific zoom level
     * @param ignoreGroundModification - Whether to ignore ground modifications
     * @returns Object containing the elevation value and optionally the tile key
     */
    getHeightWithInTileKey(geoPoint: GeoCoordinates, defaultIfNotLoaded?: number | null, level?: number, ignoreGroundModification?: boolean): {
        altitude: number;
        tileKey: TileKey;
    };
    /**
     * Helper around `getAtPoint` that guarantees that a numeric value is returned.
     *
     * @param point - Geographic coordinate of the point
     * @param defaultIfNotLoaded - Value that is returned if the dem tile of the provided point is not loaded
     * @param level - Optional zoom level to query
     * @returns Altitude in meters
     */
    private getAtPointOrZero;
    /**
     * Altitude above sea level in meters at specified point.
     *
     * @param geoPoint - Geographic coordinate of the point
     * @param defaultIfNotLoaded - Value that is returned if the DEM tile of the provided point is not loaded
     * @param level - Optional zoom level to query
     * @returns Altitude in meters, or null if no data is available
     * If there is no loaded tile that carries information for the requested
     * point elevation, returns `defaultIfNotLoaded`.
     * Doesn't invoke network request to fetch the data.
     */
    private getAtPoint;
    /**
     * Get elevation for a given geo point.
     *
     * @param geoPoint - Geographic position to query height for
     * @param level - Optional data level that should be used for getting the elevation
     *              If undefined, the view's visible tile containing the point will be used
     * @returns The height at geoPoint or 0 if no tile was found that covers the geoPoint
     */
    getHeight(geoPoint: GeoCoordinates, level?: number): number;
    /**
     * Cast a ray through the given screen position x, y.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio)
     * @param y - The Y position in css/client coordinates (without applied display ratio)
     * @returns World coordinate of the intersection or undefined if no intersection detected
     */
    rayCast(x: number, y: number): Vector3 | undefined;
    /**
     * Computes the displacement map position parameters
     *
     * This method calculates the scaling and offset parameters needed to
     * properly sample a displacement map from a DEM tile for a specific tile.
     *
     * @param tileKey - The tile key for the target tile
     * @param demTileKey - The tile key for the DEM tile containing the displacement data
     * @returns A Vector3 containing the scaling and offset parameters
     */
    private computeDisplacementMapPos;
    /**
     * Get the displacement map for a given tile key. If the displacement map for the given tileKey
     * is not in the cache a lower level tile will be returned.
     *
     * @param tileKey - The tile to get the displacement map for
     * @returns Returns the DisplacementMap for the given tileKey or a lower level tile. Undefined
     *          if the tile or no parent is in the cache.
     */
    getDisplacementMap(tileKey: TileKey): DisplacementMap | undefined;
    /**
     * Gets the tiling scheme used for displacement maps
     *
     * @returns The tiling scheme used for the DisplacementMaps returned by [[getDisplacementMap]]
     * or undefined if there is no elevation data source attached
     */
    getTilingScheme(): typeof webMercatorTerrainTilingScheme | undefined;
    /**
     * Clears the internal cache
     *
     * This method would clear any cached elevation data, though the implementation
     * is currently empty as the provider doesn't maintain a separate cache.
     */
    clearCache(): void;
}
export { ElevationProvider };
