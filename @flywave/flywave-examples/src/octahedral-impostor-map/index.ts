// @ts-nocheck
import {
    MapView,
    GeoCoordinates,
    ellipsoidProjection,
    MapControls,
    MapControlsUI,
    CopyrightElementHandler,
    MapViewEventNames
} from "@flywave/flywave.gl";
import * as THREE from "three/webgpu";
import * as W from "three";
import { ImpostorMesh } from "@flywave/flywave-impostor";

const FRAME_SIZE = 8;
const ATLAS_RES = 512;
const MODEL_SCALE = 100;
const ANCHOR_ORIGINAL = new GeoCoordinates(40.721603666587, -73.96050108689394, 0);
const ANCHOR_IMPOSTOR = new GeoCoordinates(40.721603666587, -73.95750108689394, 0);

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

const mapView = new MapView({
    projection: ellipsoidProjection,
    target: new GeoCoordinates(40.721603666587, -73.96000108689394, 0),
    distance: 300,
    canvas,
    theme: { extends: "resources/tilezen_base_globe.json" }
});

const mapControls = new MapControls(mapView);
mapControls.enabled = true;
const ui = new MapControlsUI(mapControls, { zoomLevel: "input", projectionSwitch: true });
canvas.parentElement!.appendChild(ui.domElement);
CopyrightElementHandler.install("copyrightNotice", mapView);
window.addEventListener("resize", () => mapView.resize(innerWidth, innerHeight));
mapView.resize(innerWidth, innerHeight);
mapView.update();

function buildModel(lib) {
    const g = new lib.Group();
    g.add(
        new lib.Mesh(
            new lib.BoxGeometry(2, 2, 2),
            new lib.MeshStandardMaterial({ color: 0x4488ff, roughness: 0.4, metalness: 0.2 })
        )
    );
    const s = new lib.Mesh(
        new lib.SphereGeometry(0.6, 16, 12),
        new lib.MeshStandardMaterial({ color: 0xff6600, roughness: 0.3 })
    );
    s.position.set(1.5, 0.5, 0);
    g.add(s);
    const c = new lib.Mesh(
        new lib.ConeGeometry(0.5, 1.0, 8),
        new lib.MeshStandardMaterial({ color: 0x22cc44, roughness: 0.6 })
    );
    c.position.set(-0.5, 1.5, 0.5);
    c.rotation.z = 0.3;
    g.add(c);
    return g;
}

const uiPanel = document.createElement("div");
uiPanel.style.cssText =
    "position:absolute;top:10px;left:10px;z-index:100;background:rgba(20,20,40,0.85);color:#ccc;font-family:monospace;font-size:13px;padding:12px 16px;border-radius:8px;min-width:260px";
uiPanel.innerHTML = `
    <div style="font-size:15px;font-weight:bold;margin-bottom:8px">Octahedral Impostor (Map)</div>
    <div id="imp-status" style="margin-bottom:8px;color:#8af">Loading...</div>
    <button id="imp-bake" disabled style="width:100%;padding:6px;background:#e94560;color:#fff;border:none;border-radius:4px;cursor:pointer">Bake Impostor</button>
    <div style="display:flex;gap:4px;margin-top:4px">
        <button id="imp-both" disabled style="flex:1;padding:4px;background:#333;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer">Both</button>
        <button id="imp-orig" style="flex:1;padding:4px;background:#4a3a6e;color:#fff;border:1px solid #6a5a8e;border-radius:4px;cursor:pointer">Original</button>
        <button id="imp-imp" disabled style="flex:1;padding:4px;background:#333;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer">Impostor</button>
    </div>`;
canvas.parentElement!.appendChild(uiPanel);

const $ = id => document.getElementById(id);
const $$ = id => document.getElementById(id);
const setStatus = t => ($("imp-status").textContent = t);

let displayMode = "both";
let bakeResult = null;

const displayBox = buildModel(THREE);
displayBox.scale.setScalar(MODEL_SCALE);
displayBox.anchor = ANCHOR_ORIGINAL;
mapView.mapAnchors.add(displayBox);

let impostorMesh = null;

function refreshDisplay() {
    displayBox.visible = displayMode === "original" || displayMode === "both";
    if (impostorMesh) {
        mapView.mapAnchors.remove(impostorMesh);
        impostorMesh.dispose();
        impostorMesh = null;
    }
    if ((displayMode === "impostor" || displayMode === "both") && bakeResult) {
        const { albedo, atlasSize, camDist, centerY } = bakeResult;
        const c = document.createElement("canvas");
        c.width = atlasSize;
        c.height = atlasSize;
        c.getContext("2d").putImageData(new ImageData(albedo, atlasSize, atlasSize), 0, 0);
        const tex = new THREE.CanvasTexture(c);
        impostorMesh = new ImpostorMesh({
            data: {
                version: 1,
                frames: [FRAME_SIZE, FRAME_SIZE],
                scale: camDist / 2,
                aabbMax: camDist / 4,
                positionOffset: [0, centerY, 0],
                aabb: { min: [0, 0, 0], max: [0, 0, 0] },
                textures: {}
            },
            atlasTexture: tex
        });
        impostorMesh.scale.setScalar(MODEL_SCALE);
        impostorMesh.anchor = ANCHOR_IMPOSTOR;
        mapView.mapAnchors.add(impostorMesh);
    }
    mapView.update();
}

// RTE: update pivot direction each frame after mapAnchors positions are set
mapView.addEventListener(MapViewEventNames.WillRender, () => {
    if (!impostorMesh) return;
    impostorMesh.updateMatrixWorld(true);
    const objPos = new THREE.Vector3();
    impostorMesh.getWorldPosition(objPos);
    if (objPos.lengthSq() < 0.001) return; // skip if position not set yet
    const camDir = objPos.clone().negate().normalize();
    impostorMesh.updateCamPos(camDir);
});

async function doBake() {
    $$("imp-bake").disabled = true;
    setStatus(`Baking ${FRAME_SIZE}x${FRAME_SIZE}...`);
    const frameRes = Math.floor(ATLAS_RES / FRAME_SIZE);
    const bc = document.createElement("canvas");
    bc.width = frameRes;
    bc.height = frameRes;
    const br = new W.WebGLRenderer({
        canvas: bc,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true
    });
    br.setSize(frameRes, frameRes);
    br.setClearColor(0x000000, 0);
    br.autoClear = false;
    const bs = new W.Scene();
    bs.add(new W.HemisphereLight(0xffffff, 0x888888, 1.0));
    const bd = new W.DirectionalLight(0xffffff, 1.0);
    bd.position.set(5, 10, 5);
    bs.add(bd);
    const model = buildModel(W);
    const bbox = new W.Box3().setFromObject(model);
    const center = bbox.getCenter(new W.Vector3());
    const size = bbox.getSize(new W.Vector3());
    const camDist = size.length();
    model.position.sub(center);
    const bakeCam = new W.OrthographicCamera(
        -camDist / 2,
        camDist / 2,
        camDist / 2,
        -camDist / 2,
        0.01,
        camDist * 2
    );
    const rt = new W.WebGLRenderTarget(frameRes, frameRes, {
        format: W.RGBAFormat,
        type: W.UnsignedByteType
    });
    bs.add(model);
    const meshes = [];
    model.traverse(c => {
        if (c.isMesh) meshes.push(c);
    });
    const origMats = new Map();
    meshes.forEach(m => origMats.set(m, m.material));
    const albedoA = new Uint8ClampedArray(ATLAS_RES * ATLAS_RES * 4);
    const buf = new Uint8Array(frameRes * frameRes * 4);
    const fps = ATLAS_RES / FRAME_SIZE;
    function copyFrame(src, atlas, fx, fy) {
        for (let py = 0; py < frameRes; py++) {
            const ay = Math.floor(fy * fps + (py * fps) / frameRes);
            if (ay >= ATLAS_RES) continue;
            for (let px = 0; px < frameRes; px++) {
                const ax = Math.floor(fx * fps + (px * fps) / frameRes);
                if (ax >= ATLAS_RES) continue;
                const si = ((frameRes - 1 - py) * frameRes + px) * 4;
                const di = (ay * ATLAS_RES + ax) * 4;
                atlas[di] = src[si];
                atlas[di + 1] = src[si + 1];
                atlas[di + 2] = src[si + 2];
                atlas[di + 3] = src[si + 3];
            }
        }
    }
    for (let y = 0; y < FRAME_SIZE; y++) {
        for (let x = 0; x < FRAME_SIZE; x++) {
            const px = (x / (FRAME_SIZE - 1)) * 2 - 1,
                pz = (y / (FRAME_SIZE - 1)) * 2 - 1;
            let py = 1 - Math.abs(px) - Math.abs(pz),
                rx = px,
                rz = pz;
            if (py < 0) {
                rx = Math.sign(px) * (1 - Math.abs(pz));
                rz = Math.sign(pz) * (1 - Math.abs(px));
            }
            const d = new W.Vector3(rx, py, rz).normalize();
            bakeCam.position.copy(d.clone().multiplyScalar(camDist));
            bakeCam.lookAt(0, 0, 0);
            bakeCam.updateMatrixWorld();
            br.setRenderTarget(rt);
            br.setClearColor(0x000000, 0);
            meshes.forEach(m => (m.material = origMats.get(m)));
            br.clear(true, true, true);
            br.render(bs, bakeCam);
            br.readRenderTargetPixels(rt, 0, 0, frameRes, frameRes, buf);
            copyFrame(buf, albedoA, x, y);
        }
    }
    meshes.forEach(m => (m.material = origMats.get(m)));
    br.dispose();
    rt.dispose();
    bakeResult = { albedo: albedoA, atlasSize: ATLAS_RES, camDist, centerY: center.y };
    setStatus("Bake complete!");
    $$("imp-bake").disabled = false;
    $$("imp-imp").disabled = false;
    $$("imp-both").disabled = false;
    displayMode = "both";
    refreshDisplay();
}

function updateBtns() {
    for (const [id, m] of [
        ["imp-both", "both"],
        ["imp-orig", "original"],
        ["imp-imp", "impostor"]
    ]) {
        const btn = $$(id);
        if (btn.disabled) {
            btn.style.background = "#222";
            btn.style.color = "#666";
            continue;
        }
        btn.style.background = displayMode === m ? "#4a3a6e" : "#333";
        btn.style.color = displayMode === m ? "#fff" : "#ccc";
    }
}

$("imp-bake").addEventListener("click", doBake);
$("imp-orig").addEventListener("click", () => {
    displayMode = "original";
    updateBtns();
    refreshDisplay();
});
$("imp-imp").addEventListener("click", () => {
    displayMode = "impostor";
    updateBtns();
    refreshDisplay();
});
$("imp-both").addEventListener("click", () => {
    displayMode = "both";
    updateBtns();
    refreshDisplay();
});

setStatus("Test model loaded. Click 'Bake Impostor'.");
$$("imp-bake").disabled = false;
window.mapView = mapView;
