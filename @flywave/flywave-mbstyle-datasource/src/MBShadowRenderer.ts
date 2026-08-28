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
    // §530: independent-context depth pass renderer + CanvasTexture回流.
    private m_shRenderer: THREE.WebGLRenderer | null = null;
    private m_shTex: THREE.CanvasTexture | null = null;
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
        if (!this.enabled || !this.m_shTex) return null;
        return {
            map: this.m_shTex,
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

        // §530: independent WebGL CONTEXT for the depth pass. Rendering into
        // an RT of the main context — even just bind+clear — deterministically
        // darkens the subsequent main render on SwiftShader (§522–§529
        // exclusion matrix; resetState negative). A second renderer keeps the
        // main context untouched; its canvas flows back as a CanvasTexture
        // (4 MB upload per frame, test-environment acceptable).
        const size = 1024;
        if (!this.m_shRenderer || !this.m_shTex) {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            this.m_shRenderer = new THREE.WebGLRenderer({
                canvas,
                antialias: false,
                // the CanvasTexture upload samples this buffer — keep it
                preserveDrawingBuffer: true,
            });
            this.m_shRenderer.setSize(size, size, false);
            this.m_shRenderer.setClearColor(0xffffff, 1);
            this.m_shTex = new THREE.CanvasTexture(canvas);
            this.m_shTex.minFilter = THREE.NearestFilter;
            this.m_shTex.magFilter = THREE.NearestFilter;
            this.m_shTex.generateMipmaps = false;
        }

        // Frame the ortho shadow camera around the eye-relative scene (see the
        // §523 RTE notes): the center tracks worldCenter − eye.
        const center = new THREE.Vector3();
        const target = (this.m_mapView as any).worldCenter as THREE.Vector3 | undefined;
        if (target && Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z)) {
            center.copy(target);
        }
        try {
            const gc = (this.m_mapView as any).geoCenter;
            const pr = (this.m_mapView as any).projection;
            if (gc && pr) {
                const eye = pr.projectPoint(gc, { x: 0, y: 0, z: 0 });
                center.sub(eye as any);
            }
        } catch {}
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
            center.set(0, 0, 0);
        }
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

        // Depth-only pass over the casters (layer mask + override material)
        // in the INDEPENDENT context — the main renderer/canvas untouched.
        const prevOverride = scene.overrideMaterial;
        const prevLayers = this.m_shadowCamera.layers.mask;
        this.m_shadowCamera.layers.set(1);
        scene.overrideMaterial = this.m_depthMaterial;
        try {
            this.m_shRenderer.setRenderTarget(null);
            this.m_shRenderer.clear();
            this.m_shRenderer.render(scene, this.m_shadowCamera);
        } finally {
            scene.overrideMaterial = prevOverride;
            this.m_shadowCamera.layers.mask = prevLayers;
        }
        this.m_shTex.needsUpdate = true;

        // §531 probe: renderer.info quantifies whether ctx2 drew anything.
        if ((globalThis as any).__mbDecodeDbg) {
            try {
                const inf = this.m_shRenderer.info;
                (globalThis as any).__mbShadowInfo = {
                    calls: inf.render.calls,
                    tris: inf.render.triangles,
                    geoms: inf.memory.geometries,
                    tex: inf.memory.textures,
                };
            } catch {}
        }
        // §530 probe: 8×8 sample of the depth canvas (shadowdbg diagnostics).
        if ((globalThis as any).__mbDecodeDbg) {
            try {
                const c2: HTMLCanvasElement = (this as any).__mbDbg2d ??
                    ((this as any).__mbDbg2d = document.createElement('canvas'));
                c2.width = 8;
                c2.height = 8;
                const cx2 = c2.getContext('2d')!;
                cx2.drawImage(this.m_shRenderer.domElement, 0, 0, 8, 8);
                const gl2: any = this.m_shRenderer.getContext();
                // 8×8 grid of single pixels spanning the WHOLE canvas (GL
                // origin bottom-left).
                const px = new Uint8Array(4);
                const grid: number[][] = [];
                for (let gy = 0; gy < 8; gy++) {
                    const row: number[] = [];
                    for (let gx = 0; gx < 8; gx++) {
                        const x = gx * 128 + 64;
                        const y = (7 - gy) * 128 + 64;
                        gl2.readPixels(x, y, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px);
                        row.push(px[0]);
                    }
                    grid.push(row);
                }
                (globalThis as any).__mbShadowGrid = grid;
            } catch {}
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
    }

    dispose(): void {
        this.m_shRenderer?.dispose();
        this.m_shRenderer = null;
        this.m_shTex?.dispose();
        this.m_shTex = null;
    }
}
