// @ts-nocheck
/**
 * Cloud Textures Preview
 *
 * Generates the 4 procedural cloud textures using WebGPU compute shaders
 * and displays them on screen for visual verification.
 *
 * Run with: FILTER_EXAMPLE=cloud-textures pnpm --filter @flywave/flywave-examples start
 * Open: http://localhost:8080/cloud-textures-preview.html
 */

import { OrthographicCamera, PlaneGeometry, Mesh, Scene, Vector3, WebGPURenderer, NodeMaterial } from "three/webgpu";
import { texture, texture3D, uv, vec3, vec4, Fn, uniform } from "three/tsl";


import { GUI } from "dat.gui";

import { CloudTextures } from "@flywave/flywave-atmosphere";

const CANVAS_ID = "mapCanvas";

async function main() {
    const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas #${CANVAS_ID} not found`);

    const renderer = new WebGPURenderer({ canvas, antialias: true });
    await renderer.init();

    const W = window.innerWidth;
    const H = window.innerHeight;
    renderer.setSize(W, H);
    renderer.setPixelRatio(window.devicePixelRatio);

    // --- Generate cloud textures ---
    const cloudTextures = new CloudTextures();
    cloudTextures.compute(renderer);

    // --- Scene setup ---
    const scene = new Scene();
    const camera = new OrthographicCamera(-2, 2, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const panelSize = 0.85;
    const gap = 0.15;
    const startX = -1.5;

    const labels: string[] = [];
    const meshes: Mesh[] = [];

    // Panel 1: CloudShape (128³, R channel)
    {
        const shapeSliceU = uniform(0.5);
        const geo = new PlaneGeometry(panelSize, panelSize);
        const mat = new NodeMaterial();
        mat.fragmentNode = Fn(() => {
            const val = texture3D(cloudTextures.shapeTexture, vec3(uv(), shapeSliceU)).r;
            return vec4(val, val, val, 1);
        })();
        const mesh = new Mesh(geo, mat);
        mesh.position.x = startX;
        mesh.userData.sliceU = shapeSliceU;
        scene.add(mesh);
        meshes.push(mesh);
        labels.push("CloudShape 128³");
    }

    // Panel 2: CloudShapeDetail (32³, R channel)
    {
        const detailSliceU = uniform(0.5);
        const geo = new PlaneGeometry(panelSize, panelSize);
        const mat = new NodeMaterial();
        mat.fragmentNode = Fn(() => {
            const val = texture3D(cloudTextures.shapeDetailTexture, vec3(uv(), detailSliceU)).r;
            return vec4(val, val, val, 1);
        })();
        const mesh = new Mesh(geo, mat);
        mesh.position.x = startX + panelSize + gap;
        mesh.userData.sliceU = detailSliceU;
        scene.add(mesh);
        meshes.push(mesh);
        labels.push("ShapeDetail 32³");
    }

    // Panel 3: LocalWeather (512², RGBA)
    {
        const geo = new PlaneGeometry(panelSize, panelSize);
        const mat = new NodeMaterial();
        mat.fragmentNode = texture(cloudTextures.localWeatherTexture);
        const mesh = new Mesh(geo, mat);
        mesh.position.x = startX + (panelSize + gap) * 2;
        scene.add(mesh);
        meshes.push(mesh);
        labels.push("LocalWeather 512²");
    }

    // Panel 4: Turbulence (128², RGB)
    {
        const geo = new PlaneGeometry(panelSize, panelSize);
        const mat = new NodeMaterial();
        mat.fragmentNode = texture(cloudTextures.turbulenceTexture);
        const mesh = new Mesh(geo, mat);
        mesh.position.x = startX + (panelSize + gap) * 3;
        scene.add(mesh);
        meshes.push(mesh);
        labels.push("Turbulence 128²");
    }

    // --- Labels ---
    const labelEls: HTMLElement[] = [];
    labels.forEach(text => {
        const el = document.createElement("div");
        el.textContent = text;
        el.style.cssText =
            "position:absolute;color:#0ff;font:13px monospace;background:rgba(0,0,0,0.7);padding:3px 8px;pointer-events:none;z-index:10;";
        document.body.appendChild(el);
        labelEls.push(el);
    });

    // --- GUI ---
    const gui = new GUI({ autoPlace: false });
    gui.domElement.style.position = "absolute";
    gui.domElement.style.top = "10px";
    gui.domElement.style.right = "10px";
    gui.domElement.style.zIndex = "100";
    document.body.appendChild(gui.domElement);

    const params = { shapeSlice: 0.5, detailSlice: 0.5 };

    gui.add(params, "shapeSlice", 0, 1, 0.01)
        .name("Shape Z")
        .onChange((v: number) => (meshes[0].userData.sliceU.value = v));
    gui.add(params, "detailSlice", 0, 1, 0.01)
        .name("Detail Z")
        .onChange((v: number) => (meshes[1].userData.sliceU.value = v));

    // --- Resize ---
    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        const aspect = w / h;
        camera.left = -2;
        camera.right = 2;
        camera.top = 1;
        camera.bottom = -1;
        camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);
    onResize();

    // --- Update labels ---
    const tmpVec = new Vector3();
    function updateLabels() {
        meshes.forEach((mesh, i) => {
            tmpVec.copy(mesh.position);
            tmpVec.y -= panelSize * 0.5 + 0.05;
            tmpVec.project(camera);
            const x = (tmpVec.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-tmpVec.y * 0.5 + 0.5) * window.innerHeight;
            const el = labelEls[i];
            el.style.left = `${x - 60}px`;
            el.style.top = `${y - 20}px`;
        });
    }

    // --- Render loop (simple, no PostProcessing needed) ---
    renderer.setAnimationLoop(async () => {
        updateLabels();
        await renderer.renderAsync(scene, camera);
    });
}

main().catch(err => {
    console.error(err);
    const div = document.createElement("div");
    div.textContent = `Error: ${err.message}`;
    div.style.cssText = "color:red;font:16px monospace;padding:20px;";
    document.body.appendChild(div);
});
