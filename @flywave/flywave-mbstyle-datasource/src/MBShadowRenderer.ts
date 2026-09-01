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
    /** Screen-corner ground-plane world positions (NDC (-1,-1),(1,-1),(1,1),(-1,1)) —
     * receivers interpolate their ground world pos from gl_FragCoord (§692). */
    corners: THREE.Vector3[];
    eye: THREE.Vector3;
    /** Drawing-buffer size in device px (gl_FragCoord space). */
    res: THREE.Vector2;
    /** §717: shadow-camera far (world units) — the fade-out envelope. */
    far: number;
}

export class MBShadowRenderer {
    // §530: independent-context depth pass renderer + CanvasTexture回流.
    private m_shRenderer: THREE.WebGLRenderer | null = null;
    private m_shTex: THREE.CanvasTexture | null = null;
    private m_shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    // §532 bisect: ShaderMaterial vs Basic — is the ctx2 blank a silent
    // shader-compile failure or something else? (Basic draws white geometry.)
    private m_depthMaterial: THREE.Material = new THREE.ShaderMaterial({
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
    private m_orthoStyle = false;
    // §560: ground shadow receiver — mgl shades the BACKGROUND as a ground
    // layer (`background × groundRadiance × groundShadow`); our background is
    // the engine clearColor, so an mgl-style screen-space quad (fog-renderer
    // pattern — NDC rasterization at depth ≈1, world position from
    // unprojecting the screen corners onto the z=0 ground plane) carries the
    // shadow factor. §643: the quad draws in the engine's preSceneHook
    // (underlay, direct path) — MapView clears the frame then renders with
    // autoClear=false, so the quad lies BENEATH all scene content (mgl
    // composites ground shadows underneath; the old AfterRender overlay
    // channel painted over depth-less fill/line layers and needed the §572b
    // translucent gate, which disabled the quad for virtually every style).
    private m_groundQuad: THREE.Mesh | null = null;
    private m_groundUniforms: any = null;
    private m_groundScene = new THREE.Scene();
    private m_groundCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    /** Drawing-buffer size for the §692 screen-space receivers. */
    private m_res = new THREE.Vector2(1, 1);

    constructor(
        private m_mapView: any,
        private m_dataSource: any,
    ) {
        // Casters-only camera: meshes are opted in via layers.enable(1).
        this.m_shadowCamera.layers.set(1);
        (this.m_mapView?.mapRenderingManager as any).preSceneHook = (
            renderer: THREE.WebGLRenderer,
        ) => this.drawGroundQuad(renderer);
    }

    /** Update enable/intensity from the current 3D-lights state. */
    setLightState(enabled: boolean, intensity: number): void {
        this.m_enabled = enabled;
        this.m_intensity = intensity;
        if (!this.enabled && this.m_groundQuad) {
            this.m_groundScene.remove(this.m_groundQuad);
            this.m_groundQuad = null;
            this.m_groundUniforms = null;
        }
    }

    /**
     * §571: orthographic-camera styles — the ground receiver unprojects
     * view rays with the perspective assumption and the depth pass frames
     * around the RTE target distance; under an ortho projection both are
     * wrong (camera-orthographic-zero-pitch +53k measured). Skip entirely.
     */
    setOrthographicStyle(ortho: boolean): void {
        this.m_orthoStyle = ortho;
        if (ortho) this.setLightState(false, 0);
    }

    /** §572b gate retired with the AfterRender overlay channel (§643). */
    setStyleHasTranslucent(_t: boolean): void {}

    get enabled(): boolean {
        return this.m_enabled && this.m_intensity > 0;
    }

    /** Uniform state for receiving-material injection; null when inactive. */
    getShadowUniforms(): ShadowUniformState | null {
        if (!this.enabled || !this.m_shTex) return null;
        if (!this.m_groundUniforms) return null;
        const cv = this.m_mapView?.canvas as HTMLCanvasElement | undefined;
        return {
            map: this.m_shTex,
            matrix: this.m_matrix,
            intensity: this.m_intensity,
            corners: this.m_groundUniforms.uMBGC.value as THREE.Vector3[],
            eye: this.m_groundUniforms.uMBEye.value as THREE.Vector3,
            res: this.m_res,
            // §717: mgl u_fade_range = [lastCascade.far×0.75, lastCascade.far]
            // (shadow_renderer.ts:363) — receiver shadows fade to lit across
            // the far quarter of the coverage; single-cascade far stands in.
            far: this.m_shadowCamera.far,
        };
    }

    private ensureGroundQuad(): void {
        if (this.m_groundQuad) return;
        const geo = new THREE.PlaneGeometry(2, 2);
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uMBGC: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
                uMBProjView: { value: new THREE.Matrix4() },
                uMBEye: { value: new THREE.Vector3() },
                uMBShadowMap: { value: null },
                uMBShadowMatrix: { value: new THREE.Matrix4() },
                uMBGroundShadowFactor: { value: new THREE.Vector3(0, 0, 0) },
                uMBGroundColor: { value: new THREE.Color(0xffffff) },
            },
            vertexShader: `
                varying vec3 vMBWorldPos;
                uniform vec3 uMBGC[4];
                uniform mat4 uMBProjView;
                void main() {
                    vMBWorldPos = mix(mix(uMBGC[0], uMBGC[1], uv.x),
                                      mix(uMBGC[3], uMBGC[2], uv.x), uv.y);
                    // Route through the REAL camera so the varying gets
                    // perspective-correct interpolation (an NDC quad with
                    // w=1 interpolates world pos affinely — wrong), while
                    // forcing depth ~1 (behind all content).
                    vec4 cp = uMBProjView * vec4(vMBWorldPos, 1.0);
                    gl_Position = vec4(cp.xy, 0.9999 * cp.w, cp.w);
                }`,
            fragmentShader: `
                varying vec3 vMBWorldPos;
                uniform sampler2D uMBShadowMap;
                uniform mat4 uMBShadowMatrix;
                uniform vec3 uMBGroundShadowFactor;
                uniform vec3 uMBGroundColor;
                uniform vec3 uMBEye;
                void main() {
                    // §643 underlay channel: corners whose view ray never
                    // hits the z=0 ground plane are clamped at the far
                    // distance and sit ABOVE it — those interpolate to sky,
                    // where the quad must not paint (the depth-gate of the
                    // old overlay channel used to exclude sky for free).
                    if (vMBWorldPos.z > 1.0) discard;
                    vec4 mbShadowUv = uMBShadowMatrix * vec4(vMBWorldPos - uMBEye, 1.0);
                    float mbLit = 1.0;
                    if (mbShadowUv.x >= 0.0 && mbShadowUv.x <= 1.0 &&
                        mbShadowUv.y >= 0.0 && mbShadowUv.y <= 1.0 && mbShadowUv.z <= 1.0) {
                        vec4 mbPk = texture2D(uMBShadowMap, mbShadowUv.xy);
                        float mbShadowDepth = mbPk.r + mbPk.g / 255.0;
                        mbLit = smoothstep(-0.0002, 0.0002, mbShadowUv.z - mbShadowDepth);
                    }
                    // The engine clear color reaches the canvas in sRGB; our
                    // raw ShaderMaterial output must be encoded to match
                    // (mgl blends the factor in sRGB space — we compose in
                    // linear and encode once, so the factor stays linear).
                    vec3 mbOut = uMBGroundColor * mix(uMBGroundShadowFactor, vec3(1.0), mbLit);
                    gl_FragColor = vec4(pow(mbOut, vec3(1.0 / 2.2)), 1.0);
                }`,
            depthTest: false,
            depthWrite: false,
        });
        const quad = new THREE.Mesh(geo, mat);
        quad.name = 'MBShadowGroundQuad';
        quad.frustumCulled = false;
        this.m_groundQuad = quad;
        this.m_groundScene.add(quad);
        this.m_groundUniforms = mat.uniforms;
    }

    /** Unproject one NDC corner onto the z=0 ground plane (far clamp on sky). */
    private cornerOnGround(
        cam: THREE.PerspectiveCamera, camPos: THREE.Vector3,
        ndcX: number, ndcY: number, far: number, out: THREE.Vector3,
    ): void {
        // Standard unproject: NDC (z=-1, near plane) → view → world.
        const v = new THREE.Vector4(ndcX, ndcY, -1, 1)
            .applyMatrix4(cam.projectionMatrixInverse);
        const dir = new THREE.Vector3(v.x / v.w, v.y / v.w, v.z / v.w)
            .applyMatrix4(cam.matrixWorld)
            .sub(camPos)
            .normalize();
        const t = dir.z < -1e-6 ? -camPos.z / dir.z : far;
        out.copy(camPos).addScaledVector(dir, Math.min(Math.abs(t), far));
    }

    /** §643: underlay draw — the engine calls this from preSceneHook, before
     * the scene render (frame already cleared, autoClear stays false, so the
     * quad lies beneath all content). Uniforms were prepared by run() in
     * WillRender; a fresh style's first frame simply draws nothing. */
    private drawGroundQuad(renderer: THREE.WebGLRenderer): void {
        if (!this.m_enabled || this.m_intensity <= 0) return;
        if (!this.m_groundQuad || !this.m_groundUniforms) return;
        if (this.m_orthoStyle) return;
        const prevRT = renderer.getRenderTarget();
        try {
            renderer.setRenderTarget(null);
            renderer.render(this.m_groundScene, this.m_groundCamera);
        } finally {
            renderer.setRenderTarget(prevRT);
        }
    }

    private prepGroundQuad(center: THREE.Vector3, radius: number, eye: THREE.Vector3): void {
        this.ensureGroundQuad();
        const renderer = this.m_mapView?.renderer as THREE.WebGLRenderer | undefined;
        // The RTE render camera keeps an IDENTITY world matrix (rebase lives
        // in the projection) — useless for unprojection. The logical camera
        // carries the real view; the quad itself is screen-space so the
        // render camera is our own ortho anyway.
        const cam = this.m_mapView?.camera as THREE.PerspectiveCamera | undefined;
        if (!renderer || !cam) return;
        cam.updateMatrixWorld();
        const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
        const far = radius * 8;
        const corners = this.m_groundUniforms.uMBGC.value as THREE.Vector3[];
        this.cornerOnGround(cam, camPos, -1, -1, far, corners[0]);
        this.cornerOnGround(cam, camPos, 1, -1, far, corners[1]);
        this.cornerOnGround(cam, camPos, 1, 1, far, corners[2]);
        this.cornerOnGround(cam, camPos, -1, 1, far, corners[3]);
        // §692: RTE render camera sits at origin (identity world matrix),
        // so cornerOnGround computes RTE-relative ground intersections
        // (all ≈ 0,0,0). The receiver needs ABSOLUTE world positions for
        // `mbWP - uMBEye` to yield the correct RTE offset. Add eye back.
        for (const c of corners) c.add(eye);
        // The shadow camera lives in the eye-rebased scene frame — bring the
        // absolute-world corners into the SAME frame (casters' worldPos z
        // also carries −eye.z, so the ground plane here is z = −eye.z).
        // Corners stay ABSOLUTE — the fragment shader rebases by uMBEye.
        this.m_groundUniforms.uMBProjView.value
            .multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        this.m_groundUniforms.uMBEye.value.copy(eye);
        this.m_groundUniforms.uMBShadowMap.value = this.m_shTex;
        this.m_groundUniforms.uMBShadowMatrix.value = this.m_matrix;
        // mgl calculateGroundShadowFactor: shadow = ambient/(ambient+dir·NdotL)
        // per channel, sRGB-encoded (shadow_utils.ts) — NOT 1 − shadow-intensity.
        {
            const ls = (this.m_dataSource as any).m_environment?.lighting3DState;
            const f = this.m_groundUniforms.uMBGroundShadowFactor.value;
            if (ls) {
                const ndl = Math.max(ls.dir[2], 0);
                for (let i = 0; i < 3; i++) {
                    const a = ls.ambientColorLinear[i];
                    const d = ls.directionalColorLinear[i] * ndl;
                    f.setComponent(i, a > 0 ? a / (a + d) : 0);
                }
            }
        }
        // The clear color already carries color × groundRadiance (mgl
        // background semantics — MBStyleDataSource.applyBackgroundColor).
        const clear = (this.m_mapView as any).clearColor;
        if (clear !== undefined) this.m_groundUniforms.uMBGroundColor.value.setHex(clear);
        // §692: drawing-buffer size for the screen-space receivers
        // (gl_FragCoord.xy is in device px).
        const cv2 = this.m_mapView?.canvas as HTMLCanvasElement | undefined;
        if (cv2) this.m_res.set(cv2.width, cv2.height);
        // §643: the quad itself is drawn by the engine's preSceneHook —
        // see drawGroundQuad.
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
        if (this.m_orthoStyle) return;
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
            // §522 root cause: the packed-depth canvas must clear to WHITE
            // (depth 1 = far) — a black clear reads as depth 0 (nearest) and
            // shadows the ENTIRE ground (the frozen "uniform darkening").
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
        const eye = new THREE.Vector3();
        try {
            const gc = (this.m_mapView as any).geoCenter;
            const pr = (this.m_mapView as any).projection;
            if (gc && pr) {
                const e = pr.projectPoint(gc, { x: 0, y: 0, z: 0 });
                eye.set((e as any).x, (e as any).y, (e as any).z ?? 0);
                center.sub(eye);
            }
        } catch {}
        if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(center.z)) {
            center.set(0, 0, 0);
        }
        // §560: the shadow camera uses the mgl-EXACT direction conversion
        // (sphericalDirectionToCartesian: a = azimuth + 90°) — the general
        // lighting state's 90−az is a §455 wall-shading calibration and
        // points the shadow the mirrored way.
        const dirProp = (this.m_dataSource as any).m_environment
            ?.m_3DDirectional?.direction as [number, number] | undefined;
        const dirArr = (this.m_dataSource as any).m_environment
            ?.lighting3DState?.dir as number[] | undefined;
        if (!dirProp && !dirArr) return;
        let lightDir: THREE.Vector3;
        if (dirProp) {
            const a = (dirProp[0] + 90) * Math.PI / 180;
            const pl = dirProp[1] * Math.PI / 180;
            lightDir = new THREE.Vector3(
                Math.cos(a) * Math.sin(pl), Math.sin(a) * Math.sin(pl), Math.cos(pl));
        } else {
            const d = dirArr!;
            lightDir = new THREE.Vector3(d[0], d[1], d[2]);
        }
        if (!Number.isFinite(lightDir.x)) return;

        // §560: frame the ortho around the CASTERS' union AABB (worldCenter
        // sits at the camera target, but tiles can be a km+ away — a
        // targetDistance-sized box missed them entirely).
        const casterBox = new THREE.Box3();
        let haveBox = false;
        for (const obj of shadowCasters) {
            obj.updateWorldMatrix?.(true, false);
            const b = new THREE.Box3().setFromObject(obj);
            if (!b.isEmpty()) { casterBox.union(b); haveBox = true; }
        }
        let frameCenter = center.clone();
        let radius = Math.max(50, (this.m_mapView as any).targetDistance ?? 500);
        if (haveBox) {
            // §643: tight caster framing with a 50% reach margin (long shadows
            // at low sun + soft edges). The §561 view-corner folding (far =
            // radius×8 → 4km corners) blew the ortho up to ~12km and crushed
            // the casters into ~9% of the depth canvas (~12 m/px); points
            // outside the box already read as lit via the uv bounds check, so
            // folding added nothing but resolution loss.
            frameCenter = casterBox.getCenter(new THREE.Vector3());
            const sz = casterBox.getSize(new THREE.Vector3());
            radius = Math.max(50, Math.max(sz.x, sz.y, 1) * 0.75 * 1.5);
        }
        this.m_shadowCamera.left = -radius;
        this.m_shadowCamera.right = radius;
        this.m_shadowCamera.top = radius;
        this.m_shadowCamera.bottom = -radius;
        this.m_shadowCamera.near = 0.1;
        this.m_shadowCamera.far = radius * 4;
        this.m_shadowCamera.position.copy(frameCenter).addScaledVector(lightDir, radius * 2);
        this.m_shadowCamera.up.set(0, 0, 1);
        this.m_shadowCamera.lookAt(frameCenter);
        // §692: TIGHT DEPTH RANGE along the light axis. The old 0.1..4×radius
        // frustum spans ~10-25km, so a 30m building's depth footprint on the
        // ground is ~0.001 of the [0,1] window range — SMALLER than the
        // receiver's 0.002 lit-compare bias, which made EVERY ground fragment
        // read "lit" (the entire model-layer shadow family rendered without
        // shadows while the depth map itself had content — [MBShadowGrid]
        // 0.48-0.58 cluster vs scores bit-identical). Project the caster AABB
        // onto the light axis and clamp [near, far] to it with a small slack.
        if (haveBox) {
            // The camera looks along −lightDir (it sits offset TOWARD the
            // light and faces the frame center) — depth bounds must project
            // onto THAT axis, not lightDir itself (sign flip ⇒ negative far ⇒
            // inverted/empty frustum).
            const viewDir = lightDir.clone().normalize().negate();
            const corner = new THREE.Vector3();
            let tMin = Infinity;
            let tMax = -Infinity;
            for (let i = 0; i < 8; i++) {
                corner.set(
                    i & 1 ? casterBox.max.x : casterBox.min.x,
                    i & 2 ? casterBox.max.y : casterBox.min.y,
                    i & 4 ? casterBox.max.z : casterBox.min.z,
                );
                const t = corner.sub(this.m_shadowCamera.position).dot(viewDir);
                if (t < tMin) tMin = t;
                if (t > tMax) tMax = t;
            }
            const slack = Math.max(100, (tMax - tMin) * 0.05);
            this.m_shadowCamera.near = Math.max(0.1, tMin - slack);
            this.m_shadowCamera.far = tMax + slack;
        }
        this.m_shadowCamera.updateProjectionMatrix();
        this.m_shadowCamera.updateMatrixWorld();

        // Depth-only pass over the casters (layer mask + override material)
        // in the INDEPENDENT context — the main renderer/canvas untouched.
        const prevOverride = scene.overrideMaterial;
        const prevLayers = this.m_shadowCamera.layers.mask;
        // §532: layer 1 filter REQUIRED — it also excludes the atmosphere
        // sky/ground meshes whose onBeforeRender asserts
        // (material instanceof GroundAtmosphereMaterial) against the pass's
        // override material, aborting the whole render (white canvas).
        this.m_shadowCamera.layers.set(1);
        scene.overrideMaterial = this.m_depthMaterial;
        try {
            this.m_shRenderer.setRenderTarget(null);
            this.m_shRenderer.clear();
            this.m_shRenderer.render(scene, this.m_shadowCamera);
        } catch (e) {
            (globalThis as any).__mbShadowPassErr = String(e);
        } finally {
            scene.overrideMaterial = prevOverride;
            this.m_shadowCamera.layers.mask = prevLayers;
        }
        this.m_shTex.needsUpdate = true;

        // §531 probe: renderer.info quantifies whether ctx2 drew anything.
        if ((globalThis as any).__mbDecodeDbg) {
            try {
                const inf = this.m_shRenderer.info;
                const g2: any = this.m_shRenderer.getContext();
                (globalThis as any).__mbShadowInfo = {
                    calls: inf.render.calls,
                    tris: inf.render.triangles,
                    geoms: inf.memory.geometries,
                    tex: inf.memory.textures,
                    lost: g2.isContextLost ? g2.isContextLost() : 'n/a',
                    err: g2.getError ? g2.getError() : -1,
                };
            } catch (e) {
                (globalThis as any).__mbShadowInfo = { err: String(e) };
            }
        }
        // §530 probe: 8×8 sample of the depth canvas (shadowdbg diagnostics).
        if ((globalThis as any).__mbDecodeDbg || (globalThis as any).__mbShadowEnable) {
            // §692: also log a LATE frame (60th) — frame-1 framing differs
            // (few casters registered yet) and the early snapshot misled the
            // shadow investigation once already.
            const __rc = ((this as any).__mbRunCount = ((this as any).__mbRunCount ?? 0) + 1);
            if (__rc === 1 || __rc === 60) {
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
                if (!((globalThis as any).__mbShadowGridLogged)) {
                    (globalThis as any).__mbShadowGridLogged = true;
                    // eslint-disable-next-line no-console
                    console.log('[MBShadowGrid] ' + JSON.stringify(grid));
                }
                // §533: the census dump signature now includes the grid, so
                // the (proven-reachable) census POST carries it.
            } catch (e) {
                (globalThis as any).__mbShadowGridErr = String(e);
            }
            }
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

        // §692 one-shot matrix probe: the receiver debug readout showed
        // intensity=1 (refresh chain ✓) but the depth sample stuck at its
        // 1.0 INIT with uv.z≈0 — the signature of the uv matrix reading as
        // identity at draw time. Log the actual matrix + framing once.
        if (!(this as any).__mbMatFrames) (this as any).__mbMatFrames = 0;
        const __rc = ++(this as any).__mbMatFrames;
        if (__rc === 1 || __rc === 60) {
            (this as any).__mbMatLogged = true;
            try {
                const p = this.m_shadowCamera.position;
                const pj = this.m_shadowCamera.projectionMatrix.elements;
                const vi = this.m_shadowCamera.matrixWorldInverse.elements;
                const bc = casterBox.getCenter(new THREE.Vector3());
                const bs = casterBox.getSize(new THREE.Vector3());
                // eslint-disable-next-line no-console
                console.log(`[MBShadowMat] f=${__rc} casters=${shadowCasters.size} cam=(${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}) r=${radius.toFixed(0)} nrfr=${this.m_shadowCamera.near.toFixed(0)}/${this.m_shadowCamera.far.toFixed(0)} p00=${pj[0].toExponential(2)} boxC=(${bc.x.toFixed(0)},${bc.y.toFixed(0)},${bc.z.toFixed(0)}) boxS=(${bs.x.toFixed(0)},${bs.y.toFixed(0)},${bs.z.toFixed(0)}) fc=(${frameCenter.x.toFixed(0)},${frameCenter.y.toFixed(0)},${frameCenter.z.toFixed(0)})`);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log('[MBShadowMat] probe error ' + String(e));
            }
        }

        this.prepGroundQuad(center, radius, eye);
    }

    dispose(): void {
        (this.m_mapView?.mapRenderingManager as any).preSceneHook = null;
        this.m_shRenderer?.dispose();
        this.m_shRenderer = null;
        this.m_shTex?.dispose();
        this.m_shTex = null;
    }
}
