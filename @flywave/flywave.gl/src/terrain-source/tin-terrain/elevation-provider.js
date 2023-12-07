import {
    webMercatorTilingScheme,
    TileKeyUtils,
    TileKey,
    OrientedBox3
} from "@flywave/flywave-geoutils";
import PickLocal from "../../util/pick-local";
import { LRUCache } from "@flywave/flywave-lrucache";

const tmpOBB = new OrientedBox3();

class ElevationProvider {
    lru = new LRUCache(100);

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
        if (!this.dataSource.dataTerrainProvider._availability) {
            return defaultIfNotLoaded;
        }
        const terrTile = this.dataSource
            .dataProvider()
            .getBestAvailableTile(
                TileKeyUtils.geoCoordinatesToTileKey(
                    this.dataSource.getTilingScheme(),
                    geoPoint,
                    this.dataSource.dataTerrainProvider._availability._maximumLevel
                )
            );

        if (!(terrTile && terrTile.tinData)) {
            return defaultIfNotLoaded;
        }

        const { heightMap } = terrTile.tinData;
        if (!heightMap) return defaultIfNotLoaded;
        const {
            geoBox: { southWest, longitudeSpan, latitudeSpan }
        } = terrTile;

        let x = (geoPoint.lng - southWest.lng) / longitudeSpan;
        let y = (geoPoint.lat - southWest.lat) / latitudeSpan;

        let alt = heightMap.getByScale(x, y);
        return alt;
    }

    /**
     * Get elevation for a given geo point.
     *
     * @param geoPoint - geo position to query height for.
     * @param level - Optional data level that should be used for getting the elevation.
     *              If undefined, the view's visible tile containing the point will be used.
     * @returns The height at geoPoint or undefined if no tile was found that covers the geoPoint.
     */
    getHeight(geoPoint, unnecessary) {
        if (unnecessary) return 0;
        return this.getAtPointOrZero(geoPoint, 0);
    }

    /**
     * Cast a ray through the given screen position x, y.
     *
     * @param x - The X position in css/client coordinates (without applied display ratio).
     * @param y - The Y position in css/client coordinates (without applied display ratio).
     * @returns World coordinate of the intersection or undefined if no intersection detected.
     */
    rayCast(x, y) {
        if (!this.pickingRaycaster) {
            this.pickingRaycaster = new PickLocal(this.dataSource.mapView);
        }
        this.pickingRaycaster.raycasterFromScreenPoint(x, y);
        const tileList = this.dataSource.mapView.visibleTileSet.dataSourceTileList.find(
            s => s.dataSource == this.dataSource
        );
        if (!tileList) return false;
        var tiles = [];
        tileList.visibleTiles.forEach(tile => {
            if (tile.tileKey.level <= 4) {
                return;
            }
            tmpOBB.copy(tile.boundingBox);
            tmpOBB.position.sub(this.dataSource.mapView.worldCenter);
            const worldOffsetX = tile.computeWorldOffsetX();
            tmpOBB.position.x += worldOffsetX;
            const distance = tmpOBB.intersectsRay(this.pickingRaycaster.m_pickingRaycaster.ray);
            if (distance !== undefined) {
                tiles.push({ tile, distance });
            }
        });
        tiles.sort((lhs, rhs) => {
            return lhs.distance - rhs.distance;
        });

        var rayRets = [];
        for (var i = 0; i < tiles.length; i++) {
            if (!tiles[i].tile.rayTestMesh) {
                continue;
            }
            if (this.lru.get(tiles[i].tile.tileKey.mortonCode())) {
                const { screen, camPositon, value } = this.lru.get(
                    tiles[i].tile.tileKey.mortonCode()
                );
                if (
                    screen.x == x &&
                    screen.y == y &&
                    camPositon.equals(this.dataSource.mapView.camera.position)
                ) {
                    rayRets.push(value);
                    continue;
                }
            }

            var results = this.pickingRaycaster.intersectMapObjects(x, y, [
                tiles[i].tile.getRayTestMesh(this.dataSource.mapView.camera.position)
            ]);
            if (!results.length) continue;
            results[0].point.add(this.dataSource.mapView.camera.position);
            rayRets.push(results[0]);
            this.lru.set(tiles[i].tile.tileKey.mortonCode(), {
                screen: { x, y },
                camPositon: this.dataSource.mapView.camera.position.clone(),
                value: results[0]
            });
        }

        rayRets.sort((lhs, rhs) => {
            return lhs.distance - rhs.distance;
        });

        if (!rayRets.length) {
            return false;
        }

        return rayRets[0];
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
