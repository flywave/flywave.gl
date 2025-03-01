import { webMercatorTilingScheme, TileKeyUtils, TileKey } from "@flywave/flywave-geoutils";
import { number as interpolate } from "./util/interpolate";
import { CalculationStatus } from "@flywave/flywave-mapview";

class ElevationProvider {
    bindDataSource(dataSource) {
        this.dataSource = dataSource;
    }
    /**
     * Helper around `getAtPoint` that guarantees that a numeric value is returned.
     * @param {MercatorCoordinate} point Mercator coordinate of the point.
     * @param {number} defaultIfNotLoaded Value that is returned if the dem tile of the provided point is not loaded.
     * @returns {number} Altitude in meters.
     */
    getAtPointOrZero(point: MercatorCoordinate, defaultIfNotLoaded: number = 0): number {
        return this.getAtPoint(point, defaultIfNotLoaded) || 0;
    }

    /**
     * Altitude above sea level in meters at specified point.
     * @param {MercatorCoordinate} point Mercator coordinate of the point.
     * @param {number} defaultIfNotLoaded Value that is returned if the DEM tile of the provided point is not loaded.
     * @param {boolean} exaggerated `true` if styling exaggeration should be applied to the resulting elevation.
     * @returns {number} Altitude in meters.
     * If there is no loaded tile that carries information for the requested
     * point elevation, returns `defaultIfNotLoaded`.
     * Doesn't invoke network request to fetch the data.
     */
    getAtPoint(geoPoint: GeoCoordinates, defaultIfNotLoaded: ?number): number | null {
        // Force a cast to null for both null and undefined
        if (defaultIfNotLoaded == null) defaultIfNotLoaded = null;

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

        var point = webMercatorTilingScheme.projection.projectPoint(geoPoint);

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
     *
     * @param geoPoint - geo position to query height for.
     * @param level - Optional data level that should be used for getting the elevation.
     *              If undefined, the view's visible tile containing the point will be used.
     * @returns The height at geoPoint or undefined if no tile was found that covers the geoPoint.
     */
    getHeight(geoPoint, level) {
        return this.getAtPointOrZero(geoPoint, 0);
    }

    /**
     * Cast a ray through the given screen position x, y.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     * @returns World coordinate of the intersection or undefined if no intersection detected.
     */
    rayCast(x, y) {}

    /**
     * Get the displacement map for a given tile key. If the displacement map for the given tileKey
     * is not in the cache a lower level tile will be returned.
     *
     * @param tileKey - The tile to get the displacement map for.
     * @returns Returns the DisplacementMap for the given tileKey or a lower level tile. Undefined
     *          if the tile or no parent is in the cache.
     */
    getDisplacementMap(tileKey) {
        var tileDem = this.dataSource.dataProvider().getNeareastDisplacementMap(tileKey);

        if (!(tileDem && tileDem.displacementMap)) {
            return;
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
    getTilingScheme() {
        return webMercatorTilingScheme;
    }

    /**
     * Clears the internal cache.
     */
    clearCache() {}
}

export { ElevationProvider };
