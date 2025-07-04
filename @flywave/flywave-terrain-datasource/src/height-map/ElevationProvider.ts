import {
    GeoBox,
    GeoCoordinates,
    TileKey,
    TileKeyUtils,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";
import { number as interpolate } from "@flywave/flywave-utils";
import { DataTexture, Matrix3 } from "three";

import DEMData from "./dem/DemData";
import { HeightMapSource } from "./HeightMapSource";

export interface DisplacementMap {
    tileKey: TileKey;
    displacementMap: {
        xCountVertices: number;
        yCountVertices: number;
        buffer: Float32Array<ArrayBufferLike>;
    };
    texture: DataTexture;
    uvMatrix: Matrix3;
    geoBox: GeoBox;
}

class ElevationProvider {
    private dataSource: HeightMapSource | null = null;

    bindDataSource(dataSource: HeightMapSource): void {
        this.dataSource = dataSource;
    }

    /**
     * Helper around `getAtPoint` that guarantees that a numeric value is returned.
     * @param point Mercator coordinate of the point.
     * @param defaultIfNotLoaded Value that is returned if the dem tile of the provided point is not loaded.
     * @returns Altitude in meters.
     */
    getAtPointOrZero(point: GeoCoordinates, defaultIfNotLoaded: number = 0): number {
        return this.getAtPoint(point, defaultIfNotLoaded) || 0;
    }

    /**
     * Altitude above sea level in meters at specified point.
     * @param geoPoint Mercator coordinate of the point.
     * @param defaultIfNotLoaded Value that is returned if the DEM tile of the provided point is not loaded.
     * @returns Altitude in meters.
     * If there is no loaded tile that carries information for the requested
     * point elevation, returns `defaultIfNotLoaded`.
     * Doesn't invoke network request to fetch the data.
     */
    getAtPoint(geoPoint: GeoCoordinates, defaultIfNotLoaded: number | null = null): number | null {
        if (!this.dataSource) {
            return defaultIfNotLoaded;
        }

        const demTile = this.dataSource
            .dataProvider()
            .getNeareastDemTile(
                TileKeyUtils.geoCoordinatesToTileKey(
                    webMercatorTilingScheme,
                    geoPoint,
                    this.dataSource.dataProvider().getMaxZoom()
                )
            );

        if (!(demTile && demTile.dem)) {
            return defaultIfNotLoaded;
        }

        const point = webMercatorTilingScheme.projection.projectPoint(geoPoint);

        point.x /= webMercatorTilingScheme.projection.unitScale;
        point.y /= webMercatorTilingScheme.projection.unitScale;

        const dem: DEMData = demTile.dem;
        const wrap = Math.floor(point.x);
        const px = point.x - wrap;

        const tilesAtTileZoom = 1 << demTile.tileKey.level;
        const x = (px * tilesAtTileZoom - demTile.tileKey.column) * dem.dim;
        const y = (point.y * tilesAtTileZoom - demTile.tileKey.row) * dem.dim;
        const i = Math.floor(x);
        const j = Math.floor(y);

        return (
            interpolate(
                interpolate(dem.get(i, j), dem.get(i, j + 1), y - j),
                interpolate(dem.get(i + 1, j), dem.get(i + 1, j + 1), y - j),
                x - i
            ) -
            this.dataSource.overlayerHeightMapTexture.getDigAltitude(
                geoPoint.longitude,
                geoPoint.latitude
            )
        );
    }

    /**
     * Get elevation for a given geo point.
     * @param geoPoint - geo position to query height for.
     * @param level - Optional data level that should be used for getting the elevation.
     *              If undefined, the view's visible tile containing the point will be used.
     * @returns The height at geoPoint or undefined if no tile was found that covers the geoPoint.
     */
    getHeight(geoPoint: GeoCoordinates, level?: number): number {
        return this.getAtPointOrZero(geoPoint, 0);
    }

    /**
     * Cast a ray through the given screen position x, y.
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     * @returns World coordinate of the intersection or undefined if no intersection detected.
     */
    rayCast(x: number, y: number): any | undefined {
        // Implement ray casting logic here
        return undefined;
    }

    /**
     * Get the displacement map for a given tile key. If the displacement map for the given tileKey
     * is not in the cache a lower level tile will be returned.
     * @param tileKey - The tile to get the displacement map for.
     * @returns Returns the DisplacementMap for the given tileKey or a lower level tile. Undefined
     *          if the tile or no parent is in the cache.
     */
    getDisplacementMap(tileKey: TileKey): DisplacementMap | undefined {
        if (!this.dataSource) {
            return undefined;
        }

        const tileDem = this.dataSource.dataProvider().getNeareastDisplacementMap(tileKey);

        if (!(tileDem && tileDem.displacementMap)) {
            return undefined;
        }

        return {
            tileKey,
            displacementMap: {
                xCountVertices: tileDem.displacementMap.width,
                yCountVertices: tileDem.displacementMap.height,
                buffer: tileDem.displacementMap
            },
            texture: tileDem.displacementMap,
            uvMatrix: tileDem.uvMatrix,
            geoBox: this.dataSource.getTilingScheme().getGeoBox(tileDem.tile.tileKey)
        };
    }

    /**
     * @returns the TilingScheme used for the DisplacementMaps returned by [[getDisplacementMap]]
     * or undefined if there is no elevation {@link DataSource} attached to the {@link MapView}.
     */
    getTilingScheme(): typeof webMercatorTilingScheme | undefined {
        return this.dataSource ? webMercatorTilingScheme : undefined;
    }

    /**
     * Clears the internal cache.
     */
    clearCache(): void {
        // Implement cache clearing logic here
    }
}

export { ElevationProvider };
