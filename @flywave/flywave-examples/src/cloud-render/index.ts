// @ts-nocheck
/**
 * Cloud Rendering Preview (Atmosphere + Clouds only)
 *
 * Uses CloudRenderNode which implements:
 *   - 1/4 resolution cloud rendering
 *   - Catmull-Rom upscale
 *   - Temporal accumulation (16-frame Bayer pattern)
 *   - Variance clipping (neighborhood clipping)
 *
 * Run: FILTER_EXAMPLE=cloud-render pnpm --filter @flywave/flywave-examples start
 * Open: http://localhost:8080/cloud-render.html
 */

import {
    PerspectiveCamera,
    OrthographicCamera,
    PlaneGeometry,
    Mesh,
    Scene,
    Vector3,
    NoToneMapping
} from "three";
import { WebGPURenderer, NodeMaterial } from "three/webgpu";
import {
    Fn,
    vec3,
    vec4,
    uniform,
    uv,
    normalize,
    float,
    dot,
    length,
    mix,
    sqrt,
    texture,
    screenUV
} from "three/tsl";
import { GUI } from "dat.gui";

import {
    AtmosphereContext,
    AtmosphereParameters,
    cloudRender,
    registerAtmosphereContext,
    registerAtmosphereContextBase,
    getCubeSphereUv
} from "@flywave/flywave-atmosphere";

const CANVAS_ID = "mapCanvas";
const EARTH_RADIUS = 6360000; // matches CloudUniforms.bottomRadius default

async function main() {
    const canvas = document.getElementById(CANVAS_ID) as HTMLCanvasElement;
    if (!canvas) throw new Error(`Canvas #${CANVAS_ID} not found`);

    const renderer = new WebGPURenderer({ canvas, antialias: true });
    await renderer.init();

    const W = window.innerWidth;
    const H = window.innerHeight;
    renderer.setPixelRatio(1);
    renderer.setSize(W, H);
    renderer.toneMapping = NoToneMapping;

    // --- Camera setup ---
    // Match reference Clouds-Basic story exactly.
    // Reference uses ECEF coords where camera world position is:
    //   (4529606, 2614762, 3638805) — from (lon=30°, lat=35°, alt=300m)
    // We treat ECEF as world (identity matrixWorldToECEF).
    const camera = new PerspectiveCamera(75, W / H, 1, 4e5);
    camera.position.set(4529606.670615005, 2614762.716348598, 3638805.5858316943);
    // Quaternion dumped from reference:
    camera.quaternion.set(
        0.341611239061481,
        3.177626864111724e-11,
        -0.42250890119681356,
        0.8395165214314373
    );
    camera.rotation.order = "XYZ";
    camera.updateMatrixWorld();

    const quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 2);

    // --- Atmosphere context ---
    const atmosphereParams = new AtmosphereParameters();
    const atmosphereContext = new AtmosphereContext(atmosphereParams);
    atmosphereContext.camera = camera;
    atmosphereContext.renderer = renderer;
    // ECEF identity = world space; sun direction set below
    atmosphereContext.matrixWorldToECEF.value.identity();
    {
        // Match reference exactly: sun direction for (lon=30°, lat=35°, Jan 1 9:00).
        // Dumped from reference story.
        const sunDir = new Vector3(0.22300214114771516, 0.8937423487449461, -0.3892231482111538);
        atmosphereContext.sunDirectionECEF.value.copy(sunDir);
    }
    atmosphereContext.cameraPositionECEF.value.copy(camera.position);
    // Match reference altitudeCorrection exactly (dumped from Clouds-Debug story).
    // This corrects the WGS84 ellipsoid ECEF position to the osculating sphere
    // of radius bottomRadius, so |cameraPosition + altitudeCorrection| = bottomRadius + geodetic_height.
    atmosphereContext.altitudeCorrectionECEF.value.set(
        -17858.25963455066,
        -10308.866722186096,
        10079.656185862143
    );
    registerAtmosphereContext(atmosphereContext);
    registerAtmosphereContextBase(atmosphereContext);

    // --- Mouse look (debug only) ---
    let yaw = 0,
        pitch = 0;
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
        camera.updateMatrixWorld();
    });
    window.addEventListener("mouseup", () => {
        isDragging = false;
    });

    // --- Full screen quad ---
    // CloudRenderNode takes a background color node and the renderer, then:
    //   1. Renders clouds at 1/4 resolution into its own MRT
    //   2. Upscales + temporal-accumulates into a resolve target
    //   3. Returns a node that blends resolved clouds over the background
    const scene = new Scene();

    const camPosU = uniform(new Vector3(0, 0, 0));
    const camFwdU = uniform(new Vector3(0, 0, -1));
    const camRightU = uniform(new Vector3(1, 0, 0));
    const camUpU = uniform(new Vector3(0, 1, 0));

    function updateCamUniforms() {
        camera.updateMatrixWorld();
        const f = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const r = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const u = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
        camPosU.value.copy(camera.position);
        camFwdU.value.copy(f);
        camRightU.value.copy(r);
        camUpU.value.copy(u);
    }
    updateCamUniforms();
    // DON'T manually override cameraPositionECEF - let AtmosphereContext handle it correctly
    // atmosphereContext.cameraPositionECEF.value.copy(camera.position);

    // Background: approximate sky radiance so the cloud-over-sky blend matches
    // reference (which uses a real sky). Without this, clouds render as raw
    // orange radiance against pure black.
    const backgroundNode = Fn(() => vec4(0, 0, 0, 1))();

    // Cloud render node — the heart of the system.
    // It internally calls createCloudRenderer() and manages all the buffers.
    const cloudsNode = cloudRender(backgroundNode, null, renderer);
    (window as any).__cloudsNode = cloudsNode;
    (window as any).__renderer = renderer;

    // Apply high quality preset to enable shadow length (light shafts)
    const cloudUniforms = (window as any).__cloudUniforms;
    if (cloudUniforms) {
        cloudUniforms.applyQualityPreset("high");
        // Wind animation: set non-zero velocity (matching reference Clouds-Vanilla)
        cloudUniforms.localWeatherVelocity.value.set(0.001, 0);
        cloudUniforms.shapeVelocity.value.set(0.001, 0, 0);
    }

    const geo = new PlaneGeometry(2, 2);
    const mat = new NodeMaterial();
    mat.depthTest = false;
    mat.depthWrite = false;
    const cloudsFrag = cloudsNode.context({ getAtmosphere: () => atmosphereContext });
    // Direct resolveRT display via OutputTextureNode (triggers CloudRenderNode
    // updateBefore so the pipeline actually renders each frame).
    // Matches ref cloudsEffect.frag: premultiplied alpha blend
    //   output.rgb = input.rgb * (1-a) + clouds.rgb
    //   output.a   = input.a   * (1-a) + clouds.a
    // EXCLUSION TEST: display lowResRT directly (bypass resolve pass)
    const cloudsResolve = (cloudsNode as any).resolveNodeTex;
    mat.fragmentNode = Fn(() => {
        const r = texture(cloudsResolve, screenUV);
        const result = backgroundNode.rgb.mul(float(1).sub(r.a)).add(r.rgb);
        return vec4(result, 1);
    })();

    // --- Pixel sampling for cross-project comparison ---
    // Half-float (IEEE 754-2008 binary16) → float32 decoder
    const halfToFloat = (h: number): number => {
        const s = (h >> 15) & 1;
        let e = (h >> 10) & 31;
        let m = h & 1023;
        if (e === 0) {
            // subnormal: normalize it
            if (m !== 0) {
                while (!(m & 1024)) {
                    m <<= 1;
                    e--;
                }
                m &= 1023;
            }
            e = 127 - 15;
        } else if (e === 31) {
            // inf/nan
            e = 255;
        } else {
            e += 127 - 15;
        }
        const bits = (s << 31) | (e << 23) | (m << 13);
        return new Float32Array(new Uint32Array([bits]).buffer)[0];
    };
    // Decode a Uint16Array (half-float RGBA pixels, row-stride `stridePixels`) to Float32Array (packed RGBA)
    const decodeHalfFloatPixels = (
        buf: Uint16Array,
        w: number,
        h: number,
        stridePixels: number
    ): Float32Array => {
        const out = new Float32Array(w * h * 4);
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const si = (y * stridePixels + x) * 4;
                const di = (y * w + x) * 4;
                out[di] = halfToFloat(buf[si]);
                out[di + 1] = halfToFloat(buf[si + 1]);
                out[di + 2] = halfToFloat(buf[si + 2]);
                out[di + 3] = halfToFloat(buf[si + 3]);
            }
        }
        return out;
    };
    const sampleRT = () => {
        if (window.__cloudsNode) {
            const renderer = window.__renderer;
            const cloudsNode = window.__cloudsNode as any;
            const W = cloudsNode.lowResRT.width;
            const H = cloudsNode.lowResRT.height;
            const bytesPerPixel = 8; // RGBA16Float
            const stridePixels = (Math.ceil((W * bytesPerPixel) / 256) * 256) / bytesPerPixel;
            (renderer as any)
                .readRenderTargetPixelsAsync(cloudsNode.lowResRT, 0, 0, W, H, 0)
                .then((buf: Uint16Array) => {
                    const floatBuf = decodeHalfFloatPixels(buf, W, H, stridePixels);
                    (window as any).__cloudsDebugSnapshot = {
                        w: W,
                        h: H,
                        buf,
                        stride: stridePixels,
                        floatBuf
                    };
                })
                .catch((e: Error) => {
                    (window as any).__cloudsDebugError = e.message;
                });
        }
    };
    // Console helper: read pixel (x,y) float values from latest snapshot
    (window as any).__cloudsDebugPixel = (x: number, y: number) => {
        const s = (window as any).__cloudsDebugSnapshot;
        if (!s) return "No snapshot. Wait for auto-sample (500ms).";
        const { w, h, floatBuf, stride } = s;
        if (x < 0 || x >= w || y < 0 || y >= h)
            return `Coord (${x},${y}) out of bounds [0-${w - 1}, 0-${h - 1}]`;
        const i = (y * w + x) * 4;
        return `(${floatBuf[i].toFixed(6)}, ${floatBuf[i + 1].toFixed(6)}, ${floatBuf[
            i + 2
        ].toFixed(6)}, ${floatBuf[i + 3].toFixed(6)})`;
    };
    // Console helper: dump a grid of pixels (e.g. 5x5 around center)
    (window as any).__cloudsDebugGrid = (cx?: number, cy?: number, halfSize = 2) => {
        const s = (window as any).__cloudsDebugSnapshot;
        if (!s) return "No snapshot.";
        const { w, h, floatBuf } = s;
        cx = cx ?? Math.floor(w / 2);
        cy = cy ?? Math.floor(h / 2);
        let out = `Pixel grid centered at (${cx},${cy}):\n`;
        for (let dy = -halfSize; dy <= halfSize; dy++) {
            const row: string[] = [];
            for (let dx = -halfSize; dx <= halfSize; dx++) {
                const px = cx + dx,
                    py = cy + dy;
                if (px < 0 || px >= w || py < 0 || py >= h) {
                    row.push("------");
                    continue;
                }
                const i = (py * w + px) * 4;
                row.push(
                    `(${floatBuf[i].toFixed(4)},${floatBuf[i + 1].toFixed(4)},${floatBuf[
                        i + 2
                    ].toFixed(4)},${floatBuf[i + 3].toFixed(4)})`
                );
            }
            out += `y=${cy + dy}: ${row.join(" | ")}\n`;
        }
        return out;
    };

    // ===== Standalone debug shader (Mode 12: rayDir; Mode 11: camHt/ground/mu; Mode 30: globeUv) =====
    const aspectUniform = uniform(W / H);
    const tanHalfFovU = uniform(Math.tan((camera.fov * Math.PI) / 360));
    const bottomRadiusU = uniform(EARTH_RADIUS);
    const cameraHeightU = uniform(300);
    const altCorrU = uniform(new Vector3(0, 0, 0));
    const debugModeU = uniform(0);
    const debugFrag = Fn(() => {
        const ndc = uv().mul(2).sub(1);
        const rayDir = normalize(
            camRightU
                .mul(ndc.x.mul(tanHalfFovU).mul(aspectUniform))
                .add(camUpU.mul(ndc.y.mul(tanHalfFovU)))
                .add(camFwdU)
        );

        const camPos = camPosU.add(altCorrU);
        const camLen = camPos.length();
        const mu = dot(camPos, rayDir).div(camLen);
        const camHeight = cameraHeightU;
        // TSL select(a, b): cond=true returns b (opposite of GLSL mix)
        const intersectsGroundF = mu.lessThan(0).select(float(0), float(1));

        // Ray-sphere intersection for min/max cloud heights
        const b = dot(rayDir, camPos);
        const r2 = dot(camPos, camPos);
        const rMin = bottomRadiusU.add(float(750)); // minHeight
        const cMin = r2.sub(rMin.mul(rMin));
        const dMin = b.mul(b).sub(cMin).max(0);
        const farMin = b.negate().add(sqrt(dMin));
        const rMax = bottomRadiusU.add(float(8000)); // maxHeight
        const cMax = r2.sub(rMax.mul(rMax));
        const dMax = b.mul(b).sub(cMax).max(0);
        const farMax = b.negate().add(sqrt(dMax));

        // Mode 10: rayNear/rayFar/intersectsScene — match ref: /200000, B=!intersectsScene
        const rayNear10 = farMin;
        const rayFar10 = farMax.min(float(200000));
        const m10 = debugModeU.equal(10).select(
            vec4(
                rayNear10.max(0).div(200000),
                rayFar10.max(0).div(200000),
                float(1), // no scene in standalone, intersectsScene=false → 1
                1
            ),
            vec4(0, 0, 0, 0)
        );

        // Mode 12: rayDir
        const m12 = debugModeU
            .equal(12)
            .select(vec4(rayDir.mul(0.5).add(0.5), 1), vec4(0, 0, 0, 0));
        // Mode 11: camHt/intersectsGround/mu
        const m11 = debugModeU
            .equal(11)
            .select(
                vec4(camHeight.div(2000), intersectsGroundF, mu.mul(0.5).add(0.5), 1),
                vec4(0, 0, 0, 0)
            );
        // Mode 30: globe UV at fixed sample pos (cameraPosition + rayDir * 100km)
        const debugPos30 = camPos.add(rayDir.mul(100000));
        const debugUv30 = getCubeSphereUv(debugPos30);
        const m30 = debugModeU.equal(30).select(vec4(debugUv30, 0.5, 1), vec4(0, 0, 0, 0));

        return m10.add(m12).add(m11).add(m30);
    });
    const origFragment = mat.fragmentNode;
    const applyDebugMode = (mode: number) => {
        if (mode === 10 || mode === 11 || mode === 12 || mode === 30) {
            debugModeU.value = mode;
            aspectUniform.value = window.innerWidth / window.innerHeight;
            tanHalfFovU.value = Math.tan((camera.fov * Math.PI) / 360);
            const u = (cloudsNode as any)?.uniforms;
            if (u) {
                cameraHeightU.value = u.cameraHeight.value;
                altCorrU.value.copy(atmosphereContext.altitudeCorrectionECEF.value);
            }
            mat.fragmentNode = debugFrag();
        } else if (mode >= 30 && mode < 40) {
            // In-shader debug modes (31/32/33): cloud shader writes debug color
            // to lowResRT. Bypass main material to show lowResRT directly.
            const lowResNode = (cloudsNode as any).lowResNode;
            mat.fragmentNode = Fn(() => vec4(texture(lowResNode).rgb, 1))();
            mat.needsUpdate = true;
        } else {
            mat.fragmentNode = origFragment;
        }
        mat.needsUpdate = true;
    };
    (window as any).__applyDebugMode = applyDebugMode;

    // Console helper: set cloud debug mode (affects CloudRenderNode shader output)
    (window as any).__cloudsDebugMode = (mode: number) => {
        const u = (cloudsNode as any)?.uniforms;
        if (u) u.debugMode.value = mode;
        applyDebugMode(mode);
        setTimeout(() => {
            renderer.render(scene, quadCamera);
            setTimeout(() => {
                renderer.render(scene, quadCamera);
                setTimeout(() => sampleRT(), 50);
            }, 50);
        }, 50);
    };

    const mesh = new Mesh(geo, mat);
    mesh.frustumCulled = false;
    scene.add(mesh);
    (window as any).__scene = scene;
    (window as any).__mesh = mesh;

    // --- GUI (limited; most params managed internally by CloudRenderNode) ---
    const gui = new GUI({ autoPlace: false });
    gui.domElement.style.position = "absolute";
    gui.domElement.style.top = "10px";
    gui.domElement.style.right = "10px";
    gui.domElement.style.zIndex = "100";
    document.body.appendChild(gui.domElement);

    const cam = gui.addFolder("camera");
    const cp = { height: 300, fov: 75 };
    cam.add(cp, "height", 100, 50000, 100).onChange((v: number) => {
        camera.position.y = EARTH_RADIUS + v;
        camera.updateMatrixWorld();
        updateCamUniforms();
    });

    // --- Animation loop ---
    let lastSampleTime = 0;
    let frameCount = 0;
    let fps = 0;
    let lastFpsTime = 0;
    const info =
        document.getElementById("info") || document.body.appendChild(document.createElement("div"));
    if (!document.getElementById("info")) {
        info.id = "info";
        info.style.cssText =
            "position:absolute;top:10px;left:10px;color:white;font:12px monospace;";
    }

    renderer.setAnimationLoop(() => {
        (cloudsNode as any)?.updateUniforms(atmosphereContext);
        renderer.render(scene, quadCamera);

        const now = performance.now();
        frameCount++;
        if (now - lastFpsTime > 500) {
            fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
            frameCount = 0;
            lastFpsTime = now;
        }
        info.textContent = `Alt: ${(camera.position.y - EARTH_RADIUS).toFixed(0)}m | Yaw: ${(
            (yaw * 180) /
            Math.PI
        ).toFixed(0)}° Pitch: ${((pitch * 180) / Math.PI).toFixed(0)}° | FPS: ${fps} | ${W}x${H}`;
    });
}

main().catch(err => {
    console.error(err);
    const div = document.createElement("div");
    div.textContent = `Error: ${err.message}`;
    div.style.cssText = "color:red;font:16px monospace;padding:20px;";
    document.body.appendChild(div);
});
