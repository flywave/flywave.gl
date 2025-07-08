import { GeoCoordinates, GeoBox } from "@flywave/flywave-geoutils";
import { TilesRenderer as ThreeTilesRenderer, TileIntersection } from "./renderer/TilesRenderer";
import { Vector3, Object3D, Raycaster } from "three";
import { MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { DebugTilesRenderer } from "./renderer/DebugTilesRenderer";
import { Tile } from "./base/Tile";
import { ITilesRenderer } from "@flywave/flywave-mapview/ITilesRenderer";
import { Observe3DTileChange } from "./ObserveTileChange";

export const TilesRendererUpdateEvent = "update";
export const TilesRendererRootOnLoadedEvent = "onRootNodeLoaded";

export interface TilesRendererOptions {
    url: string;
    decoderPath?: string;
}

export class TilesRenderer extends ThreeTilesRenderer implements ITilesRenderer {
    private debugRender?: any; // Replace with actual DebugTilesRenderer type
    private observeTileChange?: Observe3DTileChange[];
    private rootTile?: Tile;
    private debug?: boolean;
    public object: Object3D;
    private geoExtent?: GeoBox;
    private mapView?: MapView;

    constructor(private readonly options: TilesRendererOptions) {
        super(options.url);

        this.lruCache.maxSize = 2200;
        this.lruCache.minSize = 2000;

        this.displayActiveTiles = true;

        this.object = new Object3D();

        this.object.add(this.group);
        this.loadSiblings = false;

        this.autoDisableRendererCulling = false;
        this.errorTarget = 16;
    }

    update(): void {
        super.update();

        this.activeTiles.forEach(tile => {
            if (tile.cached.geoBox) {
                if (!this.geoExtent) {
                    this.geoExtent = tile.cached.geoBox.clone();
                }
                this.geoExtent = this.geoExtent.merge(tile.cached.geoBox);
            }
        });
    }

    getMaxGeometryHeight(): number {
        if (this.geoExtent) {
            return this.geoExtent.maxAltitude;
        }
        return 0;
    }

    getMinGeometryHeight(): number {
        if (this.geoExtent) {
            return this.geoExtent.minAltitude;
        }
        return 0;
    }

    connectMapView(mapView: MapView) {
        this.mapView = mapView;
        this.setCamera(mapView.camera);
        this.setResolutionFromRenderer(mapView.camera, mapView.renderer);
        mapView.addEventListener(MapViewEventNames.Render, this.update3DTileSource);

        mapView.scene.add(this.object);
    }

    disconnectMapView() {
        if (this.mapView) {
            this.mapView.scene.remove(this.object);
            this.mapView.removeEventListener(MapViewEventNames.Render, this.update3DTileSource);
            this.mapView = undefined;
        }
    }

    openDebug = (debug: boolean) => {
        this.debug = debug;

        if (this.debugRender) {
            this.debugRender.off();
            this.object.parent?.remove(this.debugRender.object);
            delete this.debugRender;
        }

        if (debug) {
            this.debugRender = new DebugTilesRenderer(this.options);
            this.debugRender.connectMapView(this.mapView);
            this.object.parent?.add(this.debugRender.object);
        }
    };

    protected getProjection() {
        return this.mapView.projection;
    }

    addObserveTileChange = (observeTileChange: Observe3DTileChange) => {
        this.observeTileChange.push(observeTileChange);
    };

    removeObserveTileChange = (observeTileChange: Observe3DTileChange) => {
        this.observeTileChange = this.observeTileChange.filter(item => item !== observeTileChange);
    };

    setTileActive(tile: Tile, active: boolean): void {
        super.setTileActive(tile, active);
        if (this.observeTileChange) {
            this.observeTileChange.forEach(item => {
                item.watchTileChange(tile, this.activeTiles, active);
            });
        }
    }

    raycast = (raycaster: Raycaster, intersects: TileIntersection[]): void => {
        const oldRayOrigin = new Vector3();
        oldRayOrigin.copy(raycaster.ray.origin);
        raycaster.ray.origin.copy(this.mapView.camera.position);
        this.object.position.set(0, 0, 0);
        this.object.updateMatrixWorld();

        const _intersects: TileIntersection[] = [];
        try {
            super.raycast(raycaster, _intersects);
        } catch (e) {
            console.error("Raycast error:", e);
        }

        _intersects.forEach(e => {
            e.point.sub(this.mapView.camera.position);
            intersects.push(e);
        });

        raycaster.ray.origin.copy(oldRayOrigin);
    };

    private update3DTileSource = (): void => {
        if (this.debugRender && this.debug) {
            this.debugRender.update3DTileSource();
        }

        this.object.position.copy(this.mapView.camera.position.clone().negate());

        this.downloadQueue.maxJobs = this.mapView.cameraIsMoving ? 4 : 16;

        this.update();
        this.dispatchEvent({ type: TilesRendererUpdateEvent });
    };

    async getRootTileBoundingVolumeRegion(): Promise<GeoBox> {
        const tile = await this.getRootTile();
        if (!tile || !tile.boundingVolume.region) return;

        const [milng, milat, mxlng, mxlat] = tile.boundingVolume.region;
        const toA = 180 / Math.PI;

        return GeoBox.fromCoordinates(
            new GeoCoordinates(milat * toA, milng * toA, 0),
            new GeoCoordinates(mxlat * toA, mxlng * toA, 0)
        );
    }

    private readyPromise: Promise<Tile> | null = null;
    private readyPromiseResolve: ((value: Tile) => void) | null = null;

    getRootTile(): Promise<Tile> {
        if (this.rootTile) {
            return Promise.resolve(this.rootTile);
        } else {
            if (!this.readyPromise) {
                this.readyPromise = new Promise<Tile>(resolve => {
                    this.readyPromiseResolve = resolve;
                });
            }
            return this.readyPromise;
        }
    }

    public rootPosition: Vector3 = new Vector3();

    public getRootPosition(): Vector3 {
        return this.rootPosition;
    }

    preprocessNode(tile: Tile, parentTile: Tile | null, tileSetDir: string): void {
        if (!parentTile) {
            this.dispatchEvent({ type: TilesRendererRootOnLoadedEvent });
            this.rootTile = tile;
            if (this.readyPromiseResolve) this.readyPromiseResolve(tile);
        }

        super.preprocessNode(tile, parentTile, tileSetDir);

        if (!parentTile) {
            this.rootPosition.copy(this.rootTile?.cached.sphere.center);
        }
    }

    off(): void {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.update3DTileSource);
        if (this.debugRender) {
            this.debugRender.off();
        }
    }
}
