import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControlsUI,
    MapControls
} from "@flywave/flywave.gl";

/**
 * Example-only access to MapView internals for live camera/AA/sun-time
 * debugging. These members are not part of the public API; the shape is kept
 * here so the example stays type-checked instead of reaching through `any`.
 */
interface MapViewInternals {
    mapRenderingManager?: {
        viewRenderManager?: {
            config: { toneMappingMode: string; antialiasing: "none" | "taa" | "smaa" };
            exposure: { value: number };
            needsUpdate: boolean;
        };
    };
    m_atmosphereSystem?: {
        m_toneMappingMode: string;
        m_toneMappingExposure: number;
    };
    m_sceneEnvironment?: {
        atmosphere?: { setCurrentDate(date: Date, smooth: boolean): void };
    };
    renderer?: {
        toneMapping: number;
        toneMappingExposure: number;
    };
    updateCameras(...args: unknown[]): void;
    getRteCamera?(): MapView["camera"] | null;
}

// Demo globals exposed for interactive debugging in the browser console.
interface DemoWindow extends Window {
    mapView?: MapView;
    toggleRotate?: () => void;
}

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
        postEffects: {
            antialiasing: "smaa"
        },
        atmosphere: {
            enabled: true,
            sunCastShadow: false,
            clouds: { quality: "low"  },

            sunTime: (() => {
                const year = new Date().getFullYear();
                const epoch = Date.UTC(year, 0, 1, 0, 0, 0, 0);
                const longitude = 30;
                const offset = longitude / 15;
                const dayOfYear = 1;
                const timeOfDay = 9;
                return epoch + (dayOfYear * 24 + timeOfDay - offset) * 3600000;
            })()
        }
    }
});

mapView.beginAnimation();

const controls = new MapControls(mapView);
const ui = new MapControlsUI(controls);

// Camera info HUD
const camHud = document.createElement("div");
camHud.id = "camHud";
camHud.style.cssText =
    "position:absolute;bottom:10px;left:10px;z-index:9999;font-size:12px;color:#0f0;background:rgba(0,0,0,0.7);padding:4px 8px;border-radius:4px;font-family:monospace;pointer-events:none;";
camHud.textContent = "cam: loading...";
document.body.appendChild(camHud);
// Disable VRM tone mapping for debugging.
// setToneMapping may run before VRM exists, so we hook updateCameras to
// force VRM config once until it sticks, then stop to avoid pipeline rebuilds.
let _toneMappingApplied = false;
const applyToneMappingOverride = () => {
    if (_toneMappingApplied) return;
    const internals = mapView as unknown as MapViewInternals;
    const vrm = internals.mapRenderingManager?.viewRenderManager;
    if (vrm) {
        vrm.config.toneMappingMode = "agx-punchy";
        vrm.exposure.value = 3;
        vrm.needsUpdate = true;
        _toneMappingApplied = true;
    }
    const atmoSystem = internals.m_atmosphereSystem;
    if (atmoSystem) {
        atmoSystem.m_toneMappingMode = "agx-punchy";
        atmoSystem.m_toneMappingExposure = 3;
    }
    const renderer = internals.renderer;
    if (renderer) {
        renderer.toneMapping = 0;
        renderer.toneMappingExposure = 1;
    }
};

// Match reference project camera
const internalsForHook = mapView as unknown as MapViewInternals;
const origUpdateCameras = internalsForHook.updateCameras.bind(mapView);
internalsForHook.updateCameras = function (...args: unknown[]) {
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
    const rte = (mapView as unknown as MapViewInternals).getRteCamera?.();

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
    cam.near = 1;
    cam.far = 4e5;
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

    // Camera info HUD
    const hud = document.getElementById("camHud");
    if (hud) {
        const m = cam.matrixWorld.elements;
        const p = cam.projectionMatrix.elements;
        hud.textContent =
            `cam: fov=${cam.fov} near=${cam.near.toFixed(1)} far=${cam.far} | ` +
            `MW=[${m[0].toFixed(3)},${m[1].toFixed(3)},${m[2].toFixed(3)},${m[4].toFixed(
                3
            )},${m[5].toFixed(3)},${m[6].toFixed(3)},${m[8].toFixed(3)},${m[9].toFixed(
                3
            )},${m[10].toFixed(3)}] | ` +
            `up=(${cam.up.x.toFixed(3)},${cam.up.y.toFixed(3)},${cam.up.z.toFixed(3)})`;
    }
};

(window as unknown as DemoWindow).mapView = mapView;

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

(window as unknown as DemoWindow).toggleRotate = () => {
    _autoRotate = !_autoRotate;
};

// Anti-aliasing toggle button: cycles none → smaa → taa → none for A/B compare
const aaModes: ("none" | "smaa" | "taa")[] = ["none", "smaa", "taa"];
let _aaIndex = aaModes.indexOf("smaa"); // default matches postEffects config
const aaBtn = document.createElement("button");
aaBtn.textContent = `AA: ${aaModes[_aaIndex]}`;
aaBtn.style.cssText =
    "position:absolute;top:10px;right:120px;z-index:9999;padding:8px 16px;font-size:14px;cursor:pointer;";
document.body.appendChild(aaBtn);
aaBtn.addEventListener("click", () => {
    _aaIndex = (_aaIndex + 1) % aaModes.length;
    const mode = aaModes[_aaIndex];
    aaBtn.textContent = `AA: ${mode}`;
    const vrm = (mapView as unknown as MapViewInternals).mapRenderingManager?.viewRenderManager;
    if (vrm) {
        vrm.config.antialiasing = mode;
        vrm.needsUpdate = true;
    }
});

// Sun time slider (adjust hour of day to see god rays at different sun angles)
const sunTimeLabel = document.createElement("label");
sunTimeLabel.textContent = "Hour: 9.0";
sunTimeLabel.style.cssText =
    "position:absolute;top:50px;right:10px;z-index:9999;font-size:14px;color:#fff;background:rgba(0,0,0,0.6);padding:4px 8px;border-radius:4px;pointer-events:none;";
document.body.appendChild(sunTimeLabel);

const sunTimeSlider = document.createElement("input");
sunTimeSlider.type = "range";
sunTimeSlider.min = "0";
sunTimeSlider.max = "24";
sunTimeSlider.step = "0.1";
sunTimeSlider.value = "9";
sunTimeSlider.style.cssText = "position:absolute;top:75px;right:10px;z-index:9999;width:180px;";
document.body.appendChild(sunTimeSlider);

sunTimeSlider.addEventListener("input", () => {
    const hour = parseFloat(sunTimeSlider.value);
    sunTimeLabel.textContent = `Hour: ${hour.toFixed(1)}`;
    const year = new Date().getFullYear();
    const epoch = Date.UTC(year, 0, 1, 0, 0, 0, 0);
    const longitude = 30;
    const offset = longitude / 15;
    const dayOfYear = 1;
    const sunTime = epoch + (dayOfYear * 24 + hour - offset) * 3600000;
    const atmo = (mapView as unknown as MapViewInternals).m_sceneEnvironment?.atmosphere;
    if (atmo) {
        atmo.setCurrentDate(new Date(sunTime), true);
    }
});
