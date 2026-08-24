/*
 * Copyright (C) 2026 flywave.gl contributors
 *
 * Minimal reproduction of the Cesium GroundPolyline port on a bare
 * three.js WebGPURenderer — no map engine, no RTE, no tiles, no geo
 * projection. Terrain is analytic, so polyline nodes are sampled from the
 * exact surface function: if the algorithm is correct, the yellow line hugs
 * the ground from every camera angle.
 */
import { GUI } from "dat.gui";
import * as THREE from "three/webgpu";
import {
    Fn,
    If,
    abs,
    attribute,
    float,
    max,
    min,
    mix,
    screenUV,
    sign,
    step,
    texture,
    uniform,
    varying,
    vec3,
    vec4,
    cross,
    normalize,
    positionLocal,
    modelViewMatrix
} from "three/tsl";

/* ------------------------- procedural terrain ------------------------- */

const WORLD = 4000;

function terrainHeight(x: number, z: number): number {
    return (
        220 * Math.sin(x * 0.0012) * Math.cos(z * 0.0009) +
        90 * Math.sin(x * 0.004 + 1.7) +
        60 * Math.cos(z * 0.005 + 0.4) +
        25 * Math.sin((x + z) * 0.008)
    );
}

function makeTerrain(): THREE.Mesh {
    const segs = 220;
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, segs, segs);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
        pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardNodeMaterial({ color: 0x3a7d3a });
    const mesh = new THREE.Mesh(geo, mat);
    return mesh;
}

/* --------------------- curtain geometry (verbatim) -------------------- */

function buildCurtain(points: THREE.Vector3[], span: number): THREE.BufferGeometry {
    const nSeg = points.length - 1;
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(points.length - 1, i + 1)];
        dirs.push(b.clone().sub(a).normalize());
    }

    const count = nSeg * 4;
    const pos = new Float32Array(count * 3);
    const start = new Float32Array(count * 3);
    const end = new Float32Array(count * 3);
    const startN = new Float32Array(count * 3);
    const endN = new Float32Array(count * 3);
    const rightN = new Float32Array(count * 3);
    const side = new Float32Array(count);
    const index: number[] = [];
    const UP = new THREE.Vector3(0, 1, 0);

    for (let seg = 0; seg < nSeg; seg++) {
        const pA = points[seg];
        const pB = points[seg + 1];
        const travel = pB.clone().sub(pA).normalize();
        const right = new THREE.Vector3().crossVectors(UP, travel).normalize();

        const b = seg * 4;
        const verts = [
            pA.clone().addScaledVector(UP, -span),
            pA.clone().addScaledVector(UP, span),
            pB.clone().addScaledVector(UP, -span),
            pB.clone().addScaledVector(UP, span)
        ];
        const sides = [-1, 1, -1, 1];
        for (let k = 0; k < 4; k++) {
            const o = (b + k) * 3;
            verts[k].toArray(pos, o);
            pA.toArray(start, o);
            pB.toArray(end, o);
            dirs[seg].toArray(startN, o);
            dirs[seg + 1].clone().negate().toArray(endN, o);
            right.toArray(rightN, o);
            side[b + k] = sides[k];
        }
        index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aStartPos", new THREE.BufferAttribute(start, 3));
    g.setAttribute("aEndPos", new THREE.BufferAttribute(end, 3));
    g.setAttribute("aStartPlaneNormal", new THREE.BufferAttribute(startN, 3));
    g.setAttribute("aEndPlaneNormal", new THREE.BufferAttribute(endN, 3));
    g.setAttribute("aRightNormal", new THREE.BufferAttribute(rightN, 3));
    g.setAttribute("aSideSign", new THREE.BufferAttribute(side, 1));
    g.setIndex(index);
    return g;
}

/* ------------- curtain material: faithful VS/FS port ------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function customAttribute(name: string, type: string): any {
    return attribute(name, type);
}

class PureCurtainMaterial extends THREE.MeshBasicNodeMaterial {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public uniformsForFrame: Record<string, any>;

    constructor(depthTex: THREE.DepthTexture, gui: { widthPx: number }) {
        super({
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneMinusSrcAlphaFactor
        });
        this.side = THREE.DoubleSide;
        this.depthTest = false;

        const PLACEHOLDER = (() => {
            const t = new THREE.DataTexture(new Float32Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
            t.needsUpdate = true;
            return t;
        })();
        const depthNode = texture(PLACEHOLDER, screenUV);

        const halfWidthPx = uniform(Math.max(0.25, gui.widthPx / 2));
        const probe = uniform(0);
        const flipUniform = uniform(0);
        const skyRevUniform = uniform(0);
        this.uniformsForFrame = {
            halfWidthPx,
            probe,
            depthNode,
            flipUniform,
            skyRevUniform
        };

        /* ---- vertex stage: PolylineShadowVolumeVS, flat world ---- */
        const aStartPos = customAttribute("aStartPos", "vec3");
        const aEndPos = customAttribute("aEndPos", "vec3");
        const aStartN = customAttribute("aStartPlaneNormal", "vec3");
        const aEndN = customAttribute("aEndPlaneNormal", "vec3");
        const aRightN = customAttribute("aRightNormal", "vec3");
        const aSideSign = customAttribute("aSideSign", "float");

        const ecStart = modelViewMatrix.mul(vec4(aStartPos, 1.0)).xyz;
        const ecEnd = ecStart.add(modelViewMatrix.mul(vec4(aEndPos.sub(aStartPos), 0)).xyz);
        const startNormalEc = modelViewMatrix.mul(vec4(aStartN, 0)).xyz;
        const endNormalEc = modelViewMatrix.mul(vec4(aEndN, 0)).xyz;
        const rightNormalEc = modelViewMatrix.mul(vec4(aRightN, 0)).xyz;

        const startW = startNormalEc.dot(ecStart).negate();
        const endW = endNormalEc.dot(ecEnd).negate();
        const rightW = rightNormalEc.dot(ecStart).negate();
        const baseEC = modelViewMatrix.mul(vec4(positionLocal, 1.0)).xyz;

        const vStartPlane = varying(vec4(startNormalEc, startW));
        const vEndPlane = varying(vec4(endNormalEc, endW));
        const vRightPlane = varying(vec4(rightNormalEc, rightW));

        const dStart = startNormalEc.dot(baseEC).add(startW).abs();
        const dEnd = endNormalEc.dot(baseEC).add(endW).abs();
        const planeDirection = mix(endNormalEc, startNormalEc, step(dStart, dEnd));
        const upOrDown = normalize(cross(rightNormalEc, planeDirection));
        const normalEC = normalize(cross(planeDirection, upOrDown));

        // meters-per-pixel: |view z| * factor, factor synced from CPU.
        const mppFactor = uniform(0.001);
        this.uniformsForFrame.mppFactor = mppFactor;
        const pushDistance = mppFactor
            .mul(baseEC.z.abs())
            .mul(halfWidthPx.mul(2))
            .div(normalEC.dot(rightNormalEc));
        const expandedEC = baseEC.add(normalEC.mul(sign(aSideSign)).mul(pushDistance));

        // Half band width in METERS, evaluated at the volume itself and
        // interpolated (Cesium anchors width at the line, never at the
        // reconstructed surface point whose distance would inflate it).
        const vHalfWidthMeters = varying(mppFactor.mul(baseEC.z.abs()).mul(halfWidthPx));

        this.setupPositionView = () => expandedEC;

        /* ---- fragment stage -------------------------------------- */
        const reconProjInv = uniform(new THREE.Matrix4());
        this.uniformsForFrame.reconProjInv = reconProjInv;

        this.colorNode = Fn(() => {
            const depth = depthNode.r;
            const ndc = vec3(screenUV.x.mul(2).sub(1), screenUV.y.oneMinus().mul(2).sub(1), depth);
            const viewH = reconProjInv.mul(vec4(ndc, 1));
            const groundView = viewH.div(viewH.w).xyz;

            const halfMaxWidth = vHalfWidthMeters;
            const widthDist = abs(vRightPlane.xyz.dot(groundView).add(vRightPlane.w));
            const dFromStart = vStartPlane.xyz.dot(groundView).add(vStartPlane.w);
            const dFromEnd = vEndPlane.xyz.dot(groundView).add(vEndPlane.w);

            // Sky pixels hold the cleared depth (~1.0): nothing visible to
            // drape onto (the map-engine version rejects these via the
            // captured surface-type texture instead).
            const isSky = mix(
                step(float(0.9999), depth),
                step(depth, float(0.0001)),
                skyRevUniform
            );
            const insideF = float(1)
                .sub(step(halfMaxWidth, widthDist))
                .mul(step(float(0), dFromStart))
                .mul(step(float(0), dFromEnd))
                .mul(float(1).sub(isSky));

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let color: any = vec4(0);
            // probe 2 — raw depth grayscale
            color = mix(
                color,
                vec4(depth.xxx, 1),
                step(float(1.5), probe).mul(step(probe, float(2.5)))
            );
            // probe 3 — reconstructed distance in km
            const km = groundView.z.abs().mul(0.001);
            color = mix(
                color,
                vec4(km.xxx, 1),
                step(float(2.5), probe).mul(step(probe, float(3.5)))
            );
            // probe 4 — containment white/purple
            const insideColor = mix(vec4(0.25, 0, 0.35, 1), vec4(1, 1, 1, 1), insideF);
            color = mix(color, insideColor, step(float(3.5), probe));

            // normal output: PREMULTIPLIED yellow (blendSrc=One expects
            // rgb already scaled by alpha, otherwise rejected pixels add
            // flat color over the scene).
            const painted = vec4(vec3(1.0, 0.85, 0.0).mul(insideF), insideF);
            color = mix(color, painted, float(1).sub(step(float(0.5), probe)));

            If(probe.lessThan(float(0.5)), () => color.assign(painted));
            return color;
        })();
    }

    public setFlip(flip: number): void {
        this.uniformsForFrame.flipUniform.value = flip;
    }

    public setSkyReversed(rev: boolean): void {
        this.uniformsForFrame.skyRevUniform.value = rev ? 1 : 0;
    }

    public syncFrame(
        depthTexture: THREE.Texture,
        invProj: THREE.Matrix4,
        heightPx: number,
        fovDeg: number
    ): void {
        const u = this.uniformsForFrame;
        if ((u.depthNode.value as THREE.Texture) !== depthTexture) u.depthNode.value = depthTexture;
        (u.reconProjInv.value as THREE.Matrix4).copy(invProj);
        u.mppFactor.value = (2 * Math.tan((fovDeg * Math.PI) / 360)) / heightPx;
    }
}

/* ------------------------------ app ---------------------------------- */

async function main(): Promise<void> {
    const canvas = document.createElement("canvas");
    canvas.style.width = "100vw";
    canvas.style.height = "100vh";
    document.body.appendChild(canvas);
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";

    // MapView parity switch: append #reversed to the URL to construct the
    // renderer exactly like the map engine (reversedDepthBuffer: true).
    const REVERSED = window.location.hash.includes("reversed");
    if (REVERSED) console.log("[pure] reversedDepthBuffer ENABLED");
    const renderer = new THREE.WebGPURenderer({
        canvas,
        antialias: true,
        reversedDepthBuffer: REVERSED
    } as ConstructorParameters<typeof THREE.WebGPURenderer>[0]);
    await renderer.init();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc5e8);
    const terrain = makeTerrain();
    scene.add(terrain);

    // sun + ambient for readable relief
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-1500, 2000, 800);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x2a4d2a, 1.2));

    // camera
    const camera = new THREE.PerspectiveCamera(55, 1, 10, 30000);
    const orbitTarget = new THREE.Vector3(0, 100, 0);
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(orbitTarget));
    sph.radius = 2600;
    sph.phi = Math.PI * 0.32;
    sph.theta = Math.PI * 0.75;
    {
        let dragging: 0 | 1 | 2 = 0;
        let px = 0;
        let py = 0;
        canvas.style.touchAction = "none";
        canvas.addEventListener("pointerdown", e => {
            dragging = e.button === 2 ? 2 : 1;
            px = e.clientX;
            py = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener("pointermove", e => {
            if (dragging === 0) return;
            const dx = e.clientX - px;
            const dy = e.clientY - py;
            px = e.clientX;
            py = e.clientY;
            if (dragging === 1) {
                sph.theta -= dx * 0.005;
                sph.phi = Math.min(Math.PI * 0.495, Math.max(0.05, sph.phi - dy * 0.005));
            } else {
                const panScale = sph.radius * 0.0012;
                const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
                const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
                orbitTarget.addScaledVector(right, -dx * panScale);
                orbitTarget.addScaledVector(up, dy * panScale);
            }
        });
        const stop = (): void => {
            dragging = 0;
        };
        canvas.addEventListener("pointerup", stop);
        canvas.addEventListener("pointercancel", stop);
        canvas.addEventListener("contextmenu", e => e.preventDefault());
        canvas.addEventListener(
            "wheel",
            e => {
                e.preventDefault();
                sph.radius = Math.min(20000, Math.max(60, sph.radius * Math.exp(e.deltaY * 0.001)));
            },
            { passive: false }
        );
    }
    const applyCamera = (): void => {
        camera.position.setFromSpherical(sph).add(orbitTarget);
        camera.lookAt(orbitTarget);
    };

    // Single straight segment at constant altitude: deliberately cuts
    // through tall hills (buried) and floats over valleys, to verify the
    // depth-based membership drapes onto whatever terrain is VISIBLE along
    // the path — the defining behavior of Cesium's ground polylines.
    const pts: THREE.Vector3[] = [
        new THREE.Vector3(-1500, 120, 0),
        new THREE.Vector3(1500, 120, 0)
    ];

    const depthRT = new THREE.RenderTarget(1, 1);
    depthRT.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    const invProjSnap = new THREE.Matrix4();

    const guiState = {
        widthPixels: 6,
        probe: "off",
        showLine: true,
        autoOrbit: false,
        orbitSpeed: 2,
        bigOffset: false,
        rteMode: false
    };

    // Earth-magnitude offset to stress float32 precision, mirroring the map
    // engine where world coordinates sit at ~6.37e6 m.
    const OFFSET = new THREE.Vector3(6371000, 0, 0);
    const rteCam = new THREE.PerspectiveCamera();
    rteCam.matrixAutoUpdate = false;
    rteCam.matrixWorldAutoUpdate = false;
    // Terrain-derived volume extent along the path (the role Cesium's
    // minTerrainHeight / maxTerrainHeight plays): tall enough to cover every
    // terrain height, snug enough that the wall's own screen footprint stays
    // thin.
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        const x = pts[0].x + (pts[1].x - pts[0].x) * t;
        const z = pts[0].z + (pts[1].z - pts[0].z) * t;
        const h = terrainHeight(x, z);
        if (h < minH) minH = h;
        if (h > maxH) maxH = h;
    }
    const topY = Math.max(maxH, pts[0].y, pts[1].y);
    const botY = Math.min(minH, pts[0].y, pts[1].y);
    const midY = (topY + botY) / 2;
    const span = (topY - botY) / 2 + 20;
    const centerPts = pts.map(p => {
        const q = p.clone();
        q.y = midY;
        return q;
    });

    const mat = new PureCurtainMaterial(depthRT.depthTexture, { widthPx: guiState.widthPixels });
    mat.setFlip(0);
    mat.setSkyReversed(REVERSED);
    const lineMesh = new THREE.Mesh(buildCurtain(centerPts, span), mat);
    lineMesh.frustumCulled = false;
    scene.add(lineMesh);

    const baseTerrain = new THREE.Vector3();
    const baseLine = new THREE.Vector3();

    function applyBigOffset(on: boolean): void {
        const d = OFFSET.clone().multiplyScalar(on ? 1 : -1);
        baseTerrain.add(d);
        baseLine.add(d);
        terrain.position.copy(baseTerrain);
        lineMesh.position.copy(baseLine);
        camera.position.add(d);
        orbitTarget.add(d);
        camera.updateMatrixWorld();
    }
    let offsetPrev = false;
    let rtePrev = false;

    const resize = (): void => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        depthRT.setSize(w, h);
    };
    window.addEventListener("resize", resize);
    resize();

    const gui = new GUI();
    gui.add(guiState, "widthPixels", 1, 30, 1).onChange(v => {
        mat.uniformsForFrame.halfWidthPx.value = Math.max(0.25, v / 2);
    });
    gui.add(guiState, "probe", ["off", "depth", "dist km", "inside"]).onChange(() => undefined);
    gui.add(guiState, "showLine");
    gui.add(guiState, "autoOrbit").name("camera orbit");
    gui.add(guiState, "orbitSpeed", 0.5, 10, 0.5);
    gui.add(guiState, "bigOffset").name("big offset (6.37e6)");
    gui.add(guiState, "rteMode").name("rte mode");

    const PROBE_IDS: Record<string, number> = { off: 0, depth: 2, "dist km": 3, inside: 4 };

    const hud = document.createElement("div");
    hud.style.cssText =
        "position:fixed;top:4px;left:6px;z-index:9;font:12px monospace;color:#0f0;" +
        "background:rgba(0,0,0,.55);padding:2px 6px;pointer-events:none";
    document.body.appendChild(hud);
    let frameNo = 0;

    function animate(): void {
        requestAnimationFrame(animate);
        frameNo++;
        if (guiState.autoOrbit) sph.theta += guiState.orbitSpeed * 0.002;
        if (guiState.bigOffset !== offsetPrev) {
            offsetPrev = guiState.bigOffset;
            applyBigOffset(offsetPrev);
        }
        applyCamera();
        hud.textContent = `alive#${frameNo} th${sph.theta.toFixed(2)} ph${sph.phi.toFixed(
            2
        )} r${sph.radius.toFixed(0)} flip${guiState.rteMode ? "R" : "-"}`;

        // Relative-to-eye rendering, the way the map engine draws every
        // frame: rotation-only view matrix, meshes repositioned to
        // (base − cameraPosition) so modelView stays small-numbered.
        let renderCam: THREE.PerspectiveCamera = camera;
        if (guiState.rteMode) {
            camera.updateMatrixWorld();
            const R = camera.matrixWorld.clone().setPosition(0, 0, 0);
            rteCam.projectionMatrix.copy(camera.projectionMatrix);
            rteCam.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
            rteCam.matrixWorld.copy(R);
            rteCam.matrixWorldInverse.copy(R).invert();
            terrain.position.copy(baseTerrain).sub(camera.position);
            lineMesh.position.copy(baseLine).sub(camera.position);
            renderCam = rteCam;
        } else if (rtePrev) {
            // leaving rte mode: restore absolute placement
            terrain.position.copy(baseTerrain);
            lineMesh.position.copy(baseLine);
        }
        rtePrev = guiState.rteMode;

        mat.uniformsForFrame.probe.value = PROBE_IDS[guiState.probe] ?? 0;

        // pass 1 — capture visible-surface depth (terrain only)
        lineMesh.visible = false;
        renderer.setRenderTarget(depthRT);
        renderer.render(scene, renderCam);
        renderer.setRenderTarget(null);
        invProjSnap.copy(renderCam.projectionMatrix).invert();
        mat.syncFrame(depthRT.depthTexture, invProjSnap, window.innerHeight, camera.fov);

        // pass 2 — main draw with draped overlay
        lineMesh.visible = guiState.showLine;
        renderer.render(scene, renderCam);
    }

    const safeAnimate = (): void => {
        try {
            animate();
        } catch (err) {
            hud.style.color = "#f44";
            hud.textContent = `FRAME ERROR @${frameNo}: ${String(err)}`;
            console.error(err);
        }
    };
    void safeAnimate;
    void min; // keep import parity with the repo fragment stage
    const loop = (): void => {
        safeAnimate();
        requestAnimationFrame(loop);
    };
    loop();
}

main().catch(err => {
    console.error(err);
    document.body.innerText = String(err);
});
