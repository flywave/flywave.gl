import {
    GeoBox,
    mercatorProjection,
    TileKey,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { TileTaskGroups } from "@flywave/flywave-mapview";
import { TileObjectRenderer } from "@flywave/flywave-mapview/src/TileObjectsRenderer";
import { VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";
import * as THREE from "three";

interface VectorMaterialProviderOptions {
    [key: string]: any;
}

interface TileMaterial {
    renderTarget?: THREE.WebGLRenderTarget;
    material?: THREE.Texture;
    tileKey: TileKey;
    tileLoader: {
        waitSettled: () => Promise<void>;
    };
    m_tileGeometryLoader: {
        update: () => Promise<void>;
        waitFinished: () => Promise<void>;
    };
    decodedTile?: {
        decodeTime: number;
    };
    disposed: boolean;
    geoBox: GeoBox;
    textElementGroups: Array<{
        points: THREE.Vector3 | THREE.Vector3[];
        dispose: () => void;
    }>;
    clearTextElements: () => void;
    dispose: () => void;
}

class VectorTileDataSourceWrapper extends VectorTileDataSource {
    private readonly _projection: any;

    constructor(params: any) {
        super(params);
        this._projection = params.projection;
    }

    get projection() {
        return this._projection;
    }
}

export class VectorMaterialProvider {
    levelRange: number[] = [];
    private dataSource: any;
    private readonly vectorSource: VectorTileDataSourceWrapper;
    private readonly scene: THREE.Scene;
    private readonly rootNode: THREE.Object3D;
    private readonly tileMaterialCache: LRUCache<number, TileMaterial>;
    private tileObjectRenderer?: TileObjectRenderer;

    constructor(options: VectorMaterialProviderOptions) {
        this.vectorSource = new VectorTileDataSourceWrapper({
            tileScheme: webMercatorTilingScheme,
            projection: mercatorProjection,
            ...options
        });

        this.scene = new THREE.Scene();
        this.rootNode = new THREE.Object3D();
        this.scene.add(this.rootNode);

        this.tileMaterialCache = new LRUCache<number, TileMaterial>(255);
        this.tileMaterialCache.evictionCallback = this.evictionCallback.bind(this);
    }

    private evictionCallback(k: string, tile: TileMaterial) {
        tile.renderTarget && tile.renderTarget.dispose();
        tile.textElementGroups.forEach(ele => {
            ele.dispose();
        });
        tile.dispose();
    }

    ready(): boolean {
        return this.vectorSource.ready();
    }

    connect(): Promise<void> {
        this.vectorSource.attach(this.dataSource.mapView);

        this.dataSource.mapView.lights.forEach((light: THREE.Light) => {
            this.scene.add(light.clone());
        });

        return Promise.resolve().then(() => {
            return this.vectorSource.connect().then(async () => {
                await this.vectorSource.setTheme(this.dataSource.mapView.theme);
                this.tileObjectRenderer = new TileObjectRenderer(
                    this.dataSource.mapView.env,
                    this.dataSource.mapView.renderer
                );
                this.tileObjectRenderer.setupRenderer();
            });
        });
    }

    loadNeareastRectangleLevel(geoBox: GeoBox, level: number): void {
        const tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        tileKeys.forEach(this.loadNeareastTile);
    }

    private readonly loadNeareastTile = (tileKey: TileKey): void => {
        if (this.tileMaterialCache.has(tileKey.mortonCode())) {
            return;
        }
        const tile = this.vectorSource.getTile(tileKey, false) as unknown as TileMaterial;
        this.tileMaterialCache.set(tileKey.mortonCode(), tile);
        tile.tileLoader.waitSettled().then(async () => {
            await tile.m_tileGeometryLoader.update();
            await tile.m_tileGeometryLoader.waitFinished();
            this.renderBufferTask(tile);
        });
    };

    private renderBufferTask(tile: TileMaterial): void {
        this.dataSource.mapView.taskQueue.add({
            execute: () => {
                this.renderFrameBuffer(tile);
                this.dataSource.updateTileOverlayer({
                    geoBox: this.vectorSource.getTilingScheme().getGeoBox(tile.tileKey),
                    tileKey: tile.tileKey
                });
            },
            group: TileTaskGroups.CREATE,
            getPriority: () => 9,
            isExpired: () => tile.disposed,
            estimatedProcessTime: () => (tile.decodedTile?.decodeTime ?? 30) / 6
        });
    }

    private buildCamera(tile: TileMaterial): THREE.OrthographicCamera {
        const mbox = this.vectorSource.projection.projectBox(tile.geoBox);
        const { x, y, z } = mbox.getSize(new THREE.Vector3());

        const camera = new THREE.OrthographicCamera(-x / 2, x / 2, y / 2, -y / 2, 1, 1000);
        mbox.getCenter(camera.position);
        camera.position.z = 500;
        return camera;
    }

    private createTexture(tile: TileMaterial): THREE.WebGLRenderTarget {
        tile.renderTarget = new THREE.WebGLRenderTarget(1024, 1024);
        tile.material = tile.renderTarget.texture;
        return tile.renderTarget;
    }

    private readonly renderFrameBuffer = (tile: TileMaterial): void => {
        this.rootNode.clear();
        if (!this.tileObjectRenderer) return;

        this.tileObjectRenderer.prepareRender();
        const camera = this.buildCamera(tile);
        this.tileObjectRenderer.render(
            tile,
            tile.tileKey.level,
            tile.tileKey.level,
            camera.position,
            this.rootNode
        );

        if (this.rootNode.children.length === 0) return;

        camera.position.set(0, 0, 0);
        const { renderer } = this.dataSource.mapView;
        const oldRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.createTexture(tile));

        const alpha = renderer.getClearAlpha();
        renderer.setClearAlpha(0);

        renderer.clear();
        renderer.render(this.scene, camera);
        renderer.setRenderTarget(oldRenderTarget);

        tile.textElementGroups.forEach(text => {
            if (Array.isArray(text.points)) {
                text.points = text.points.map(p => {
                    const geo = this.vectorSource.projection.unprojectPoint(p);
                    return this.dataSource.mapView.projection.projectPoint(geo, p);
                });
            } else {
                text.points = this.dataSource.mapView.projection.projectPoint(
                    this.vectorSource.projection.unprojectPoint(text.points),
                    text.points
                );
            }
        });

        const oldClear = tile.clearTextElements;
        tile.clearTextElements = () => {};
        tile.dispose();
        tile.clearTextElements = oldClear;
        renderer.setClearAlpha(alpha);
    };

    getNeareastRectangleByLevel(geoBox: GeoBox, level: number): TileMaterial[] {
        const tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        return tileKeys.map(this.getNeareastMaterialTile).filter(e => e) as TileMaterial[];
    }

    private readonly getNeareastMaterialTile = (tileKey: TileKey): TileMaterial | null => {
        let tk = tileKey;
        while (true) {
            if (this.tileMaterialCache.has(tk.mortonCode())) {
                const tileMaterial = this.tileMaterialCache.get(tk.mortonCode());
                if (tileMaterial.material) {
                    return tileMaterial;
                }
            }
            if (tk.level === 0) {
                break;
            }
            tk = tk.parent();
        }
        return null;
    };

    private clipGeobox(geobox: GeoBox): GeoBox {
        const geoboxCopy = geobox.clone();
        const MAXIMUM_LATITUDE_ANGLE = (1.48442222974 * 180) / Math.PI;
        geoboxCopy.southWest.latitude = THREE.MathUtils.clamp(
            geoboxCopy.southWest.latitude,
            -MAXIMUM_LATITUDE_ANGLE,
            MAXIMUM_LATITUDE_ANGLE
        );
        geoboxCopy.northEast.latitude = THREE.MathUtils.clamp(
            geoboxCopy.northEast.latitude,
            -MAXIMUM_LATITUDE_ANGLE,
            MAXIMUM_LATITUDE_ANGLE
        );
        return geoboxCopy;
    }

    get tileScheme() {
        return this.vectorSource.getTilingScheme();
    }

    bindDataSource(dataSource: any): void {
        this.dataSource = dataSource;
    }
}

export default VectorMaterialProvider;
