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
import FeatureTheme from "./theme/feature";
import { dispatch } from "d3-dispatch";
import Window from "./window";
import { GeoServerFeatureDataSource } from "./feature_datasource";
import TopoSource from "./topo-source";
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
class Application {
    id = hat();

    dispatch = dispatch("ready", "onclick", "mousedown", "mouseup", "camera-changed");

    Added3DTileSource = { map: new Map(), mainSource: null, index: 1, scene: new Scene() };

    materialProviders = [];

    __ready = null;

    getReady() {
        return this.__ready;
    }

    constructor(options) {
        this.initlizeMapView(options);

        this.sunLight = new SunLight(this.mapView);

        this.__ready = Promise.all([this.initlizeDataSource(options)]).then(async () => {
            this.topoSource = new TopoSource(this, options);
            await this.topoSource.connect();

            this.mapView.scene.add(this.Added3DTileSource.scene);

            this.heightMapSource = new HeightMapSource({});
            this.heightMapSource.emptySource();
            this.__updateTerrainSource(this.heightMapSource);
            this.dispatch.call("ready", this);
        });

        this._terrain_promise = this.__ready;

        const { camera, projection, mapAnchors } = this.mapView;
        const updateCallback = () => this.mapView.update();
        const atmosphere = new MapViewAtmosphere(
            mapAnchors,
            camera,
            projection,
            this.mapView.renderer.capabilities,
            updateCallback
        );

        var mapAdapter = new BaseMapObjectAdapter(atmosphere, {});
        atmosphere.groundMesh.userData.mapAdapter = mapAdapter;
        atmosphere.skyMesh.userData.mapAdapter = mapAdapter;
        atmosphere.lightMode = AtmosphereLightMode.LightDynamic;
        this.atmosphere = atmosphere;
        this.mapView.addEventListener(MapViewEventNames.CameraPositionChanged, this.onCameraChange);
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
        await this.mapView.setElevationSource(
            terrainSource,
            terrainSource.getElevationRangeSource()
        );
        this.elevationProvider = terrainSource.getElevationProvider();
        this.terrainSource = terrainSource;
        this.terrainSource.application = this;

        this.materialProviders.forEach(provider => {
            provider.bindDataSource(this.terrainSource);
        });
    }
    async setHeightMapSource(source) {
        this.__enableTerrain = true;
        await this._terrain_promise.then(async () => {
            this._terrain_promise = this.heightMapSource.setSourceTerrain(source).then(() => {
                return this.__updateTerrainSource(this.heightMapSource);
            });
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
        this.mapView.mapAnchors.add(mesh);
        mesh.map = this;
        this.mapView.update();
    }

    removeAnchorMesh(mesh) {
        this.mapView.mapAnchors.remove(mesh);
        this.mapView.update();
        delete mesh.map;
    }

    onCameraChange = () => {
        if (this.mapView.zoomLevel >= 22) {
            this.atmosphere.enabled = false;
        } else {
            this.atmosphere.enabled = true;
        }

        this.dispatch.call("camera-changed", this);
    };

    reset() {
        this.history.reset();
        this.topoSource.reset();
    }

    updateFeatureTopoMesh = id => {
        this.topoSource.recreate(this.history.get(id));
    };

    initlizeMapView(options) {
        this.mapView = new MapView({
            theme: makeMapDefaultTheme(),
            ...options,
            enableShadows: true,
            decoderUrl: `${config.DECODER_URL}`,
            projection: sphereProjection,
            throttlingEnabled: true,
            maxVisibleDataSourceTiles: 100,
            enablePolarDataSource: false,
            addBackgroundDatasource: false,
            clipPlanesEvaluator: new TiltViewClipPlanesEvaluator(828, 0, 1.0, 0.5, 1000),
            lodMinTilePixelSize: 1024
        });

        // this.mapView.renderer.outputEncoding = THREE.sRGBEncoding;

        this.mapView.pickHandler.superRaycasterFromScreenPoint =
            this.mapView.pickHandler.raycasterFromScreenPoint;
        this.mapView.pickHandler.raycasterFromScreenPoint = this.raycasterFromScreenPoint;
        this.window = new Window(this.mapView.canvas);

        this.window.on(`mousedraw.${this.id}`, () => {
            this.mapView.update();
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

                this.mapView.canvas.parentElement.appendChild(ui.domElement);
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

    exit() {
        this.mapView.removeEventListener(
            MapViewEventNames.CameraPositionChanged,
            this.onCameraChange
        );
        if (this.mapControl) {
            this.mapControl.dispose();
        }
        this.mapView.dispose();
    }

    initlizeDataSource(options) {
        const datasource = new GeoServerFeatureDataSource({ ...options });
        this.dataProvider = datasource.dataProvider();

        return this.mapView.addDataSource(datasource).then(() => {
            datasource.setTheme(FeatureTheme);
            this.datasource = datasource;
        });
    }

    intersectMapObjects(screenX, screenY) {
        let usableIntersections = this.mapView.intersectMapObjects(screenX, screenY);
        var rayCaster = this.mapView.pickHandler.setupRaycaster(screenX, screenY);

        var intersects = [];

        rayCaster.intersectObject(this.Added3DTileSource.scene, true, intersects);

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
                this.mapView.m_rteCamera.projectionMatrix,
                this.mapView.m_rteCamera.matrixWorldInverse
            )
        );

        var frustum = makePickFrustum(x, y, width, height, this.mapView.m_rteCamera, (x, y) => {
            return this.mapView.getNormalizedScreenCoordinates(x, y);
        });

        var intersects = [];
        for (const child of this.mapView.mapAnchors.children) {
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
        return this.Added3DTileSource.map.get(url);
    }

    add3DTileSource(url, flyto = true) {
        if (!this.Added3DTileSource.map.has(url)) {
            const { camera, renderer } = this.mapView;
            this.Added3DTileSource.index++;
            const tilesRenderer = new F3dTilesRenderer(
                url,
                this.mapView,
                DebugTilesRenderer,
                tile => {
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
                }
            );
            tilesRenderer.setCamera(camera);
            tilesRenderer.setResolutionFromRenderer(camera, renderer);

            this.Added3DTileSource.map.set(url, tilesRenderer);
            this.Added3DTileSource.scene.add(tilesRenderer.object);

            if (this.Added3DTileSource.mainSource) {
                tilesRenderer.lruCache = this.Added3DTileSource.mainSource.lruCache;
                tilesRenderer.downloadQueue = this.Added3DTileSource.mainSource.downloadQueue;
                tilesRenderer.parseQueue = this.Added3DTileSource.mainSource.parseQueue;
            } else {
                this.Added3DTileSource.mainSource = tilesRenderer;
            }
            return tilesRenderer;
        } else {
            return this.Added3DTileSource.map.get(url);
        }
    }

    remove3DTileSource(url) {
        if (this.Added3DTileSource.map.has(url)) {
            var ti = this.Added3DTileSource.map.get(url);
            ti.off();
            this.Added3DTileSource.scene.remove(this.Added3DTileSource.map.get(url).object);
            this.Added3DTileSource.map.delete(url);
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
            cameraGeoLocation: this.mapView.projection.unprojectPoint(this.mapView.camera.position),
            centerDistance: this.mapView.camera.position.distanceTo(this.mapOrbitControl.center)
        };
    }

    getScreenPositionFromGeoCoordinate(longitude, latitude, altitude) {
        const { mapView } = this;
        var position = mapView.projection.projectPoint(
            new GeoCoordinates(latitude, longitude, altitude)
        );
        return this.getScreenPositionFromXYZ(position.x, position.y, position.z);
    }

    getScreenPositionFromXYZ(worldX, worldY, worldZ) {
        const { mapView } = this;
        var { width, height } = mapView.getCanvasClientSize();
        mapView.m_screenProjector.update(mapView.camera, width, height);
        var position = new Vector3(worldX, worldY, worldZ);
        var { x, y } = mapView.getScreenPosition(position);

        if (
            new Box2(new Vector2(0, 0), new Vector2(width, height)).containsPoint(new Vector2(x, y))
        ) {
            return new Vector2(x, y);
        }
        return false;
    }
}

export default Application;
