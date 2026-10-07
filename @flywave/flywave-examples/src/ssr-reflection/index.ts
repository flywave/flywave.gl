import {
    type IReflectiveObjectHandle,
    ArcGISTileProvider,
    createSurfaceMaterial,
    DEMTerrainSource,
    eastNorthUpToFixedFrame,
    ellipsoidProjection,
    GeoCoordinates,
    MapControls,
    MapControlsUI,
    MapView,
    MapViewEventNames,
    mercatorProjection
} from "@flywave/flywave.gl";
import { GUI } from "dat.gui";
import {
    BoxGeometry,
    Matrix4,
    Mesh,
    MeshBasicNodeMaterial,
    PlaneGeometry,
    Quaternion,
    Vector3
} from "three/webgpu";

import { shouldForceWebGL } from "../common-webgl-debug";

/**
 * Minimal mirror demo, deliberately FLAT: no elevation source, no imagery —
 * the mirror slab and the monolith sit directly on the map plane / ellipsoid.
 * The only thing under test is `mapRenderingManager.addReflectiveObject` +
 * the SSR post effect. Switches: `?ssr=off`, `?ssrDebug=1|2`, `?proj=globe`
 * (same scene under the ellipsoid-earth projection, configured like the
 * 3dtiles-gaussian-splatting example: bare theme + atmosphere, NO tilezen
 * extends — its cubemap night-sky would override the atmosphere sky).
 */

const CENTER_LAT = 36.4902;
const CENTER_LNG = 118.1742;
/** DEM at the centre reads ~432 m — park the slab above the local ground. */
const PLATFORM_ALT = 500;
const PLATFORM_SIZE = 400;

const urlParams = new URLSearchParams(location.search);
const urlSsrOff = urlParams.get("ssr") === "off";
const urlSsrDebug = Number(urlParams.get("ssrDebug") ?? 0) || 0;
const urlGlobe = urlParams.get("proj") === "globe";

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Map canvas element not found");
    }
    return canvas;
};

const initializeMapView = (canvas: HTMLCanvasElement): MapView => {
    return new MapView({
        forceWebGL: shouldForceWebGL(),
        projection: ellipsoidProjection,
        target: new GeoCoordinates(CENTER_LAT, CENTER_LNG, PLATFORM_ALT),
        zoomLevel: 17,
        tilt: 55,
        heading: 0.6,
        canvas,
        theme: {
            // Atmosphere sun time is UTC — 06:00 UTC puts the sun high over
            // East Asia (local early afternoon); a local-clock value lands on
            // the night side and renders a black sky.
            atmosphere: { sunTime: new Date().setUTCHours(6, 0, 0, 0), enabled: true },
            postEffects: {
                ssr: {
                    enabled: !urlSsrOff,
                    resolutionScale: 0.75,
                    maxRayDistance: 3000,
                    // Slab thickness (navara pixelZSize): must exceed the
                    // per-pixel view-Z span of the DDA step at the reflected
                    // content's range (~2 m at 600 m) — knife-edge values
                    // stripe the reflection row by row.
                    thickness: 8,
                    edgeFade: 0.85,
                    debug: urlSsrDebug
                }
            }
        }
    });
};

const initializeMapControls = (mapView: MapView, canvas: HTMLCanvasElement): void => {
    const controls = new MapControls(mapView);
    const ui = new MapControlsUI(controls);
    canvas.parentElement!.appendChild(ui.domElement);
};

/**
 * Rotation aligning object-local axes with the LOCAL east-north-up frame at
 * a geo position. MapAnchors only place the anchor POSITION (RTE) and never
 * touch object rotation. Under the mercator plane projection the world frame
 * IS an east-north-up frame, so identity rotation is already ground-tangent;
 * under the globe projection the world frame is ECEF and every anchored mesh
 * must be rotated into the tangent plane (local +Z = zenith) or it ends up
 * tilted / edge-on and invisible. Built directly from the WGS84 geodetic
 * surface normal — no dependency on projection helpers.
 */
const DEG2RAD = Math.PI / 180;
const localFrameQuaternion = (mapView: MapView, lat: number, lng: number): Quaternion => {
    if (mapView.projection === mercatorProjection) {
        return new Quaternion();
    }
    const phi = lat * DEG2RAD;
    const lambda = lng * DEG2RAD;
    const up = new Vector3(
        Math.cos(phi) * Math.cos(lambda),
        Math.cos(phi) * Math.sin(lambda),
        Math.sin(phi)
    );
    const east = new Vector3(-Math.sin(lambda), Math.cos(lambda), 0);
    const north = new Vector3().crossVectors(up, east);
    const basis = new Matrix4().makeBasis(east, north, up);
    return new Quaternion().setFromRotationMatrix(basis);
};

/** The ONLY tagged object: a horizontal mirror platform on the map plane. */
const addMirrorPlatform = (mapView: MapView): IReflectiveObjectHandle => {
    const material = createSurfaceMaterial({ preset: "mirror", color: 0x8a9096 });
    const platform = new Mesh(new PlaneGeometry(PLATFORM_SIZE, PLATFORM_SIZE), material);
    platform.quaternion.copy(localFrameQuaternion(mapView, CENTER_LAT, CENTER_LNG));
    platform.anchor = new GeoCoordinates(CENTER_LAT, CENTER_LNG, PLATFORM_ALT);
    mapView.mapAnchors.add(platform);
    return mapView.mapRenderingManager.addReflectiveObject(platform);
};

/** Untagged content to be reflected — a single red monolith. */
const addMonolith = (mapView: MapView): void => {
    const h = 200;
    const box = new Mesh(
        new BoxGeometry(60, 60, h),
        new MeshBasicNodeMaterial({ color: 0xe74c3c })
    );
    box.position.setZ(h / 2);
    box.quaternion.copy(localFrameQuaternion(mapView, CENTER_LAT + 0.0008, CENTER_LNG));
    box.anchor = new GeoCoordinates(CENTER_LAT + 0.0008, CENTER_LNG, PLATFORM_ALT);
    mapView.mapAnchors.add(box);
};

const setupGui = (mapView: MapView, handle: IReflectiveObjectHandle, gui: GUI): void => {
    const ssr = mapView.mapRenderingManager.ssr;
    const state = {
        ssrEnabled: ssr.enabled,
        intensity: ssr.intensity,
        resolutionScale: ssr.resolutionScale,
        maxRayDistance: ssr.maxRayDistance,
        debug: urlSsrDebug,
        floorReflectivity: 0.95,
        floorRoughness: 0.02
    };

    const pass = gui.addFolder("SSR Pass");
    pass.add(state, "ssrEnabled").name("enabled").onChange(applyPass);
    pass.add(state, "intensity", 0, 2, 0.05).name("intensity").onChange(applyPass);
    pass.add(state, "resolutionScale", 0.25, 1, 0.05).name("resolution").onChange(applyPass);
    pass.add(state, "maxRayDistance", 500, 8000, 100).name("max dist (m)").onChange(applyPass);
    pass.add(state, "debug", 0, 2, 1).name("debug (0/1/2)").onChange(applyPass);
    pass.open();

    const floor = gui.addFolder("Mirror Surface");
    floor
        .add(state, "floorReflectivity", 0.01, 1, 0.01)
        .name("reflectivity")
        .onChange(applySurface);
    floor.add(state, "floorRoughness", 0.01, 0.6, 0.01).name("roughness").onChange(applySurface);
    floor.open();

    function applyPass(): void {
        mapView.patchTheme({
            postEffects: {
                ssr: {
                    enabled: state.ssrEnabled,
                    intensity: state.intensity,
                    resolutionScale: state.resolutionScale,
                    maxRayDistance: state.maxRayDistance,
                    debug: state.debug
                }
            }
        });
        mapView.update();
    }

    function applySurface(): void {
        handle.update({
            reflectivity: state.floorReflectivity,
            roughness: state.floorRoughness
        });
        mapView.update();
    }
};

/** Satellite imagery + DEM terrain (ArcGIS imagery over the DEM source). */
const configureTerrain = (mapView: MapView): void => {
    const demTerrain = new DEMTerrainSource({
        source: "dem_terrain/source.json"
    });
    mapView.setElevationSource(demTerrain);
    demTerrain.addWebTileDataSource(
        new ArcGISTileProvider({
            minDataLevel: 0,
            maxDataLevel: 18
        })
    );
};

const main = async (): Promise<void> => {
    const canvas = getMapCanvas();
    const mapView = initializeMapView(canvas);
    window.__mapView = mapView;

    initializeMapControls(mapView, canvas);
    configureTerrain(mapView);

    const handle = addMirrorPlatform(mapView);
    addMonolith(mapView);

    mapView.addEventListener(MapViewEventNames.ThemeLoaded, () => {
        setupGui(mapView, handle, new GUI());
    });

    mapView.update();
};

main();

/**
 * MapView instance attached for debugging in the browser console.
 */
declare global {
    interface Window {
        __mapView: MapView;
    }
}
