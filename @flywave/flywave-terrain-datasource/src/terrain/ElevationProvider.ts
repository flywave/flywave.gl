import { GeoCoordinates, OrientedBox3, TileKey, TileKeyUtils } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { DataSource } from "@flywave/flywave-mapview";
import { Vector3 } from "three";

import PickLocal from "./utils/pick-local";

const tmpOBB = new OrientedBox3();

interface RayCastResult {
    point: Vector3;
    distance: number;
}

interface CacheItem {
    screen: { x: number; y: number };
    camPositon: Vector3;
    value: RayCastResult;
}

export class ElevationProvider {
    private readonly lru = new LRUCache<CacheItem, CacheItem>(100);
    private dataSource: DataSource;
    private pickingRaycaster?: PickLocal;

    bindDataSource(dataSource: DataSource): void {
        this.dataSource = dataSource;
    }

    getAtPointOrZero(point: MercatorCoordinate, defaultIfNotLoaded: number = 0): number {
        return this.getAtPoint(point, defaultIfNotLoaded) || 0;
    }

    getBestAvailableTile(tk: TileKey): any {
        return this.dataSource.dataProvider().getBestAvailableTile(tk);
    }

    getAtPoint(geoPoint: GeoCoordinates, defaultIfNotLoaded?: number | null): number | null {
        if (!this.dataSource.dataTerrainProvider._availability) {
            return defaultIfNotLoaded ?? null;
        }

        const tk = TileKeyUtils.geoCoordinatesToTileKey(
            this.dataSource.getTilingScheme(),
            geoPoint,
            this.dataSource.dataTerrainProvider._availability._maximumLevel + 1
        );

        const terrTile = this.getBestAvailableTile(tk);
        if (!(terrTile && terrTile.tinData)) {
            return defaultIfNotLoaded ?? null;
        }

        const { heightMap } = terrTile;
        if (!heightMap) return defaultIfNotLoaded ?? null;

        const {
            geoBox: { southWest, longitudeSpan, latitudeSpan }
        } = terrTile;

        const x = (geoPoint.lng - southWest.lng) / longitudeSpan;
        const y = (geoPoint.lat - southWest.lat) / latitudeSpan;

        return heightMap.getByScale(x, y);
    }

    getHeight(geoPoint: GeoCoordinates, unnecessary?: boolean): number {
        if (unnecessary) return 0;
        return this.getAtPointOrZero(geoPoint, 0);
    }

    rayCast(x: number, y: number): RayCastResult | false {
        if (!this.pickingRaycaster) {
            this.pickingRaycaster = new PickLocal(this.dataSource.mapView);
        }

        this.pickingRaycaster.raycasterFromScreenPoint(x, y);
        const tileList = this.dataSource.mapView.visibleTileSet.dataSourceTileList.find(
            s => s.dataSource === this.dataSource
        );

        if (!tileList) return false;

        const tiles: Array<{ tile: any; distance: number }> = [];

        tileList.visibleTiles.forEach(tile => {
            if (tile.tileKey.level <= 4) return;

            tmpOBB.copy(tile.boundingBox);
            tmpOBB.position.sub(this.dataSource.mapView.worldCenter);
            const worldOffsetX = tile.computeWorldOffsetX();
            tmpOBB.position.x += worldOffsetX;

            const distance = tmpOBB.intersectsRay(this.pickingRaycaster.m_pickingRaycaster.ray);
            if (distance !== undefined) {
                tiles.push({ tile, distance });
            }
        });

        tiles.sort((lhs, rhs) => lhs.distance - rhs.distance);

        const rayRets: RayCastResult[] = [];

        for (let i = 0; i < tiles.length; i++) {
            if (!tiles[i].tile.rayTestMesh) continue;

            const cached = this.lru.get(tiles[i].tile.tileKey.mortonCode());
            if (cached) {
                if (
                    cached.screen.x === x &&
                    cached.screen.y === y &&
                    cached.camPositon.equals(this.dataSource.mapView.camera.position)
                ) {
                    rayRets.push(cached.value);
                    continue;
                }
            }

            const results = this.pickingRaycaster.intersectMapObjects(x, y, [
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

        rayRets.sort((lhs, rhs) => lhs.distance - rhs.distance);
        return rayRets.length ? rayRets[0] : false;
    }
}
