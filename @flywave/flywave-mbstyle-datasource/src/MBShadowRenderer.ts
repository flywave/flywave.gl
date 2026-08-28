/**
 * Standalone directional shadow pass (mgl `3d-style/render/shadow_renderer`
 * parity). Mapbox 3D lights may carry `cast-shadows` + `shadow-intensity`;
 * mgl renders the scene depth from the light into its own shadow map and
 * modulates every receiving layer (`_prelude_shadow`) plus a ground shadow
 * factor (`ground_shadow.fragment.glsl`:
 * `shadow = mix(1 - intensity, 1, lit)`).
 *
 * The engine's 3D-lights directional is deliberately NOT part of the scene
 * (see MBEnvironmentManager.applyLights), so three's built-in shadow map
 * cannot be used. This renderer keeps mgl's architecture instead: an
 * orthographic depth-only pass over the casters (layer 1) into a
 * WebGLRenderTarget depth texture, re-run per frame; receiving materials
 * (fill/ground layers, patched in MBMaterialPatchManager) sample it with
 * `uMBShadowMatrix` (world→shadow-uv).
 *
 * Casters register themselves on layer 1 via the shared `shadowCasters` set
 * (MBMaterialPatchManager for extruded polygons, MBModelRenderer for model
 * instances); objects leaving the scene are pruned on use.
 */

import * as THREE from 'three';

export const shadowCasters = new Set<THREE.Object3D>();

export interface ShadowUniformState {
    map: THREE.Texture;
    matrix: THREE.Matrix4;
    intensity: number;
}

export class MBShadowRenderer {
    private m_rt: THREE.WebGLRenderTarget | null = null;
    // §523 depth→color blit probe (shadowdbg gate).
    private m_dumpRt: THREE.WebGLRenderTarget | null = null;
    private m_dumpScene: THREE.Scene | null = null;
    private m_dumpCam: THREE.OrthographicCamera | null = null;
    private m_dumpQuad: THREE.Mesh | null = null;
    private m_shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    // §527: depth packed into COLOR (16-bit RG) — gl_FragCoord.z linearized
    // over the shadow camera's [near, far].
    private m_depthMaterial = new THREE.ShaderMaterial({
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
            void main(){
                // raw window depth (gl_FragCoord.z) — receivers project with
                // the SAME shadow camera matrix, so uv.z is directly
                // comparable. 16-bit pack: R=hi, G=lo.
                float v = gl_FragCoord.z * 255.0;
                float hi = floor(v) / 255.0;
                float lo = fract(v);
                gl_FragColor = vec4(hi, lo, 0.0, 1.0);
            }`,
        colorWrite: true,
    });
    private m_matrix = new THREE.Matrix4();
    private m_enabled = false;
    private m_intensity = 0;

    constructor(
        private m_mapView: any,
        private m_dataSource: any,
    ) {
        // Casters-only camera: meshes are opted in via layers.enable(1).
        this.m_shadowCamera.layers.set(1);
    }

    /** Update enable/intensity from the current 3D-lights state. */
    setLightState(enabled: boolean, intensity: number): void {
        this.m_enabled = enabled;
        this.m_intensity = intensity;
    }

    get enabled(): boolean {
        return this.m_enabled && this.m_intensity > 0;
    }

    /** Uniform state for receiving-material injection; null when inactive. */
    getShadowUniforms(): ShadowUniformState | null {
        if (!this.enabled || !this.m_rt) return null;
        return {
            map: this.m_rt.texture,
            matrix: this.m_matrix,
            intensity: this.m_intensity,
        };
    }

    /** Per-frame entry point (AfterRender; one-frame uniform lag like heatmap). */
    run(): void {
        // §522 GATE: with `cast-shadows` actually activating (property-name
        // bug fixed this session) the pass uniformly darkens the whole ground
        // (856405 vs 375224 px on buildings-trees-shadows-casting) — the
        // result is pixel-identical across shadow-camera framings (absolute
        // vs eye-rebased center), i.e. the depth sample is uniformly wrong
        // and needs a shadow-map dump probe (frame/extent/bias decomposition)
        // before visual calibration. Opt back in per-run via the forensic
        // karma arg gate `shadowdbg=1` (window.__mbShadowEnable).
        if (!(globalThis as any).__mbShadowEnable) return;
        if (!this.m_enabled || this.m_intensity <= 0) return;
        const renderer = this.m_mapView?.renderer as THREE.WebGLRenderer | undefined;
        const scene = this.m_mapView?.m_scene as THREE.Scene | undefined;
        const camera = this.m_mapView?.camera as THREE.PerspectiveCamera | undefined;
        if (!renderer || !scene || !camera) return;

        // Prune casters that left the scene (tile disposal / model teardown).
        for (const obj of [...shadowCasters]) {
            if (!obj.parent) shadowCasters.delete(obj);
        }
        if (shadowCasters.size === 0) return;

        const size = 1024;
        if (!this.m_rt || this.m_rt.width !== size) {
            this.m_rt?.dispose();
            // §527: NO DepthTexture — attaching+sampling one corrupts the main
            // canvas depth state on SwiftShader (even with a complete FBO).
            // The pass writes PACKED DEPTH into the COLOR buffer instead
            // (16-bit: R=hi, G=lo); receivers decode.
            this.m_rt = new THREE.WebGLRenderTarget(size, size, {
                depthBuffer: true,
            });
        }

        // Frame the ortho shadow camera around the view center in scene
        // space. Radius from the camera distance (single cascade; mgl uses
        // two — refinement deferred to the calibration batch).
        const center = new THREE.Vector3();
        camera.getWorldPosition(center);
        const target = (this.m_mapView as any).worldCenter as THREE.Vector3 | undefined;
        // §523: the dump probe caught camPos=NaN — worldCenter / the camera
        // world position can be non-finite (undefined worldCenter or a
        // non-finite camera matrix), which NaN-poisons the shadow camera and
        // empties the depth map (all 1.0). Guard to the last finite value.
        if (target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z)) {
            center.copy(target);
        }
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
            center.set(0, 0, 0);
        }
        // §523: the scene renders RELATIVE-TO-EYE — the dump probe proved the
        // absolute worldCenter frames the ortho box 6.4e6 away from every
        // caster (depth map empty, all 1.0). Rebase the center by −eye so the
        // box wraps the eye-relative casters (same frame as MBModelRenderer).
        // (The §522 eye-rebase attempt never actually ran — f5/f6/f7 all used
        // a stale webpack bundle, MB_NO_WEBPACK_CACHE was missing.)
        try {
            const gc = (this.m_mapView as any).geoCenter;
            const pr = (this.m_mapView as any).projection;
            if (gc && pr) {
                const eye = pr.projectPoint(gc, { x: 0, y: 0, z: 0 });
                center.sub(eye as any);
            }
        } catch {}
        // §522: NOTE — with cast-shadows actually activating (the singular/
        // plural property bug is fixed), an eye-relative rebase of `center`
        // here was tried and OVERSPREAD shadows across the whole ground
        // (−481k px on buildings-trees-shadows-casting). The receiver side
        // (vMBWorldPos from RTE matrixWorld) vs this shadow camera framing
        // needs a coherent frame rework with a shadow-map dump tool before
        // re-enabling visual calibration. The absolute framing leaves the
        // depth sample out of [0,1] for RTE receivers → no modulation (the
        // pre-§522 status quo).
        const lightDir = (this.m_dataSource as any).m_environment
            ?.lighting3DState?.dir as THREE.Vector3 | undefined;
        if (!lightDir) return;

        const radius = Math.max(50, (this.m_mapView as any).targetDistance ?? 500);
        this.m_shadowCamera.left = -radius;
        this.m_shadowCamera.right = radius;
        this.m_shadowCamera.top = radius;
        this.m_shadowCamera.bottom = -radius;
        this.m_shadowCamera.near = 0.1;
        this.m_shadowCamera.far = radius * 4;
        this.m_shadowCamera.position.copy(center).addScaledVector(lightDir, radius * 2);
        this.m_shadowCamera.up.set(0, 0, 1);
        this.m_shadowCamera.lookAt(center);
        this.m_shadowCamera.updateProjectionMatrix();
        this.m_shadowCamera.updateMatrixWorld();

        // Depth-only pass over the casters (layer mask + override material).
        // §522: layer 1 = registered shadow casters ONLY — a scene-wide depth
        // pass would bake the ground into the shadow map and self-shadow
        // every receiver (mgl drawDepthPrepass renders the caster set).
        const prevTarget = renderer.getRenderTarget();
        const prevOverride = scene.overrideMaterial;
        const prevShadowEnabled = renderer.shadowMap.enabled;
        const prevLayers = this.m_shadowCamera.layers.mask;
        this.m_shadowCamera.layers.set(1);
        renderer.shadowMap.enabled = false;
        scene.overrideMaterial = this.m_depthMaterial;
        try {
            renderer.setRenderTarget(this.m_rt);
            // §526: the A/B run proved setRenderTarget+clear darkened the MAIN
            // canvas — the RT FBO was binding incomplete (DepthTexture without
            // an explicit color buffer on SwiftShader) and the clear fell
            // through to the canvas. Verify the FBO before clearing.
            const gl = renderer.getContext();
            const fbStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (fbStatus === gl.FRAMEBUFFER_COMPLETE) {
                renderer.clear();
                renderer.render(scene, this.m_shadowCamera);
            } else {
                // eslint-disable-next-line no-console
                console.warn('[MBShadow] RT incomplete 0x' + fbStatus.toString(16) + ' — shadows disabled');
                this.m_rt!.depthTexture!.dispose();
                this.m_rt!.dispose();
                this.m_rt = null;
                renderer.setRenderTarget(prevTarget);
                return;
            }
        } finally {
            scene.overrideMaterial = prevOverride;
            renderer.shadowMap.enabled = prevShadowEnabled;
            renderer.setRenderTarget(prevTarget);
            this.m_shadowCamera.layers.mask = prevLayers;
            // §529: the shadow pass leaves three's GL state CACHE mismatched
            // with the real GL state (viewport/scissor/blend/depth-func) —
            // every subsequent main render reproduces the same wrong output
            // (deterministic darkening). resetState() drops the cache so the
            // next render re-applies everything.
            (renderer as any).resetState?.();
        }

        // world → shadow-uv matrix (proj*view + [0,1] remap).
        this.m_matrix
            .multiplyMatrices(this.m_shadowCamera.projectionMatrix, this.m_shadowCamera.matrixWorldInverse)
            .multiply(new THREE.Matrix4().set(
                0.5, 0, 0, 0.5,
                0, 0.5, 0, 0.5,
                0, 0, 0.5, 0.5,
                0, 0, 0, 1,
            ));

        // §523: shadow-map dump probe (shadowdbg=1) — the depth RT is not
        // color-readable, so blit it through a fullscreen depth→color quad
        // into a small RGBA8 target and POST stats + a grid via the
        // /mb-probe-dump channel (§516).
        if ((globalThis as any).__mbShadowEnable) {
            try { this.dumpShadowDepth(renderer, center, lightDir, radius); } catch {}
        }
    }

    private dumpShadowDepth(renderer: THREE.WebGLRenderer, center: THREE.Vector3, lightDir: any, radius: number): void {
        const S = 64;
        if (!this.m_dumpRt || this.m_dumpRt.width !== S) {
            this.m_dumpRt?.dispose();
            this.m_dumpRt = new THREE.WebGLRenderTarget(S, S);
            this.m_dumpScene = new THREE.Scene();
            this.m_dumpCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
            this.m_dumpQuad = new THREE.Mesh(
                new THREE.PlaneGeometry(2, 2),
                new THREE.ShaderMaterial({
                    uniforms: { uMap: { value: null } },
                    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
                    fragmentShader: `uniform sampler2D uMap; varying vec2 vUv;
                        void main(){ float d = texture2D(uMap, vUv).r;
                        gl_FragColor = vec4(d, fract(d * 256.0), 0.0, 1.0); }`,
                }),
            );
            this.m_dumpScene.add(this.m_dumpQuad);
        }
        const mat = this.m_dumpQuad.material as THREE.ShaderMaterial;
        mat.uniforms.uMap.value = this.m_rt!.texture;
        const prevTarget = renderer.getRenderTarget();
        renderer.setRenderTarget(this.m_dumpRt);
        renderer.render(this.m_dumpScene, this.m_dumpCam);
        renderer.setRenderTarget(prevTarget);
        const buf = new Uint8Array(S * S * 4);
        renderer.readRenderTargetPixels(this.m_dumpRt, 0, 0, S, S, buf);
        // 8×8 grid of the R channel (0..255 depth quantized to 8 bits).
        const grid: number[][] = [];
        for (let gy = 0; gy < 8; gy++) {
            const row: number[] = [];
            for (let gx = 0; gx < 8; gx++) {
                let sum = 0;
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 8; x++) {
                        sum += buf[(((gy * 8 + y) * S) + (gx * 8 + x)) * 4];
                    }
                }
                row.push(Math.round(sum / 64));
            }
            grid.push(row);
        }
        const e = this.m_matrix.elements;
        const dump = {
            name: 'shadow-map',
            grid,
            matrix: Array.from(e).map((v) => Number(v.toFixed(4))),
            camPos: this.m_shadowCamera.position.toArray().map((v) => Math.round(v)),
            radius: Math.round(this.m_shadowCamera.right),
            raw: {
                center: [center.x, center.y, center.z].map((v) => Number(v.toFixed(1))),
                dir: Array.isArray(lightDir) ? lightDir.slice(0, 3) : String(lightDir),
                radius,
                target: String((this.m_mapView as any).worldCenter),
            },
        };
        const fb = (window as any).__karma__?.config?.args
            ?.find?.((a: string) => a.startsWith('feedback-url='))
            ?.slice('feedback-url='.length);
        if (fb) {
            void fetch(`${fb}/mb-probe-dump`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(dump),
            }).catch(() => {});
        }
    }

    dispose(): void {
        this.m_rt?.dispose();
        this.m_rt = null;
    }
}
