// @ts-nocheck
/**
 * Cloud Rendering Preview
 *
 * Run: FILTER_EXAMPLE=cloud-render pnpm --filter @flywave/flywave-examples start
 * Open: http://localhost:8080/cloud-render.html
 */

import { PerspectiveCamera, OrthographicCamera, PlaneGeometry, Mesh, Scene, Vector3 } from "three";
import { WebGPURenderer, NodeMaterial } from "three/webgpu";
import { Fn, vec3, vec4, uniform, uv, normalize, float } from "three/tsl";
import { GUI } from "dat.gui";

import {
    CloudTextures,
    CloudLayers,
    CloudUniforms,
    createCloudRenderer
} from "@flywave/flywave-atmosphere";

const CANVAS_ID = "mapCanvas";
const EARTH_RADIUS = 6371000;

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
    await cloudTextures.load(renderer);

    // --- Cloud uniforms ---
    const layers = new CloudLayers(CloudLayers.DEFAULT);
    const uniforms = new CloudUniforms(layers);

    // Link textures
    uniforms.localWeatherTexture = cloudTextures.localWeatherTexture;
    uniforms.shapeTexture = cloudTextures.shapeTexture;
    uniforms.shapeDetailTexture = cloudTextures.shapeDetailTexture;
    uniforms.turbulenceTexture = cloudTextures.turbulenceTexture;

    // Exact values from three-geospatial CloudsEffect
    uniforms.coverage.value = 0.3;
    uniforms.scatteringCoefficient.value = 1;
    uniforms.absorptionCoefficient.value = 0;

    // Texture repeats
    uniforms.localWeatherRepeat.value.setScalar(100);
    uniforms.shapeRepeat.value.setScalar(0.0003);
    uniforms.shapeDetailRepeat.value.setScalar(0.006);
    uniforms.turbulenceRepeat.value = 20;
    uniforms.turbulenceDisplacement.value = 350;

    // Raymarch parameters (medium quality)
    uniforms.minDensity.value = 1e-4;
    uniforms.minExtinction.value = 1e-4;
    uniforms.minTransmittance.value = 0.01;
    uniforms.minStepSize.value = 50;
    uniforms.maxStepSize.value = 1000;
    uniforms.maxRayDistance.value = 100000;
    uniforms.perspectiveStepScale.value = 1.01;
    uniforms.maxIterationCountToSun.value = 2;

    // Scattering
    uniforms.skyLightScale.value = 1;
    uniforms.powderScale.value = 0.8;
    uniforms.powderExponent.value = 150;

    // White sun, blue sky
    uniforms.sunIrradianceMin.value.set(2.0, 2.0, 2.0);
    uniforms.sunIrradianceMax.value.set(2.5, 2.5, 2.5);
    uniforms.skyIrradianceMin.value.set(0.2, 0.4, 0.8);
    uniforms.skyIrradianceMax.value.set(0.4, 0.6, 1.0);

    // Sun direction (20° elevation)
    {
        const rad = (20 * Math.PI) / 180;
        uniforms.sunDirection.value.copy(
            new Vector3(Math.cos(rad), Math.sin(rad), -0.3).normalize()
        );
    }

    // --- Cloud renderer ---
    const renderClouds = createCloudRenderer(uniforms);

    // --- Camera setup ---
    // Camera at 3000m, above low/mid cloud layers, looking down at ~30°
    const camera = new PerspectiveCamera(70, W / H, 1, 1e7);
    camera.position.set(0, EARTH_RADIUS + 3000, 0);

    camera.rotation.order = "YXZ";
    camera.rotation.set(-0.5, 0, 0); // look ~30° downward

    const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);

    // --- Full screen quad ---
    const scene = new Scene();
    const camPosU = uniform(new Vector3(0, EARTH_RADIUS + 3000, 0));
    const camFwdU = uniform(new Vector3());
    const camRightU = uniform(new Vector3());
    const camUpU = uniform(new Vector3());

    function updateCam() {
        camera.updateMatrixWorld();
        const f = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const r = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const u = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        camPosU.value.copy(camera.position);
        camFwdU.value.copy(f);
        camRightU.value.copy(r);
        camUpU.value.copy(u);
    }
    updateCam();

    // --- Mouse controls ---
    let yaw = 0,
        pitch = -0.5;
    let isDragging = false;
    let lastX = 0,
        lastY = 0;

    canvas.addEventListener("mousedown", e => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });
    canvas.addEventListener("mousemove", e => {
        if (!isDragging) return;
        yaw -= (e.clientX - lastX) * 0.005;
        pitch -= (e.clientY - lastY) * 0.005;
        pitch = Math.max(-1.5, Math.min(1.5, pitch));
        lastX = e.clientX;
        lastY = e.clientY;
        camera.rotation.set(pitch, yaw, 0);
        updateCam();
    });
    window.addEventListener("mouseup", () => {
        isDragging = false;
    });

    // --- Full screen quad ---
    const geo = new PlaneGeometry(2, 2);
    const mat = new NodeMaterial();
    mat.depthTest = false;
    mat.depthWrite = false;

    mat.fragmentNode = Fn(() => {
        const ndc = uv().mul(2).sub(1);
        const fovRad = float((camera.fov * Math.PI) / 180);
        const tanHalfFov = fovRad.mul(0.5).tan();
        const aspect = float(W / H);

        const rayDir = normalize(
            vec3(camFwdU)
                .add(vec3(camRightU).mul(ndc.x.mul(tanHalfFov).mul(aspect)))
                .add(vec3(camUpU).mul(ndc.y.mul(tanHalfFov)))
        );

        const clouds = renderClouds(camPosU, rayDir, float(1e10));

        // Background sky color (gradient from horizon to zenith)
        const skyColor = vec3(0.3, 0.5, 0.8).mul(ndc.y.mul(0.5).add(0.5));

        // Blend clouds over sky
        return vec4(skyColor.mul(oneMinusFloat(clouds.a)).add(clouds.rgb), 1);
    })();

    function oneMinusFloat(x: any) {
        return float(1).sub(x);
    }

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);

    // --- GUI ---
    const gui = new GUI({ autoPlace: false });
    gui.domElement.style.position = "absolute";
    gui.domElement.style.top = "10px";
    gui.domElement.style.right = "10px";
    gui.domElement.style.zIndex = "100";
    document.body.appendChild(gui.domElement);

    const p = {
        coverage: 0.45,
        camHeight: 3000,
        sunAngle: 20
    };

    gui.add(p, "coverage", 0, 1, 0.01).onChange((v: number) => {
        uniforms.coverage.value = v;
    });
    gui.add(p, "camHeight", 500, 50000, 100).onChange((v: number) => {
        camera.position.y = EARTH_RADIUS + v;
        updateCam();
    });
    gui.add(p, "sunAngle", 0, 90, 1).onChange((v: number) => {
        const rad = (v * Math.PI) / 180;
        uniforms.sunDirection.value.copy(
            new Vector3(Math.cos(rad), Math.sin(rad), -0.3).normalize()
        );
    });

    // --- Resize ---
    function onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    // --- Info ---
    const info = document.createElement("div");
    info.style.cssText =
        "position:absolute;bottom:10px;left:10px;color:#0f0;font:12px monospace;background:rgba(0,0,0,0.7);padding:8px;z-index:10;";
    info.textContent = "Drag to look | GUI controls on right";
    document.body.appendChild(info);

    // --- Render ---
    let cloudTime = 0;
    renderer.setAnimationLoop(async () => {
        cloudTime += 0.0002; // wind speed
        uniforms.localWeatherOffset.value.set(cloudTime, cloudTime * 0.3);
        info.textContent = `Alt: ${(camera.position.y - EARTH_RADIUS).toFixed(0)}m | Yaw: ${(
            (yaw * 180) /
            Math.PI
        ).toFixed(0)}° Pitch: ${((pitch * 180) / Math.PI).toFixed(0)}°`;
        await renderer.renderAsync(scene, quadCamera);
    });
}

main().catch(err => {
    console.error(err);
    const div = document.createElement("div");
    div.textContent = `Error: ${err.message}`;
    div.style.cssText = "color:red;font:16px monospace;padding:20px;";
    document.body.appendChild(div);
});
