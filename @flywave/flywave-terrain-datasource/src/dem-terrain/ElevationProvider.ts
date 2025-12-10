/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    GeoCoordinates,
    TileKey,
    TileKeyUtils,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import {
    type TileDisplacementMap,
    ElevationProvider as IElevationProvider
} from "@flywave/flywave-mapview";
import { number as interpolate } from "@flywave/flywave-utils";
import { type DataTexture, type Matrix3, Vector3 } from "three";

import { type InnerElevationProvider } from "../InnerElevationProvider";
import type DEMData from "./dem/DemData";
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
class ElevationProvider implements InnerElevationProvider {
    /**
     * Samples the height at a specific geographic point using a tile displacement map
     *
     * @param geoPoint - The geographic coordinates to sample
     * @param tileDisplacementMap - The tile displacement map to use for sampling
     * @returns The elevation at the specified point
     */
    sampleHeight(geoPoint: GeoCoordinates, tileDisplacementMap: TileDisplacementMap): number {
        return this.getAtPointOrZero(geoPoint);
    }

    /**
     * Creates a new elevation provider
     *
     * @param dataSource - The DEM terrain data source to use for elevation data
     */
    constructor(private readonly dataSource: DEMTerrainSource) { }

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
    getHeightWithInTileKey(
        geoPoint: GeoCoordinates,
        defaultIfNotLoaded: number | null = null,
        level?: number,
        ignoreGroundModification?: boolean
    ): { altitude: number; tileKey: TileKey } {
        if (!this.dataSource) {
            return { altitude: defaultIfNotLoaded, tileKey: undefined };
        }

        let normaledGeoPoint = new GeoCoordinates(geoPoint.latitude, geoPoint.longitude  - 360 * Math.floor((geoPoint.longitude + 180) / 360));

        const minLevel = this.dataSource.dataProvider().getMinZoom();
        level = Math.max(minLevel, level || minLevel);

        const demTile = this.dataSource
            .dataProvider()
            .getBestAvailableResourceTile(
                TileKeyUtils.geoCoordinatesToTileKey(
                    webMercatorTerrainTilingScheme,
                   normaledGeoPoint,
                    Math.max(level, this.dataSource.dataProvider().getMaxZoom())
                ), false
            );

        if (!(demTile && demTile.resource)) {
            return { altitude: defaultIfNotLoaded, tileKey: undefined };
        }

        const point = webMercatorTerrainTilingScheme.projection.projectPoint(normaledGeoPoint);

        point.x /= webMercatorTerrainTilingScheme.projection.unitScale;
        point.y /= webMercatorTerrainTilingScheme.projection.unitScale;

        const dem: DEMData = demTile.resource.demData;
        const wrap = Math.floor(point.x);
        const px = point.x - wrap;

        const tilesAtTileZoom = 1 << demTile.tileKey.level;
        const x = (px * tilesAtTileZoom - demTile.tileKey.column) * dem.dim;
        const y = (point.y * tilesAtTileZoom - demTile.tileKey.row) * dem.dim;
        const i = Math.floor(x);
        const j = Math.floor(y);

        return {
            altitude: interpolate(
                interpolate(
                    dem.get(i, j, undefined, ignoreGroundModification),
                    dem.get(i, j + 1, undefined, ignoreGroundModification),
                    y - j
                ),
                interpolate(
                    dem.get(i + 1, j, undefined, ignoreGroundModification),
                    dem.get(i + 1, j + 1, undefined, ignoreGroundModification),
                    y - j
                ),
                x - i
            ),
            tileKey: demTile.tileKey
        };
    }

    /**
     * Helper around `getAtPoint` that guarantees that a numeric value is returned.
     *
     * @param point - Geographic coordinate of the point
     * @param defaultIfNotLoaded - Value that is returned if the dem tile of the provided point is not loaded
     * @param level - Optional zoom level to query
     * @returns Altitude in meters
     */
    private getAtPointOrZero(
        point: GeoCoordinates,
        defaultIfNotLoaded: number = 0,
        level?: number
    ): number {
        return this.getAtPoint(point, defaultIfNotLoaded, level) || 0;
    }

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
    private getAtPoint(
        geoPoint: GeoCoordinates,
        defaultIfNotLoaded: number | null = null,
        level?: number
    ): number | null {
        const { altitude } = this.getHeightWithInTileKey(geoPoint, defaultIfNotLoaded, level);
        return altitude;
    }

    /**
     * Get elevation for a given geo point.
     *
     * @param geoPoint - Geographic position to query height for
     * @param level - Optional data level that should be used for getting the elevation
     *              If undefined, the view's visible tile containing the point will be used
     * @returns The height at geoPoint or 0 if no tile was found that covers the geoPoint
     */
    getHeight(geoPoint: GeoCoordinates, level?: number): number {
        return this.getAtPointOrZero(geoPoint, 0, level);
    }

    /**
     * Cast a ray through the given screen position x, y.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio)
     * @param y - The Y position in css/client coordinates (without applied display ratio)
     * @returns World coordinate of the intersection or undefined if no intersection detected
     */
    rayCast(x: number, y: number): Vector3 | undefined {
        // Implement ray casting logic here
        return undefined;
    }

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
    private computeDisplacementMapPos(tileKey: TileKey, demTileKey: TileKey) {
        tileKey = TileKey.fromRowColumnLevel(
            (1 << tileKey.level) - 1 - tileKey.row,
            tileKey.column,
            tileKey.level
        );
        let ah = 1;
        let H = tileKey.level;
        let ae = tileKey.row;
        let J = tileKey.column;

        for (; H > demTileKey.level; H--) {
            ah *= 2;
            ae >>= 1;
            J >>= 1;
        }
        const P = 1 / ah;

        return new Vector3(P, (tileKey.column - J * ah) * P, (tileKey.row - ae * ah) * P);
    }

    /**
     * Get the displacement map for a given tile key. If the displacement map for the given tileKey
     * is not in the cache a lower level tile will be returned.
     *
     * @param tileKey - The tile to get the displacement map for
     * @returns Returns the DisplacementMap for the given tileKey or a lower level tile. Undefined
     *          if the tile or no parent is in the cache.
     */
    getDisplacementMap(tileKey: TileKey): DisplacementMap | undefined {
        if (!this.dataSource) {
            return undefined;
        }

        // const tileDem = this.dataSource.dataProvider().getBestAvailableResourceTile(tileKey);

        // if (!(tileDem && tileDem.resource.demData.displacementMapTexture)) {
        //     return undefined;
        // }

        // let transform = this.computeDisplacementMapPos(tileKey, tileDem.tileKey);
        // return {
        //     tileKey,
        //     displacementMap: {
        //         xCountVertices: tileDem.resource.demData.displacementMapTexture.width,
        //         yCountVertices: tileDem.resource.demData.displacementMapTexture.height,
        //         buffer: tileDem.resource.demData.displacementMap
        //     },
        //     texture: tileDem.resource.demData.displacementMapTexture,
        //     uvMatrix: new Matrix3().setUvTransform(
        //         transform.y,
        //         transform.z,
        //         transform.x,
        //         transform.x,
        //         0,
        //         0,
        //         0
        //     ),
        //     geoBox: this.dataSource.getTilingScheme().getGeoBox(tileDem.tileKey)
        // };
    }

    /**
     * Gets the tiling scheme used for displacement maps
     *
     * @returns The tiling scheme used for the DisplacementMaps returned by [[getDisplacementMap]]
     * or undefined if there is no elevation data source attached
     */
    getTilingScheme(): typeof webMercatorTerrainTilingScheme | undefined {
        return this.dataSource ? webMercatorTerrainTilingScheme : undefined;
    }

    /**
     * Clears the internal cache
     *
     * This method would clear any cached elevation data, though the implementation
     * is currently empty as the provider doesn't maintain a separate cache.
     */
    clearCache(): void {
        // Implement cache clearing logic here
    }
}

export { ElevationProvider };
