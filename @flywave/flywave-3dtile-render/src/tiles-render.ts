import { GeoCoordinates, GeoBox } from "@flywave/flywave-geoutils";
import { TilesRenderer as ThreeTilesRenderer } from "./three/TilesRenderer";
import { Vector3, Object3D, Raycaster, Intersection } from "three";
import { MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { PriorityQueue } from "./utilities/PriorityQueue";
import { DebugTilesRenderer } from "./three/DebugTilesRenderer";
import { Tile } from "./base/tile";

export const TilesRendererUpdateEvent = "update";
export const TilesRendererRootOnLoadedEvent = "onRootNodeLoaded";

export interface TilesRendererOptions {
    url: string;
    decoderPath?: string;
}

export class TilesRenderer extends ThreeTilesRenderer {
    private debugRender?: any; // Replace with actual DebugTilesRenderer type
    private observeTileChange?: {
        _watchTileChange: (tile: Tile, activeTiles: Set<Tile>, active: boolean) => void;
    };
    private rootTile?: Tile;
    private debug?: boolean;
    public object: Object3D;

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

        this.manager.setDracoDecoderPath(options.decoderPath);
        this.errorTarget = 16;
    }

    connectMapView(mapView: MapView) {
        this.mapView = mapView;
        this.setCamera(mapView.camera);
        this.setResolutionFromRenderer(mapView.camera, mapView.renderer);
        mapView.addEventListener(MapViewEventNames.Render, this.update3DTileSource);
    }

    disconnectMapView() {
        if (this.mapView) {
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
            this.debugRender.setCamera(this.mapView.camera);
            this.debugRender.setResolutionFromRenderer(this.mapView.camera, this.mapView.renderer);
            this.object.parent?.add(this.debugRender.object);
        }
    };

    protected getProjection() {
        return this.mapView.projection;
    }

    setObserveTileChange = (observeTileChange: {
        _watchTileChange: (tile: Tile, activeTiles: Set<Tile>, active: boolean) => void;
    }) => {
        this.observeTileChange = observeTileChange;
    };

    setTileActive(tile: Tile, active: boolean): void {
        super.setTileActive(tile, active);
        if (this.observeTileChange) {
            this.observeTileChange._watchTileChange(tile, this.activeTiles, active);
        }
    }

    raycast = (raycaster: Raycaster, intersects: Intersection[]): void => {
        const oldRayOrigin = new Vector3();
        oldRayOrigin.copy(raycaster.ray.origin);
        raycaster.ray.origin.copy(this.mapView.camera.position);
        this.object.position.set(0, 0, 0);
        this.object.updateMatrixWorld();

        const _intersects: Intersection[] = [];
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

        this.object.position.copy(this.mapView.camera.position.clone().multiplyScalar(-1));

        this.downloadQueue.maxJobs = this.mapView.cameraIsMoving ? 4 : 16;

        this.update();
        this.dispatchEvent({ type: TilesRendererUpdateEvent });
    };

    async flyTo(duration: number): Promise<void> {
        const tile = await this.getRootTile();
        if (!tile || !tile.boundingVolume.region) return;

        const [milng, milat, mxlng, mxlat] = tile.boundingVolume.region;
        const toA = 180 / Math.PI;

        //@ts-ignore
        this.mapView.mapOrbitControl.flyToBox(
            GeoBox.fromCoordinates(
                new GeoCoordinates(milat * toA, milng * toA, 0),
                new GeoCoordinates(mxlat * toA, mxlng * toA, 0)
            ),
            duration
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

    preprocessNode(tile: Tile, parentTile: Tile | null, tileSetDir: string): void {
        if (!parentTile) {
            this.dispatchEvent({ type: TilesRendererRootOnLoadedEvent });
            this.rootTile = tile;
            if (this.readyPromiseResolve) this.readyPromiseResolve(tile);
        }

        super.preprocessNode(tile, parentTile, tileSetDir);
    }

    off(): void {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.update3DTileSource);
        if (this.debugRender) {
            this.debugRender.off();
        }
    }
}
