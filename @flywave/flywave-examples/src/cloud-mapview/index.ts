import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControlsUI,
    MapControls
} from "@flywave/flywave.gl";

const getMapCanvas = (): HTMLCanvasElement => {
    const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;
    if (!canvas) {
        throw new Error("Canvas #mapCanvas not found");
    }
    return canvas;
};

const canvas = getMapCanvas();

const mapView = new MapView({
    projection: ellipsoidProjection,
    target: new GeoCoordinates(35.0, 30.0, 300),
    zoomLevel: 17,
    tilt: 45,
    heading: 0,
    canvas: canvas,
    theme: {
        atmosphere: {
            enabled: true,
            sunCastShadow: false,
            clouds: true,
            sunTime: (() => {
                const year = new Date().getFullYear();
                const epoch = Date.UTC(year, 0, 1, 0, 0, 0, 0);
                const longitude = 30;
                const offset = longitude / 15;
                const dayOfYear = 1;
                const timeOfDay = 9.0;
                return epoch + (dayOfYear * 24 + timeOfDay - offset) * 3600000;
            })()
        }
    }
});

mapView.beginAnimation();

const controls = new MapControls(mapView);
const ui = new MapControlsUI(controls);
// Disable VRM tone mapping for debugging.
// setToneMapping may run before VRM exists, so we hook updateCameras to
// force VRM config once until it sticks, then stop to avoid pipeline rebuilds.
let _toneMappingApplied = false;
const applyToneMappingOverride = () => {
    if (_toneMappingApplied) return;
    const vrm = (mapView as any).mapRenderingManager?.viewRenderManager;
    if (vrm) {
        vrm.config.toneMappingMode = "linear";
        vrm.exposure.value = 1;
        vrm.needsUpdate = true;
        _toneMappingApplied = true;
    }
    const atmoSystem = (mapView as any).m_atmosphereSystem;
    if (atmoSystem) {
        atmoSystem.m_toneMappingMode = "linear";
        atmoSystem.m_toneMappingExposure = 1;
    }
    const renderer = (mapView as any).renderer;
    if (renderer) {
        renderer.toneMapping = 0; // NoToneMapping
        renderer.toneMappingExposure = 1;
    }
};

// Match reference project camera
const origUpdateCameras = (mapView as any).updateCameras.bind(mapView);
(mapView as any).updateCameras = function (...args: any[]) {
    origUpdateCameras(...args);
    applyOverride();
};

const camPos = [4529606.670615005, 2614762.716348598, 3638805.5858316943];
const camQuat = [
    0.341611239061481, 3.177626864111724e-11, -0.42250890119681356, 0.8395165214314373
];
const camUp = [0.7094064060180906, 0.40957597947938945, 0.5735765582152];

const applyOverride = () => {
    applyToneMappingOverride();

    if (_autoRotate) {
        _headingOffset += 0.002;
    }

    const cam = mapView.camera;
    const rte = (mapView as any).getRteCamera?.();

    cam.position.set(camPos[0], camPos[1], camPos[2]);
    cam.quaternion.set(camQuat[0], camQuat[1], camQuat[2], camQuat[3]);
    cam.up.set(camUp[0], camUp[1], camUp[2]);

    // Apply heading rotation around camera up axis
    if (_headingOffset !== 0) {
        const headingQuat = cam.quaternion.clone();
        headingQuat.setFromAxisAngle(cam.up, _headingOffset);
        cam.quaternion.premultiply(headingQuat);
    }

    cam.rotation.order = "XYZ";
    cam.fov = 75;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    if (rte) {
        rte.position.setScalar(0);
        rte.quaternion.copy(cam.quaternion);
        rte.up.copy(cam.up);
        rte.rotation.order = "XYZ";
        rte.fov = 75;
        rte.near = 1;
        rte.far = 4e5;
        rte.aspect = cam.aspect;
        rte.updateProjectionMatrix();
        rte.updateMatrixWorld(true);
    }
};

(window as any).mapView = mapView;

// Auto-rotate camera for temporal reprojection testing
let _autoRotate = false;
let _headingOffset = 0;

const btn = document.createElement("button");
btn.textContent = "Auto Rotate";
btn.style.cssText =
    "position:absolute;top:10px;right:10px;z-index:9999;padding:8px 16px;font-size:14px;cursor:pointer;";
document.body.appendChild(btn);
btn.addEventListener("click", () => {
    _autoRotate = !_autoRotate;
    btn.textContent = _autoRotate ? "Stop Rotate" : "Auto Rotate";
});

(window as any).toggleRotate = () => {
    _autoRotate = !_autoRotate;
};
