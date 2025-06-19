
import * as THREE from 'three'
import { VectorTileDataSource } from "@flywave/flywave-vectortile-datasource";
import { TileObjectRenderer } from "@flywave/flywave-mapview/TileObjectsRenderer";
import { mercatorProjection } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { TileTaskGroups } from "@flywave/flywave-mapview";
import {
    GeoBox,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";

class VectorTileDataSourceWrapper extends VectorTileDataSource {
    constructor(params) {
        super(params);

        this._projection = params.projection;
    }

    get projection() {
        return this._projection;
    }
}

export class VectorMaterialProvider {

    levelRange = [];

    bindDataSource(dataSource) {
        this.dataSource = dataSource;
    }

    tileMaterialCache = new LRUCache(255);

    get tileScheme() {
        return this.vectorSource.getTilingScheme();
    }

    constructor(options, application) {
        this.vectorSource = new VectorTileDataSourceWrapper({
            tileScheme: webMercatorTilingScheme,
            projection: mercatorProjection,
            ...options
        });

        this.scene = new THREE.Scene;

        this.rootNode = new THREE.Object3D;

        this.scene.add(this.rootNode);

        this.application = application;

        this.tileMaterialCache.evictionCallback = this.evictionCallback;
    }

    evictionCallback(k, tile) {
        tile.renderTarget && tile.renderTarget.dispose();
        tile.textElementGroups.forEach((ele) => {
            ele.dispose();
        });
        tile.dispose();
    }

    ready() {
        return this.vectorSource.ready();
    }

    connect() {
        this.vectorSource.attach(this.dataSource.mapView);

        this.dataSource.mapView.lights.forEach((light) => {
            this.scene.add(light.clone());
        });
        return Promise.resolve().then(() => {
            return this.vectorSource.connect().then(async () => {
                await this.vectorSource.setTheme(this.dataSource.mapView.theme)
                this.tileObjectRenderer = new TileObjectRenderer(this.dataSource.mapView.env, this.dataSource.mapView.renderer);
                this.tileObjectRenderer.setupRenderer();
            });
        });
    }

    loadNeareastRectangleLevel(geoBox, level) {
        var tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        tileKeys.forEach(this.loadNeareastTile)
    }

    loadNeareastTile = (tileKey) => {
        if (this.tileMaterialCache.has(tileKey.mortonCode())) {
            return;
        }
        var tile = this.vectorSource.getTile(tileKey, false);
        this.tileMaterialCache.set(tileKey.mortonCode(), tile);
        tile.tileLoader.waitSettled().then(async () => {
            await tile.m_tileGeometryLoader.update();
            await tile.m_tileGeometryLoader.waitFinished();
            this.renderBufferTask(tile);
        });
    }

    renderBufferTask(tile) {
        this.dataSource.mapView.taskQueue.add({
            execute: () => {
                this.renderFrameBuffer(tile);
                this.dataSource.updateTileOverlayer({
                    geoBox: this.vectorSource.getTilingScheme().getGeoBox(tile.tileKey),
                    tileKey:tile.tileKey
                });
            },

            group: TileTaskGroups.CREATE,

            getPriority: () => {
                return 9;
            },

            isExpired: () => {
                return tile.disposed;
            },

            estimatedProcessTime: () => {
                return (tile.decodedTile?.decodeTime ?? 30) / 6;
            }
        });
    }

    buildCamera(tile) {
        var mbox = this.vectorSource.projection.projectBox(tile.geoBox);
        const { x, y, z } = mbox.getSize(new THREE.Vector3);

        var camera = new THREE.OrthographicCamera(-x / 2, x / 2, y / 2, -y / 2, 1, 1000);

        mbox.getCenter(camera.position);
        camera.position.z = 500;
        return camera;
    }

    createTexture(tile) {
        tile.renderTarget = new THREE.WebGLRenderTarget(1024, 1024, {
        });
        tile.material = tile.renderTarget.texture;
        return tile.renderTarget;
    }

    renderFrameBuffer = (tile) => {
        this.rootNode.clear();
        this.tileObjectRenderer.prepareRender();
        var camera = this.buildCamera(tile);
        this.tileObjectRenderer.render(tile, tile.tileKey.level, tile.tileKey.level, camera.position, this.rootNode);
        if (this.rootNode.children.length == 0) return;

        camera.position.set(0, 0, 0);
        const { renderer } = this.dataSource.mapView;
        var oldRenderTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.createTexture(tile));

        var aplpa = renderer.getClearAlpha();
        renderer.setClearAlpha(0)

        this.dataSource.mapView.renderer.clear();
        this.dataSource.mapView.renderer.render(this.scene, camera);
        this.dataSource.mapView.renderer.setRenderTarget(oldRenderTarget);

        tile.textElementGroups.forEach((text) => {
            if (text.points instanceof Array) {
                text.points = text.points.map(p => {
                    var geo = this.vectorSource.projection.unprojectPoint(p);
                    return this.dataSource.mapView.projection.projectPoint(geo, p);
                });
            } else {
                text.points = this.dataSource.mapView.projection.projectPoint(this.vectorSource.projection.unprojectPoint(text.points), text.points)
            }
        });
        tile.clearTextElements = () => { };
        var oldClear = tile.clearTextElements;
        tile.dispose();
        tile.clearTextElements = oldClear;
        renderer.setClearAlpha(aplpa)
    }

    getNeareastRectangleByLevel(geoBox, level) {
        var tileKeys = this.tileScheme.getTileKeys(this.clipGeobox(geoBox), level);
        return tileKeys.map(this.getNeareastMaterialTile).filter(e => e);
    }

    getNeareastMaterialTile = (tileKey: TileKey) => {
        var tk = tileKey;
        while (true) {
            if (this.tileMaterialCache.has(tk.mortonCode())) {
                var tileMaterial = this.tileMaterialCache.get(tk.mortonCode());
                if (tileMaterial.material) {
                    return tileMaterial;
                }
            }
            if (tk.level == 0) {
                break;
            }

            tk = tk.parent();
        }
    }

    clipGeobox(geobox: GeoBox) {
        var geoboxCopy = geobox.clone();
        const MAXIMUM_LATITUDE_ANGLE = 1.48442222974 * 180 / Math.PI;
        geoboxCopy.southWest.latitude = THREE.MathUtils.clamp(geoboxCopy.southWest.latitude, -MAXIMUM_LATITUDE_ANGLE, MAXIMUM_LATITUDE_ANGLE);
        geoboxCopy.northEast.latitude = THREE.MathUtils.clamp(geoboxCopy.northEast.latitude, -MAXIMUM_LATITUDE_ANGLE, MAXIMUM_LATITUDE_ANGLE);
        return geoboxCopy;
    }
}

export default VectorMaterialProvider;