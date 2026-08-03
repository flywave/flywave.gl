// @ts-nocheck
import * as THREE from "three/webgpu";
import * as W from "three";
import { ImpostorMesh } from "@flywave/flywave-impostor";

const FRAME_SIZE = 8;
const ATLAS_RES = 512;

const canvas = document.getElementById("mapCanvas") as HTMLCanvasElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a2e);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);
camera.position.set(8, 6, 8);

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
await renderer.init();
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);

const controls = new (await import("three/addons/controls/OrbitControls.js")).OrbitControls(
    camera,
    canvas
);
controls.enableDamping = true;
controls.target.set(0, 1.5, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 0.6));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);
scene.add(new THREE.GridHelper(20, 20, 0x333366, 0x222244));

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

const originalModel = buildModel(THREE);
scene.add(originalModel);
let impostorMesh = null;
let bakeResult = null;
let mode = "original";

const ui = document.createElement("div");
ui.style.cssText =
    "position:absolute;top:10px;left:10px;z-index:10;background:rgba(0,0,0,0.7);padding:12px;border-radius:8px;font-family:monospace;color:#ccc";
ui.innerHTML = `
    <div style="font-size:15px;font-weight:bold;margin-bottom:8px">Octahedral Impostor (TSL)</div>
    <button id="bake" style="display:block;width:100%;margin:4px 0;padding:6px;background:#e94560;color:#fff;border:none;border-radius:4px;cursor:pointer">Bake Impostor</button>
    <button id="orig" class="active" style="display:block;width:100%;margin:2px 0;padding:4px;background:#4a3a6e;color:#fff;border:1px solid #6a5a8e;border-radius:4px;cursor:pointer">Original</button>
    <button id="imp" disabled style="display:block;width:100%;margin:2px 0;padding:4px;background:#333;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer">Impostor</button>
    <button id="both" disabled style="display:block;width:100%;margin:2px 0;padding:4px;background:#333;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer">Both</button>`;
document.body.appendChild(ui);

async function doBake() {
    const btn = document.getElementById("bake");
    btn.disabled = true;
    btn.textContent = "Baking...";
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
    btn.textContent = "Bake Done!";
    btn.disabled = false;
    document.getElementById("imp").disabled = false;
    document.getElementById("both").disabled = false;
}

function refreshDisplay() {
    originalModel.visible = mode === "original" || mode === "both";
    originalModel.position.set(mode === "both" ? -3 : 0, 0, 0);
    if (impostorMesh) {
        scene.remove(impostorMesh);
        impostorMesh.dispose();
        impostorMesh = null;
    }
    if ((mode === "impostor" || mode === "both") && bakeResult) {
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
        impostorMesh.position.y = centerY;
        scene.add(impostorMesh);
    }
}

document.getElementById("bake").onclick = doBake;
document.getElementById("orig").onclick = () => {
    mode = "original";
    refreshDisplay();
    updateBtns();
};
document.getElementById("imp").onclick = () => {
    mode = "impostor";
    refreshDisplay();
    updateBtns();
};
document.getElementById("both").onclick = () => {
    mode = "both";
    refreshDisplay();
    updateBtns();
};

function updateBtns() {
    for (const [id, m] of [
        ["orig", "original"],
        ["imp", "impostor"],
        ["both", "both"]
    ]) {
        const btn = document.getElementById(id);
        if (btn.disabled) {
            btn.style.background = "#222";
            btn.style.color = "#666";
            continue;
        }
        btn.style.background = mode === m ? "#4a3a6e" : "#333";
        btn.style.color = mode === m ? "#fff" : "#ccc";
    }
}

addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (impostorMesh && impostorMesh.visible) {
        impostorMesh.updateCamPos(camera.position);
    }
    renderer.renderAsync(scene, camera);
}
animate();
