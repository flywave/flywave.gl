import { MapControlsUI } from "@flywave/flywave-map-controls";
import { sphereProjection } from "@flywave/flywave-geoutils";
import F3dTilesRenderer from "./tiles-render";
import {
    MapView,
    MapViewAtmosphere,
    AtmosphereLightMode,
    TiltViewClipPlanesEvaluator,
    MapViewEventNames
} from "@flywave/flywave-mapview";
import { MapObjectAdapter } from "@flywave/flywave-mapview/lib/MapObjectAdapter";
import { dispatch } from "d3-dispatch";
import Window from "./window";
import SunLight from "./util/make-light";
import hat from "hat";
import { MapOrbitControl } from "./map-controls/map-orbit-control";
import { Box3, Matrix4, Scene, Vector3 } from "three";
import makeMapDefaultTheme from "./theme/map-default-theme";
import config from "./config";
import { Frustum, Vector2, Box2 } from "three";
import { HeightMapSource, TinTerrainSource } from "./terrain-source";
import { DebugTilesRenderer } from "./3dtiles-render/three/DebugTilesRenderer";
import makePickFrustum from "./util/rang-frustum";
import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";

class BaseMapObjectAdapter extends MapObjectAdapter {
    isPickable() {
        return false;
    }
}
class Application extends MapView {
    id = hat();

    dispatch = dispatch("onclick", "mousedown", "mouseup", "camera-changed");

    added3DTileSource = { map: new Map(), mainSource: null, index: 1, scene: new Scene() };

    materialProviders = [];

    constructor(options) {
        super({
            theme: makeMapDefaultTheme(),
            enableShadows: options.enableShadows === undefined ? true : options.enableShadows,
            decoderUrl: `${config.DECODER_URL}`,
            projection: sphereProjection,
            throttlingEnabled: true,
            maxVisibleDataSourceTiles: options.maxVisibleDataSourceTiles || 100,
            enablePolarDataSource: options.enablePolarDataSource,
            addBackgroundDatasource: options.addBackgroundDatasource,
            clipPlanesEvaluator: new TiltViewClipPlanesEvaluator(828, 0, 1.0, 0.5, 1000),
            lodMinTilePixelSize: options.lodMinTilePixelSize || 1024,
            ...options
        });

        this.initlize(options);

        this.sunLight = new SunLight(this);

        this.scene.add(this.added3DTileSource.scene);

        this.heightMapSource = new HeightMapSource({});
        this.heightMapSource.emptySource();
        this.__updateTerrainSource(this.heightMapSource);

        const { camera, projection, mapAnchors } = this;

        const updateCallback = () => this.update();
        const atmosphere = new MapViewAtmosphere(
            mapAnchors,
            camera,
            projection,
            this.renderer.capabilities,
            updateCallback
        );

        var mapAdapter = new BaseMapObjectAdapter(atmosphere, {});
        atmosphere.groundMesh.userData.mapAdapter = mapAdapter;
        atmosphere.skyMesh.userData.mapAdapter = mapAdapter;
        atmosphere.lightMode = AtmosphereLightMode.LightDynamic;
        this.atmosphere = atmosphere;
        this.addEventListener(MapViewEventNames.CameraPositionChanged, this.onCameraChange);
    }

    clearElevationSource() {
        if (!this.terrainEnabled) return;
        this.heightMapSource.emptySource();
        this.__updateTerrainSource(this.heightMapSource);
        this.__enableTerrain = false;
    }

    get terrainEnabled() {
        return this.__enableTerrain;
    }

    async __updateTerrainSource(terrainSource) {
        await this.setElevationSource(
            terrainSource,
            terrainSource.getElevationRangeSource()
        );
        
        this.elevation = terrainSource.getElevationProvider();
        this.terrainSource = terrainSource;
        this.terrainSource.application = this;

        this.materialProviders.forEach(provider => {
            provider.bindDataSource(this.terrainSource);
        });
    }

    async setHeightMapSource(source) {
        this.__enableTerrain = true;
        this._terrain_promise = this.heightMapSource.setSourceTerrain(source).then(() => {
            return this.__updateTerrainSource(this.heightMapSource);
        });
    }

    async setTinTerrainSource(options) {
        this.__enableTerrain = true;
        await this._terrain_promise.then(async () => {
            await this.__updateTerrainSource(new TinTerrainSource(options));
        });
    }

    addMaterialProviders(provider) {
        this.materialProviders.push(provider);
        provider.bindDataSource(this.terrainSource);
        return provider;
    }

    removeMaterialProviders(provider) {
        provider.remove();
    }

    setTerrainWireframe(v) {
        this.terrainWireframe = v;
    }

    getMaterialProviders() {
        return this.materialProviders;
    }

    addAnchorMesh(mesh) {
        this.mapAnchors.add(mesh);
        mesh.map = this;
        this.update();
    }

    removeAnchorMesh(mesh) {
        this.mapAnchors.remove(mesh);
        this.update();
        delete mesh.map;
    }

    onCameraChange = () => {
        this.dispatch.call("camera-changed", this);
    };

    initlize(options) {
        this.pickHandler.superRaycasterFromScreenPoint = this.pickHandler.raycasterFromScreenPoint;
        this.pickHandler.raycasterFromScreenPoint = this.raycasterFromScreenPoint;
        this.window = new Window(this.canvas);

        this.window.on(`mousedraw.${this.id}`, () => {
            this.update();
        });

        const mapOrbitControl = new MapOrbitControl(this);
        this.mapOrbitControl = mapOrbitControl;

        this.showMapControlsUI = options.showMapControl;
    }

    set showMapControlsUI(show) {
        if (show) {
            if (!this.mapControl) {
                const ui = new MapControlsUI(this.mapOrbitControl, {
                    projectionSwitch: false,
                    zoomLevel: "input"
                });

                this.canvas.parentElement.appendChild(ui.domElement);
                this.mapControl = ui;
            }
        } else {
            if (this.mapControl) {
                this.mapControl.dispose();
                delete this.mapControl;
            }
        }
    }

    raycasterFromScreenPoint(x, y) {
        var ray = this.superRaycasterFromScreenPoint(x, y);
        var threshold = 20;
        ray.params.Line.threshold = threshold;
        ray.params.Line2 = { threshold: threshold };
        ray.params.Points.threshold = 0;
        return ray;
    }

    dispose() {
        super.dispose();
        this.removeEventListener(MapViewEventNames.CameraPositionChanged, this.onCameraChange);
        if (this.mapControl) {
            this.mapControl.dispose();
        }
    }

    intersectMapObjects(screenX, screenY) {
        let usableIntersections = super.intersectMapObjects(screenX, screenY);
        var rayCaster = this.pickHandler.setupRaycaster(screenX, screenY);

        var intersects = [];

        rayCaster.intersectObject(this.added3DTileSource.scene, true, intersects);

        return usableIntersections
            .concat(
                intersects.map(e => {
                    return {
                        type: 0,
                        ...e,
                        intersection: e
                    };
                })
            )
            .sort((a, b) => a.distance - b.distance);
    }

    pickMap(screenX, screenY) {
        let usableIntersections = this.intersectMapObjects(screenX, screenY);
        return usableIntersections;
    }

    frustumRange = (x, y, width, height) => {
        var frustum = new Frustum();
        frustum.setFromProjectionMatrix(
            new Matrix4().multiplyMatrices(
                this.m_rteCamera.projectionMatrix,
                this.m_rteCamera.matrixWorldInverse
            )
        );

        var frustum = makePickFrustum(x, y, width, height, this.m_rteCamera, (x, y) => {
            return this.getNormalizedScreenCoordinates(x, y);
        });

        var intersects = [];
        for (const child of this.mapAnchors.children) {
            if (child.userData.feature) {
                var box = new Box3().setFromObject(child);
                if (frustum.intersectsBox(box)) {
                    intersects.push({ object: child });
                }
            }
        }

        return intersects;
    };

    get3DTileSource(url) {
        return this.added3DTileSource.map.get(url);
    }

    get3DTileSourceList() {
        return this.added3DTileSource.map.keys();
    }

    add3DTileSource(url, flyto = true) {
        if (!this.added3DTileSource.map.has(url)) {
            const { camera, renderer } = this;
            this.added3DTileSource.index++;
            const tilesRenderer = new F3dTilesRenderer(url, this, DebugTilesRenderer, tile => {
                if (flyto) {
                    const [milng, milat, mxlng, mxlat] = tile.boundingVolume.region;
                    var toA = 180 / Math.PI;
                    this.mapOrbitControl.flyToBox(
                        GeoBox.fromCoordinates(
                            new GeoCoordinates(milat * toA, milng * toA, 0),
                            new GeoCoordinates(mxlat * toA, mxlng * toA, 0)
                        )
                    );
                }
            });
            tilesRenderer.setCamera(camera);
            tilesRenderer.setResolutionFromRenderer(camera, renderer);

            this.added3DTileSource.map.set(url, tilesRenderer);
            this.added3DTileSource.scene.add(tilesRenderer.object);

            if (this.added3DTileSource.mainSource) {
                tilesRenderer.lruCache = this.added3DTileSource.mainSource.lruCache;
                tilesRenderer.downloadQueue = this.added3DTileSource.mainSource.downloadQueue;
                tilesRenderer.parseQueue = this.added3DTileSource.mainSource.parseQueue;
            } else {
                this.added3DTileSource.mainSource = tilesRenderer;
            }
            return tilesRenderer;
        } else {
            return this.added3DTileSource.map.get(url);
        }
    }

    remove3DTileSource(url) {
        if (this.added3DTileSource.map.has(url)) {
            var ti = this.added3DTileSource.map.get(url);
            ti.off();
            this.added3DTileSource.scene.remove(this.added3DTileSource.map.get(url).object);
            this.added3DTileSource.map.delete(url);
        }
    }

    on() {
        this.dispatch.on.apply(this.dispatch, arguments);
    }

    get geoCenter() {
        return this.mapOrbitControl.geoCenter;
    }

    get center() {
        return this.mapOrbitControl.center;
    }

    setCameraPos({ heading, tilt, cameraGeoLocation, centerDistance }) {
        const { latitude, longitude, altitude } = cameraGeoLocation;
        this.mapOrbitControl.setTo(longitude, latitude, altitude, 0, tilt, heading);
    }

    getCameraPos() {
        return {
            heading: this.mapOrbitControl.getHeading(),
            tilt: this.mapOrbitControl.getTilt(),
            cameraGeoLocation: this.projection.unprojectPoint(this.camera.position),
            centerDistance: this.camera.position.distanceTo(this.mapOrbitControl.center)
        };
    }

    getScreenPositionFromGeoCoordinate(longitude, latitude, altitude) {
        var position = this.projection.projectPoint(
            new GeoCoordinates(latitude, longitude, altitude)
        );
        return this.getScreenPositionFromXYZ(position.x, position.y, position.z);
    }

    getScreenPositionFromXYZ(worldX, worldY, worldZ) {
        var { width, height } = this.getCanvasClientSize();
        this.m_screenProjector.update(this.camera, width, height);
        var position = new Vector3(worldX, worldY, worldZ);
        var { x, y } = this.getScreenPosition(position);

        if (
            new Box2(new Vector2(0, 0), new Vector2(width, height)).containsPoint(new Vector2(x, y))
        ) {
            return new Vector2(x, y);
        }
        return false;
    }
}

export default Application;
