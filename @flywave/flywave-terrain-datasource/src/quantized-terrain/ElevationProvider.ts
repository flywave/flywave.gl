/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TileKey,
    type TilingScheme,
    GeoCoordinates,
    OrientedBox3,
    TileKeyUtils
} from "@flywave/flywave-geoutils";
import {
    type TileDisplacementMap,
    ElevationProvider as IElevationProvider,
    TERRAIN_ZOOM_LEVEL
} from "@flywave/flywave-mapview";
import { type Vector3 } from "three";

import { type InnerElevationProvider } from "../InnerElevationProvider";
import { type BaseQuantizedTerrainSource } from "./BaseQuantizedTerrainSource";
import { type QuantizedTileResource } from "./QuantizedTileResource";

/**
 * Elevation provider for quantized terrain data
 *
 * This class implements the InnerElevationProvider interface to provide
 * elevation data from quantized terrain tiles. It can sample heights at
 * specific geographic coordinates and provides methods for displacement
 * map generation.
 *
 * The provider traverses the tile hierarchy to find the best available
 * elevation data for a given point, starting from the highest resolution
 * and working its way up to lower resolution parent tiles if needed.
 */
export class ElevationProvider implements InnerElevationProvider {
    /**
     * Creates a new elevation provider for quantized terrain data
     *
     * @param dataSource - The quantized terrain data source to use for elevation data
     */
    constructor(private readonly dataSource: BaseQuantizedTerrainSource<QuantizedTileResource>) {}

    /**
     * Samples the height at a specific geographic point using a tile displacement map
     *
     * @param geoPoint - The geographic coordinates to sample
     * @param tileDisplacementMap - The tile displacement map to use for sampling
     * @returns The elevation at the specified point
     */
    sampleHeight(geoPoint: GeoCoordinates, tileDisplacementMap: TileDisplacementMap): number {
        throw new Error("Method not implemented.");
    }

    /**
     * Gets the elevation at a specific geographic point along with the tile key
     *
     * This method retrieves the elevation value at the specified geographic coordinates
     * and also returns the tile key of the tile that contains the elevation data.
     * It traverses the tile hierarchy to find the best available data.
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
        if (!this.dataSource.dataProvider().layerStrategy.getAvailability()) {
            return { altitude: defaultIfNotLoaded, tileKey: undefined };
        }
        let normaledGeoPoint = new GeoCoordinates(geoPoint.latitude, geoPoint.longitude  - 360 * Math.floor((geoPoint.longitude + 180) / 360));

        let tk = TileKeyUtils.geoCoordinatesToTileKey(
            this.dataSource.getTilingScheme(),
            normaledGeoPoint,
            this.dataSource.dataProvider().layerStrategy.getAvailability().maximumLevel
        );
        if (parent) {
            while (tk.level >= level) {
                const tile = this.dataSource.dataProvider().getPreciseResource(tk);
                if (tile && tile.demMap) {
                    const { southWest, longitudeSpan, latitudeSpan } = this.dataSource
                        .getTilingScheme()
                        .getGeoBox(tk);

                    const x = (normaledGeoPoint.lng - southWest.lng) / longitudeSpan;
                    const y = (normaledGeoPoint.lat - southWest.lat) / latitudeSpan;
                    return {
                        altitude:
                            tile?.demMap?.getByScale(x, y, ignoreGroundModification) ||
                            defaultIfNotLoaded,
                        tileKey: tk
                    };

                    break;
                }
                if (tk.level == 0) break;
                tk = tk.parent();
            }
        }

        return { altitude: defaultIfNotLoaded, tileKey: undefined };
    }

    /**
     * Casts a ray through the given screen position to find intersection with terrain
     *
     * @param x - The X position in css/client coordinates (without applied display ratio)
     * @param y - The Y position in css/client coordinates (without applied display ratio)
     * @returns World coordinate of the intersection or undefined if no intersection detected
     */
    rayCast(x: number, y: number): Vector3 | undefined {
        throw new Error("Method not implemented.");
    }

    /**
     * Gets the displacement map for a given tile key
     *
     * This method retrieves the displacement map for a specific tile, which
     * contains elevation data that can be used for terrain rendering and
     * other elevation-based calculations.
     *
     * @param tileKey - The tile key to get the displacement map for
     * @returns The displacement map or undefined if not available
     */
    getDisplacementMap(tileKey: TileKey): TileDisplacementMap | undefined {
        const tile = this.getBestAvailableTile(tileKey);

        if (!tile) return undefined;

        const { width, height } = tile.resource.demMap.getDisplacementMap();
        return {
            tileKey,
            texture: tile.resource.demMap.getDisplacementMap(),
            displacementMap: {
                xCountVertices: width,
                yCountVertices: height,
                buffer: new Float32Array(tile.resource.demMap.getDisplacementMapBuffer().buffer)
            },
            geoBox: this.dataSource.getTilingScheme().getGeoBox(tileKey)
        };
    }

    /**
     * Gets the tiling scheme used by this elevation provider
     *
     * @returns The tiling scheme or undefined if no data source is attached
     */
    getTilingScheme(): TilingScheme | undefined {
        return this.dataSource.getTilingScheme();
    }

    /**
     * Clears the internal cache
     *
     * This method would clear any cached elevation data, though the implementation
     * is currently empty as the provider doesn't maintain a separate cache.
     */
    clearCache(): void {}

    /**
     * Helper around `getAtPoint` that guarantees that a numeric value is returned
     *
     * @param point - Geographic coordinate of the point
     * @param defaultIfNotLoaded - Value that is returned if the terrain tile of the provided point is not loaded
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
     * Gets the best available tile for the specified tile key
     *
     * This method retrieves the best available quantized terrain tile for
     * the specified tile key, searching up the tile hierarchy if needed.
     *
     * @param tk - The tile key to get the best available tile for
     * @returns Object containing the tile key and resource, or undefined if not available
     */
    private getBestAvailableTile(tk: TileKey): {
        tileKey: TileKey;
        resource: QuantizedTileResource;
    } {
        return this.dataSource.dataProvider().getBestAvailableResourceTile(tk, false);
    }

    /**
     * Altitude above sea level in meters at specified point
     *
     * @param geoPoint - Geographic coordinate of the point
     * @param defaultIfNotLoaded - Value that is returned if the terrain tile of the provided point is not loaded
     * @param level - Optional zoom level to query
     * @param ignoreGroundModification - Whether to ignore ground modifications
     * @returns Altitude in meters, or null if no data is available
     * If there is no loaded tile that carries information for the requested
     * point elevation, returns `defaultIfNotLoaded`.
     * Doesn't invoke network request to fetch the data.
     */
    private getAtPoint(
        geoPoint: GeoCoordinates,
        defaultIfNotLoaded?: number | null,
        level?: number,
        ignoreGroundModification?: boolean
    ): number | null {
        return this.getHeightWithInTileKey(
            geoPoint,
            defaultIfNotLoaded,
            level,
            ignoreGroundModification
        ).altitude;
    }

    /**
     * Get elevation for a given geo point
     *
     * @param geoPoint - Geographic position to query height for
     * @param level - Data level that should be used for getting the elevation
     *              Defaults to TERRAIN_ZOOM_LEVEL if undefined
     * @returns The height at geoPoint or 0 if no tile was found that covers the geoPoint
     */
    getHeight(geoPoint: GeoCoordinates, level: number = TERRAIN_ZOOM_LEVEL): number {
        return this.getAtPointOrZero(geoPoint, 0, level);
    }
}
