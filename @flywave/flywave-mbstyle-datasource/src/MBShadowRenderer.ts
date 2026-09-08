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
    private m_shTex: THREE.Texture | null = null;
    private m_depthPixels: Uint8Array | null = null;
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
        // §885 终三十二: MeshBasicMaterial+onBeforeCompile — isomorphic with
        // the fill receivers (whose shadow sampling demonstrably works). The
        // previous ShaderMaterial's uMBShadowMatrix upload persisted IDENTITY
        // on the GPU while the CPU value was sane (终三十四), silencing the
        // entire ground quad.
        const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        // the scene sweep must not inject the ground receiver into the quad
        (mat as any).__mbShadowSkipped = true;
        (mat as any).__mbMglLit = true;
        mat.onBeforeCompile = (shader: any) => {
            shader.uniforms.uMBShadowMap = { value: this.m_shTex };
            shader.uniforms.uMBShadowMatrix = { value: new THREE.Matrix4() };
            shader.uniforms.uMBGroundShadowFactor = { value: new THREE.Vector3() };
            shader.uniforms.uMBShadowIntensity = { value: 0 };
            shader.uniforms.uMBShadowDbg = { value: (globalThis as any).__mbShadowDbg ? 1 : 0 };
            shader.uniforms.uMBInvProj = { value: new THREE.Matrix4() };
            shader.uniforms.uMBCamWorld = { value: new THREE.Matrix4() };
            shader.uniforms.uMBGroundZ = { value: -80 };
            // the full-screen NDC rasterization (the plane IS the NDC quad)
            shader.vertexShader = ('varying vec2 vNdc;\n' + shader.vertexShader).replace(
                '#include <project_vertex>',
                'gl_Position = vec4(position.xy, 0.9999, 1.0);\n    vNdc = position.xy;');
            // prepend the uniforms; replace the color write with the ground
            // shadow composite (the LINEAR-domain modulation, encoded by the
            // trailing colorspace_fragment like every other material)
            shader.fragmentShader = ('uniform sampler2D uMBShadowMap;\n' +
                'uniform mat4 uMBShadowMatrix;\n' +
                'uniform vec3 uMBGroundShadowFactor;\n' +
                'uniform float uMBShadowIntensity;\n' +
                'uniform float uMBShadowDbg;\n' +
                'uniform mat4 uMBInvProj;\n' +
                'uniform mat4 uMBCamWorld;\n' +
                'uniform float uMBGroundZ;\n' + shader.fragmentShader).replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                {
                    // §885 终四十一: the ground = the background × the
                    // ambient-ratio factor, UNIFORM — mgl's model-layer ground
                    // carries the ambient-directional darkening only (the
                    // expected dark ground is uniform 112, no directional
                    // cast pattern). The cast-shadow sampling is removed.
                    gl_FragColor.rgb *= mix(vec3(1.0),
                        pow(uMBGroundShadowFactor, vec3(1.0 / 2.2)), uMBShadowIntensity);
                }`);
            this.m_groundUniforms = shader.uniforms;
            (mat as any).customProgramCacheKey = () => 'mbgroundquad-v2';
        };
        const quad = new THREE.Mesh(geo, mat);
        quad.name = 'MBShadowGroundQuad';
        quad.frustumCulled = false;
        // §885 终三十二: the underlay channel (m_groundScene) is wiped by the
        // scene render — the quad ALSO rides m_scene at the lowest render
        // order (drawn before all models, after the background ground).
        quad.renderOrder = -2000;
        this.m_groundScene.add(quad);
        (this.m_mapView as any)?.m_scene?.add?.(quad);
        this.m_groundUniforms = (mat as any).uniforms || null;
    }

    /** Unproject one NDC corner onto the ground plane (far clamp on sky). */
    private cornerOnGround(
        cam: THREE.PerspectiveCamera, camPos: THREE.Vector3,
        ndcX: number, ndcY: number, far: number, planeZ: number, out: THREE.Vector3,
    ): void {
        // Standard unproject: NDC (z=-1, near plane) → view → world.
        const v = new THREE.Vector4(ndcX, ndcY, -1, 1)
            .applyMatrix4(cam.projectionMatrixInverse);
        const dir = new THREE.Vector3(v.x / v.w, v.y / v.w, v.z / v.w)
            .applyMatrix4(cam.matrixWorld)
            .sub(camPos)
            .normalize();
        const t = dir.z < -1e-6 ? (planeZ - camPos.z) / dir.z : far;
        out.copy(camPos).addScaledVector(dir, Math.min(Math.abs(t), far));
        // §885 终二十: one-shot per-corner dump — dir/t/out vs camPos, to
        // locate the 2.00× ground-intersection offset (far clamp vs ray
        // direction vs unproject origin).
        if (!(globalThis as any).__mbCgDumped) {
            (globalThis as any).__mbCgDumped = true;
            // eslint-disable-next-line no-console
            console.log('[MBCG] ndc=(' + ndcX + ',' + ndcY + ') camPos=(' + camPos.x.toFixed(1) + ',' + camPos.y.toFixed(1) + ',' + camPos.z.toFixed(1) + ') dir=(' + dir.x.toFixed(4) + ',' + dir.y.toFixed(4) + ',' + dir.z.toFixed(4) + ') t=' + t.toFixed(0) + ' clamp=' + Math.min(Math.abs(t), far).toFixed(0) + ' far=' + far.toFixed(0) + ' out=(' + out.x.toFixed(1) + ',' + out.y.toFixed(1) + ',' + out.z.toFixed(1) + ')');
        }
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
            // §885 终十九: did the underlay channel actually fire? (the
            // composer render path never calls preSceneHook.)
            (globalThis as any).__mbGQDraws = ((globalThis as any).__mbGQDraws ?? 0) + 1;
        } finally {
            renderer.setRenderTarget(prevRT);
        }
    }

    private prepGroundQuad(center: THREE.Vector3, radius: number, eye: THREE.Vector3): void {
        this.ensureGroundQuad();
        // §885 终三十二: the uniform map exists only after the quad's first
        // compile (the onBeforeCompile stash) — skip until then.
        if (!this.m_groundUniforms) return;
        // §885 终三十二: the uniform map exists only after the quad's first
        // compile (the onBeforeCompile stash) — skip until then.
        if (!this.m_groundUniforms) return;
        const renderer = this.m_mapView?.renderer as THREE.WebGLRenderer | undefined;
        // §885 终二十七: compute the corners IN THE SCENE (RTE) frame — the
        // frame the casters, the depth pass, the shadow-camera fit, and the
        // model receivers (uMBShWorldMatrix) all share. The rteCamera sits at
        // that frame's origin with the logical camera's rotation, so the
        // rays originate at (0,0,0) and the ground plane sits at z = −eye.z
        // (the casters' ground z carries −eye.z). The previous version
        // unprojected with the ABSOLUTE-frame logical camera: its ground
        // points then differed from the depth map's frame by the whole
        // pivot-to-camera offset and the quad's shadow landed off-screen.
        // §885 终三十: the analytic quad needs the RTE camera's projection
        // inverse and world matrix (rotation) — the corners/uMBGC remain for
        // the fill receivers' screen-space reconstruction.
        const rteCam = (this.m_mapView as any).getRteCamera?.() as THREE.PerspectiveCamera | undefined;
        const cam = rteCam ?? (this.m_mapView?.camera as THREE.PerspectiveCamera | undefined);
        if (!renderer || !cam) return;
        cam.updateMatrixWorld();
        const groundZ = -eye.z;
        // §885 终三十一: the rteCamera's projectionMatrix is COPIED from the
        // logical camera (MapView.update), but its projectionMatrixInverse is
        // never recomputed — it stays IDENTITY, collapsing every ground ray
        // to the origin (±136 units) and pushing all shadow samples outside
        // the map. Derive the inverse from the projection matrix here.
        this.m_groundUniforms.uMBInvProj.value.copy(cam.projectionMatrix).invert();
        this.m_groundUniforms.uMBCamWorld.value.copy(cam.matrixWorld);
        this.m_groundUniforms.uMBGroundZ.value = groundZ;
        const corners = this.m_groundUniforms.uMBGC.value as THREE.Vector3[];
        const far = radius * 8;
        const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
        this.cornerOnGround(cam, camPos, -1, -1, far, groundZ, corners[0]);
        this.cornerOnGround(cam, camPos, 1, -1, far, groundZ, corners[1]);
        this.cornerOnGround(cam, camPos, 1, 1, far, groundZ, corners[2]);
        this.cornerOnGround(cam, camPos, -1, 1, far, groundZ, corners[3]);
        // §692: RTE render camera sits at origin (identity world matrix),
        // so cornerOnGround computes RTE-relative ground intersections
        // (all ≈ 0,0,0). The receiver needs ABSOLUTE world positions for
        // `mbWP - uMBEye` to yield the correct RTE offset. Add eye back.
        // §885 终十九: the add(eye) was REMOVED — it cancels exactly in the
        // shader's `mbWP - uMBEye` (linear), but it leaked eye.z (82 here,
        // 458 on buildings-trees) into vMBWorldPos.z, whose `> 1.0` sky-gate
        // then DISCARDED EVERY fragment — the quad never rasterized a single
        // pixel (bit-identical ground across every receiver change). The
        // corners stay ABSOLUTE; uMBEye subtraction yields the eye-relative
        // frame the depth pass frames the casters in.
        // The shadow camera lives in the eye-rebased scene frame — bring the
        // absolute-world corners into the SAME frame (casters' worldPos z
        // also carries −eye.z, so the ground plane here is z = −eye.z).
        // Corners stay ABSOLUTE — the fragment shader rebases by uMBEye.
        this.m_groundUniforms.uMBShadowMap.value = this.m_shTex;
        this.m_groundUniforms.uMBShadowMatrix.value.copy(this.m_matrix);
        this.m_groundUniforms.uMBShadowIntensity.value = this.m_intensity;

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
        if (clear !== undefined) {
            this.m_groundUniforms.uMBGroundColor.value.setHex(clear);
            // §885 终三十二: the MeshBasic quad's material color = the map
            // background; the injected shadow composite modulates it.
            if (this.m_groundQuad) {
                (this.m_groundQuad.material as THREE.MeshBasicMaterial).color.setHex(clear);
            }
        }
        // §692: drawing-buffer size for the screen-space receivers
        // (gl_FragCoord.xy is in device px).
        const cv2 = this.m_mapView?.canvas as HTMLCanvasElement | undefined;
        if (cv2) this.m_res.set(cv2.width, cv2.height);
        // §643: the quad itself is drawn by the engine's preSceneHook —
        // see drawGroundQuad.
        // §885 终十九: cross-fixture ground-quad state snapshot (POSTed via
        // the harness probe channel) — matrix/eye/corners/draw-count plus the
        // composer routing flags, to isolate why the same quad code shows
        // the ground shadow in one style and samples lit in another.
        try {
            const mrm: any = (this.m_mapView as any)?.mapRenderingManager;
            (globalThis as any).__mbGQState = {
                matrix: this.m_matrix.elements.slice(0, 16),
                eye: eye.toArray(),
                corners: corners.map((c: any) => c.toArray()),
                drawn: (globalThis as any).__mbGQDraws ?? 0,
                anyEffect: !!(mrm?.m_anyEffectEnabled),
                composer: !!mrm?.m_composer,
                res: [this.m_res.x, this.m_res.y],
            };
        } catch { /* probe only */ }
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
        // §769c: gate flipped to default-ON. The §522 uniform-darkening root
        // cause (black clear color) was fixed to white-clear in a later
        // session but this opt-in gate was left behind, so shadow-intensity
        // never produced a shadow map (uMBShadowMap null → the extrusion
        // shadow modulation no-oped → buildings flat gray,
        // buildings-trees-shadows-casting 729,580). Opt OUT via
        // `shadowdisable=1` keeps a forensic escape hatch.
        if ((globalThis as any).__mbShadowDisable) return;
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
        // §885 终五: meshes instantiated AFTER the group registered (async
        // placement clones) miss the layer-1 enable done at build time and
        // silently drop out of the depth pass (3 of 8 landmark meshes).
        // Refresh every frame — enable is idempotent and cheap.
        for (const obj of shadowCasters) {
            obj.traverse((o: any) => o.layers.enable(1));
        }

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
            // §885 终二十五: intermediate 2D copy — the receivers sample a
            // CanvasTexture over THIS canvas; a WebGL canvas source reads
            // back EMPTY at the receivers' upload time under SwiftShader
            // headless (the quad sampled 1.0 everywhere while the depth
            // canvas itself had the buildings dead-center), while a 2D
            // canvas bitmap persists.
            (this as any).__mbDepth2d = document.createElement('canvas');
            (this as any).__mbDepth2d.width = size;
            (this as any).__mbDepth2d.height = size;
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
            this.m_shTex = new THREE.CanvasTexture((this as any).__mbDepth2d);
            this.m_shTex.minFilter = THREE.NearestFilter;
            this.m_shTex.magFilter = THREE.NearestFilter;
            this.m_shTex.generateMipmaps = false;
            // §885 终七: the depth canvas is rendered in GL orientation and
            // uMBShadowMatrix maps world→uv in the SAME convention — the
            // default flipY=true upload mirrors it vertically, so every
            // receiver sampled a vertically-mirrored (mostly empty) texel
            // and the entire model-layer shadow family rendered shadowless.
            this.m_shTex.flipY = false;
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
        // §885 终二十二: prefer the lighting3DState dir (§683 scene-frame
        // convention) — it is what the model receivers' wall NdotL uses
        // (modelLightDir, cast-shadows gated), and the raw spherical form
        // casts the ground shadow mirrored from expected (the quad's dark
        // region landed offset from expected's projection).
        if (dirArr) {
            lightDir = new THREE.Vector3(dirArr[0], dirArr[1], dirArr[2]).normalize();
        } else if (dirProp) {
            const a = (dirProp[0] + 90) * Math.PI / 180;
            const pl = dirProp[1] * Math.PI / 180;
            lightDir = new THREE.Vector3(
                Math.cos(a) * Math.sin(pl), Math.sin(a) * Math.sin(pl), Math.cos(pl));
        } else {
            lightDir = new THREE.Vector3(0, 0, 1);
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
            // §885 终三十一: the ±384-unit margin clipped the ground shadow
            // beyond the casters (the measured dark region was 32% of
            // expected's — the far-side shadow extended past the map). A 2.5×
            // half-span keeps the casters at ~40% of the depth canvas while
            // covering the full cast-shadow extent.
            radius = Math.max(50, Math.max(sz.x, sz.y, 1) * 2.5);
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
        // §885 终三十一: read the depth render into a DataTexture — a
        // byte-exact copy of the shadow framebuffer. The CanvasTexture paths
        // (WebGL canvas direct, and the 2D drawImage snapshot) both sampled
        // EMPTY in the quad while the model materials read content — the
        // DataTexture removes the canvas-read variable entirely.
        const gl2: any = this.m_shRenderer.getContext();
        const px = size * size * 4;
        if (!this.m_depthPixels || this.m_depthPixels.length !== px) {
            this.m_depthPixels = new Uint8Array(px);
        }
        try {
            gl2.readPixels(0, 0, size, size, gl2.RGBA, gl2.UNSIGNED_BYTE, this.m_depthPixels);
        } catch (e) {
            (globalThis as any).__mbDepthReadErr = String(e).slice(0, 120);
        }
        if (!this.m_shTex || !(this.m_shTex as any).isDataTexture) {
            this.m_shTex = new THREE.DataTexture(this.m_depthPixels, size, size, THREE.RGBAFormat);
            this.m_shTex.magFilter = THREE.NearestFilter;
            this.m_shTex.minFilter = THREE.NearestFilter;
            this.m_shTex.generateMipmaps = false;
            this.m_shTex.flipY = false;
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
            if (__rc === 1 || __rc === 60 || __rc === 1800 || __rc === 5400) {
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
                // §885: log EVERY probed frame (the once-guard hid the
                // steady-state depth coverage and misled §884).
                // eslint-disable-next-line no-console
                console.log(`[MBShadowGrid] f=${__rc} ` + JSON.stringify(grid));
                // §884: coarse dark-pixel bounding box + caster corners in
                // shadow NDC — is the model rendered but tiny/misplaced, or
                // absent from the depth canvas entirely?
                try {
                    const N = 64;
                    const px3 = new Uint8Array(4);
                    let minX = N, maxX = -1, minY = N, maxY = -1;
                    for (let gy = 0; gy < N; gy++) {
                        for (let gx = 0; gx < N; gx++) {
                            const x = Math.min(1023, gx * 16 + 8);
                            const y = Math.min(1023, (N - 1 - gy) * 16 + 8);
                            gl2.readPixels(x, y, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px3);
                            if (px3[0] < 250) {
                                if (gx < minX) minX = gx;
                                if (gx > maxX) maxX = gx;
                                if (gy < minY) minY = gy;
                                if (gy > maxY) maxY = gy;
                            }
                        }
                    }
                    const v = new THREE.Vector3();
                    const ndcs: string[] = [];
                    for (let i = 0; i < 8; i++) {
                        v.set(
                            i & 1 ? casterBox.max.x : casterBox.min.x,
                            i & 2 ? casterBox.max.y : casterBox.min.y,
                            i & 4 ? casterBox.max.z : casterBox.min.z,
                        ).project(this.m_shadowCamera);
                        ndcs.push(`(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)})`);
                    }
                    // eslint-disable-next-line no-console
                    console.log('[MBShadowFit] f=' + __rc + ' darkBox=(' + minX + ',' + minY + ')..(' + maxX + ',' + maxY + ')/64 ndc=[' + ndcs.join(' ') + ']');
                    // §885: full depth-canvas dump (visual) — POST dataURL to
                    // the result server via the harness feedback channel.
                    try {
                        const fb = (globalThis as any).__mbShadowFeedbackUrl;
                        if (fb && __rc === 60) {
                            const url2 = (this.m_shRenderer.domElement as HTMLCanvasElement).toDataURL('image/png');
                            fetch(`${fb}/mb-probe-dump`, {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ probe: 'shadow-depth-canvas', dataUrl: url2 }),
                            }).catch(() => { });
                        }
                    } catch { /* probe only */ }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.log('[MBShadowFit] err ' + e);
                }
                // §885 终五: same-frame scene mesh census — are the RENDERED
                // model meshes the same objects as the shadowCasters set?
                // (receiver fragments sat +240..390 above the caster box.)
                try {
                    const scene2: any = this.m_mapView?.m_scene;
                    let n = 0, nL1 = 0;
                    const zb = new THREE.Box3();
                    const tmp2 = new THREE.Vector3();
                    const worldBox = new THREE.Box3();
                    let have = false;
                    scene2?.traverse?.((o: any) => {
                        if (!o.isMesh) return;
                        n++;
                        if (o.layers.mask & 2) nL1++;
                        o.updateWorldMatrix?.(true, false);
                        const g = o.geometry;
                        const pa = g?.attributes?.position;
                        if (!pa) return;
                        for (let vi = 0; vi < Math.min(4, pa.count); vi++) {
                            tmp2.set(pa.getX(vi), pa.getY(vi), pa.getZ(vi))
                                .applyMatrix4(o.matrixWorld);
                            zb.expandByPoint(tmp2);
                            worldBox.expandByPoint(tmp2);
                            have = true;
                        }
                    });
                    const zc = zb.getCenter(new THREE.Vector3());
                    const zs = zb.getSize(new THREE.Vector3());
                    const cc = worldBox.getCenter(new THREE.Vector3());
                    const cs = worldBox.getSize(new THREE.Vector3());
                    // eslint-disable-next-line no-console
                    console.log(`[MBShadowScene] meshes=${n} withL1=${nL1} sampledZ=[${zb.min.z.toFixed(0)},${zb.max.z.toFixed(0)}] allWorldZ=[${worldBox.min.z.toFixed(0)},${worldBox.max.z.toFixed(0)}] c=(${cc.x.toFixed(0)},${cc.y.toFixed(0)},${cc.z.toFixed(0)}) s=(${cs.x.toFixed(0)},${cs.y.toFixed(0)},${cs.z.toFixed(0)}) casterBoxZ=[${casterBox.min.z.toFixed(0)},${casterBox.max.z.toFixed(0)}]`);
                    // §885 终九: per-mesh listing — find duplicate model
                    // copies (shared patched materials used by non-caster
                    // objects at z +159..390).
                    scene2?.traverse?.((o: any) => {
                        if (!o.isMesh) return;
                        const pa = o.geometry?.attributes?.position;
                        if (!pa) return;
                        o.updateWorldMatrix?.(true, false);
                        const t3 = new THREE.Vector3();
                        const mb = new THREE.Box3();
                        for (let vi = 0; vi < pa.count; vi += Math.max(1, Math.floor(pa.count / 24))) {
                            t3.set(pa.getX(vi), pa.getY(vi), pa.getZ(vi)).applyMatrix4(o.matrixWorld);
                            mb.expandByPoint(t3);
                        }
                        const m0: any = Array.isArray(o.material) ? o.material[0] : o.material;
                        const l1 = (o.layers.mask & 2) ? 1 : 0;
                        let inCasters = false;
                        for (const c of shadowCasters) {
                            if (c === o || c === o.parent) { inCasters = true; break; }
                        }
                        // eslint-disable-next-line no-console
                        console.log(`[MBMesh] z=[${mb.min.z.toFixed(0)},${mb.max.z.toFixed(0)}] x=[${mb.min.x.toFixed(0)},${mb.max.x.toFixed(0)}] L1=${l1} caster=${inCasters ? 1 : 0} mat=${m0?.uuid?.slice?.(0, 8) ?? '?'} vis=${o.visible}`);
                    });
                    // §885 终七: per-caster identity — is each registered
                    // caster actually attached to the rendered scene, and
                    // where does it sit in world Z?
                    let ci = 0;
                    for (const cobj of shadowCasters) {
                        if (ci++ >= 4) break;
                        let attached = false;
                        let p: any = cobj;
                        while (p) { if (p === scene2) { attached = true; break; } p = p.parent; }
                        const cb = new THREE.Box3().setFromObject(cobj);
                        const cz = cb.isEmpty() ? 'empty' : `[${cb.min.z.toFixed(0)},${cb.max.z.toFixed(0)}]`;
                        // eslint-disable-next-line no-console
                        console.log(`[MBCaster] i=${ci - 1} attached=${attached} inSceneRoot=${cobj.parent === scene2} z=${cz} name=${cobj.name ?? '?'}`);
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.log('[MBShadowScene] err ' + e);
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
        if (__rc === 1 || __rc === 60 || __rc === 1800 || __rc === 5400) {
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
