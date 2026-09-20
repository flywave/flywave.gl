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

import { mglLightFrameRef } from './ArRef';

export const shadowCasters = new Set<THREE.Object3D>();

/**
 * §885 终三一二: shadow-map resolution knob (shres=<n> via test/runner
 * MBSTYLE_SHRES; default 1024 = the calibrated delivery state). mgl runs
 * 2048; the A/B pairs 2048 with the texel-snap knob (mgl is a 2048+snap
 * combo). All consumers (renderer canvas/RT/readPixels, ground-quad and
 * model-tail PCF texel denominators, snap half-resolution) read THIS at
 * use/compile time, so a single global flip re-scales the whole pipeline.
 */
export function mbShadowRes(): number {
    return (globalThis as any).__mbShadowRes ?? 2048; // §885 g51t10: match mgl shadowMapResolution
}

export interface ShadowUniformState {
    map: THREE.Texture;
    /** §885 g58 (audit S10): sampler2DShadow binding (compare-mode depth
     * texture); null when shadow2d off. */
    mapS0?: THREE.Texture | null;
    matrix: THREE.Matrix4;
    map1?: THREE.Texture;
    matrix1?: THREE.Matrix4;
    texel1?: number;
    /** §885 终二九三+: model-specific RAW-axis cascade-0 — model receivers
     * prefer this map/matrix; the ground quad and fill receivers stay on the
     * mirror cascades (the shaz sweep proved per-consumer axes are required:
     * ground 镜像系 vs model raw 系 cannot share one camera). */
    mapR?: THREE.Texture;
    matrixR?: THREE.Matrix4;
    intensity: number;
    /** Screen-corner ground-plane world positions (NDC (-1,-1),(1,-1),(1,1),(-1,1)) —
     * receivers interpolate their ground world pos from gl_FragCoord (§692). */
    corners: THREE.Vector3[];
    eye: THREE.Vector3;
    /** Drawing-buffer size in device px (gl_FragCoord space). */
    res: THREE.Vector2;
    /** §885 终一百四十六: matrixWorld·projectionMatrixInverse — the receiver
     * ray-cast's NDC→world unproject matrix (uMBInvViewProj). */
    invViewProj?: THREE.Matrix4;
    /** §885 终三十九g50b: live auto compare-bias (box z-span ramp). */
    biasAuto?: number;
    /** §885 终四十二g50w: mgl u_shadow_normal_offset world-up displacement
     * (meters) — kills receiver self-sampling acne on coplanar surfaces. */
    normalOffsetZ?: number;
    /** §885 g56 (audit S9): mgl cascade-1 far = 4.5×ctcd (metres). */
    fadeFar?: number;
    /** §885 g56 (audit S11): mgl per-cascade normal-offset multipliers (m). */
    normalOffset0?: number;
    normalOffset1?: number;
    /** §717: shadow-camera far (world units) — the fade-out envelope. */
    far: number;
}

// §885 终三十九g50f: Andrew monotone-chain convex hull (analytic shadow
// footprint per caster).
function mbConvexHull(pts: [number, number][]): [number, number][] {
    if (pts.length < 3) return pts;
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
        (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: [number, number][] = [];
    for (const q of p) {
        while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
        lo.push(q);
    }
    const up: [number, number][] = [];
    for (let i = p.length - 1; i >= 0; i--) {
        const q = p[i];
        while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
        up.push(q);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
}

export class MBShadowRenderer {
    // §530: independent-context depth pass renderer + CanvasTexture回流.
    private m_shRenderer: THREE.WebGLRenderer | null = null;
    private m_hwRT: THREE.WebGLRenderTarget | null = null;
    /** §885 g58 (audit S10): compare-mode depth RT for the shadow sampler
     * (m_hwRT's texture must stay plain for the software-path readers). */
    private m_hwRTS: THREE.WebGLRenderTarget | null = null;
    private m_shTex: THREE.Texture | null = null;
    private m_shTex1: THREE.DataTexture | null = null;
    private m_depthPixels1: Uint8Array | null = null;
    private m_matrix1 = new THREE.Matrix4();
    // §885 终二九三+: model-specific raw-axis cascade-0 — independent pass +
    // matrix + depth map (the ground quad keeps the mirror cascade-0/1 pair).
    private m_shTexR0: THREE.DataTexture | null = null;
    private m_depthPixelsR0: Uint8Array | null = null;
    private m_matrixR0 = new THREE.Matrix4();
    private m_depthPixels: Uint8Array | null = null;
    private m_shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    // §532 bisect: ShaderMaterial vs Basic — is the ctx2 blank a silent
    // shader-compile failure or something else? (Basic draws white geometry.)
    private m_depthMaterial: THREE.Material = new THREE.ShaderMaterial({
        // §885 终五十六g51o2补: side stays FrontSide — global DoubleSide
        // regressed ortho-camera +44k (fills' back faces re-store depth at
        // grazing views) with no conflation benefit; the no-normal prims
        // already rasterize via the g51o NaN guard. Per-model DoubleSide is
        // a model-resource-level follow-up.
        // §885 终二百二十三: caster-side normal-offset (mgl model.vertex
        // RENDER_SHADOWS path): shadow-space position is offset along the
        // world normal by uMBNormalOffset meters · dotScale, so the depth
        // footprint keeps street texels lit at wall bases (mgl
        // u_shadow_normal_offset [tileToMeter, off0, off1] semantics).
        vertexShader: `
            uniform float uMBNormalOffset;
            uniform vec3 uMBLightDir;
            void main(){
                // §885 终五十五g51o: NaN-proof the normal — geometries without
                // a normal attribute bind (0,0,0), normalize → NaN, and the
                // NaN·0 offset poisons wp → every triangle of such models is
                // silently dropped from the depth pass (landmark shadow lost).
                vec3 nAttr = normal;
                vec3 wN = mat3(modelMatrix) * nAttr;
                if (!(dot(wN, wN) > 0.0)) { wN = vec3(0.0, 0.0, 1.0); }
                wN = normalize(wN);
                float dotScale = min(1.0 - dot(wN, uMBLightDir), 1.0) * 0.5 + 0.5;
                vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz
                    + wN * uMBNormalOffset * dotScale;
                gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
            }`,
                uniforms: {
            // §885 终四十九g51f: DEFAULT 0 — mgl displaces RECEIVERS along the
            // surface normal (shadow_normal_offset, _prelude_shadow.vertex.glsl)
            // and never displaces casters. The historical +3 caster-side push
            // shifted every stored depth toward the light by ~0.006 uv, which
            // the pre-g51e inverted comparator needed (self-samples read lit)
            // but under the mgl GREATER comparator it marks every coplanar
            // self-sample occluded. shcastnormal=<v> restores a value for A/B.
            uMBNormalOffset: { value: 0 },
            // (mgl _shadowParameters.normalOffset default; sweep 3/10/30 all
            // plateau at 135,328 on ground-shadow-fog — the residual there
            // is dominated by non-shadow differences.)
            uMBLightDir: { value: new THREE.Vector3(0, 0, 1) },
        },
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
    // §885 终五十七g51p: DoubleSide twin of the depth material for LAYER-2
    // casters — GLB primitives WITHOUT a NORMAL attribute (GLB census:
    // 106/212 landmark prims are POSITION-only). Their winding is arbitrary,
    // so a FrontSide pass drops roughly half their triangles; rendering them
    // in their own DoubleSide layer pass fills the footprint without the
    // global DoubleSide fill back-face regression (ortho-camera +44k).
    // Uniforms are SHARED with the front-side material (same objects) so a
    // single per-frame refresh drives both programs.
    private m_depthMaterialDS: THREE.Material = new THREE.ShaderMaterial({
        vertexShader: (this as any).m_depthMaterial.vertexShader,
        fragmentShader: (this as any).m_depthMaterial.fragmentShader,
        uniforms: (this as any).m_depthMaterial.uniforms,
        colorWrite: true,
        side: THREE.DoubleSide,
    });
    private m_matrix = new THREE.Matrix4();
    private m_enabled = false;
    private m_intensity = 0;
    /** §885 终三十九g50b: live auto depth-compare bias (box z-span ramp),
     * refreshed per fit and shipped to receivers as a uniform — the baked
     * compile-time define raced the first fit nondeterministically. */
    private m_biasAuto = 0.0002;
    /** §885 终四十二g50w: mgl u_shadow_normal_offset world-up displacement. */
    private m_normalOffsetZ = 0;
    /** §885 g56: latent-field declarations surfaced by the TS1128 fix —
     * getShadowUniforms' texel1 and the analytic-throttle tick read these. */
    private m_shadRadius = 1;
    private m_analyticTex: THREE.Texture | null = null;
    /** §885 g56: mgl per-cascade normal-offset multipliers (meters). */
    private m_noffLerpClamp = 1;
    private m_normalOffsetRR = 1;
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
    // §885 终五十八: receiver state lives HERE — the quad's uniform map
    // (MeshBasic onBeforeCompile stash) has no uMBGC/uMBEye, and
    // getShadowUniforms reading them from there threw TypeError on every
    // frame, aborting the whole AfterRender listener.
    private m_corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    private m_eye = new THREE.Vector3();

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
        // §885 终四十四g50y: poke on the FALSE→TRUE transition — static
        // fixtures idle ~3 frames after load, often BEFORE the style lights
        // resolve; without extra frames the post-activation receiver refresh
        // never runs and intensity stays 0 (all-lit, no bands).
        const wasEnabled = this.enabled;
        this.m_enabled = enabled;
        this.m_intensity = intensity;
        if (enabled && !wasEnabled && this.m_mapView) {
            for (const d of [80, 300, 800, 1500, 2500]) {
                setTimeout(() => { try { this.m_mapView?.update?.(); } catch { /* idle */ } }, d);
            }
        }
        if (!enabled && this.m_groundQuad) {
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
        // §885 终四十一g50v: under ortho the shadow chain stays ON (the
        // per-material receivers render the correct deck bands; the ground
        // quad self-disables via m_orthoStyle above). orthoshadowoff=1
        // restores the historical full disable for A/B.
        if (ortho && (globalThis as any).__mbOrthoShadowOff) this.setLightState(false, 0);
    }

    /** §572b gate retired with the AfterRender overlay channel (§643). */
    setStyleHasTranslucent(_t: boolean): void {}

    get enabled(): boolean {
        return this.m_enabled && this.m_intensity > 0;
    }

    /** Uniform state for receiving-material injection; null when inactive. */
    getShadowUniforms(): ShadowUniformState | null {
        if (!this.enabled || !this.m_shTex) return null;
        // §885 终四十四g50y: m_groundUniforms gate REMOVED — it only existed
        // to signal "the quad compiled", but the returned state (map/matrices
        // /intensity) is renderer-owned and independent of the quad. With the
        // quad disabled under ortho (m_orthoStyle gate) this gate kept the
        // whole receiver refresh dead: getShadowUniforms() null → per-frame
        // intensity reset to 0 → every receiver all-lit (ortho-camera
        // 57,230 with no bands).
        const cv = this.m_mapView?.canvas as HTMLCanvasElement | undefined;
        // §885 终一百四十六: view→world unproject matrix for the receiver
        // ray-cast (uMBInvViewProj). matrixWorld·projectionMatrixInverse maps
        // NDC (±1) back to world; recomputed each read so the per-frame
        // camera move never desynchronizes the receivers.
        // §885 终三十九g48: MUST be the RTE camera — the shadow m_matrix is
        // fitted in the RTE frame (translation ~±1), so a ray-cast through
        // the ABSOLUTE logical camera produced mbWP ≈ 3.5e7-world coordinates
        // that m_matrix mapped far outside [0,1] (every receiver gate
        // rejected; shrad sweeps changed nothing). Same disease the ground
        // quad already fixed at 终二十七 (its comment block below).
        const rteCamU = (this.m_mapView as any).getRteCamera?.() as THREE.PerspectiveCamera | undefined;
        const cam = rteCamU ?? this.m_mapView?.camera as THREE.PerspectiveCamera | undefined;
        if (cam) {
            cam.updateMatrixWorld?.();
            // §885 终三十一 lesson: the rteCam's projectionMatrixInverse is
            // stale (copied without recompute) — derive it here.
            cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
            (this as any).__mbInvViewProj =
                ((this as any).__mbInvViewProj as THREE.Matrix4) ??
                new THREE.Matrix4();
            ((this as any).__mbInvViewProj as THREE.Matrix4)
                .multiplyMatrices(cam.matrixWorld, cam.projectionMatrixInverse);
        }
        return {
            map: this.m_shTex,
            matrix: this.m_matrix,
            map1: this.m_shTex1 ?? undefined,
            matrix1: this.m_matrix1,
            mapR: this.m_shTexR0 ?? undefined,
            matrixR: this.m_matrixR0,
            texel1: (8 * this.m_shadRadius) / mbShadowRes(),
            intensity: this.m_intensity,
            corners: this.m_corners,
            eye: this.m_eye,
            res: this.m_res,
            invViewProj: (this as any).__mbInvViewProj as THREE.Matrix4,
            // §885 终三十九g50b: live compare-bias window for receivers.
            biasAuto: this.m_biasAuto,
            normalOffsetZ: this.m_normalOffsetZ,
            /** §885 g58 (audit S10): sampler2DShadow binding (compare-mode
             * depth texture) — null when shadow2d is off. */
            mapS0: ((globalThis as any).__mbShadow2D === true
                && (globalThis as any).__mbShadow2DQuad !== false
                && (globalThis as any).__mbShadowHW)
                ? ((globalThis as any).__mbShTexS0 ?? null) : null,
            // §885 g56 (audit S11): mgl u_shadow_normal_offset[1]/[2] —
            // per-cascade vertex normal-offset multipliers, meters:
            // texel_i = 2·radius_m(i)/res (ortho window ±radius over res
            // texels; collapses mgl's 2/tileSize·EXTENT/res·radius_px·
            // tileInMeters), × lerpClamp(zoom, 22→0.125, 0→4), vector-tile
            // multiplier 1.0. cascade1 uses the far-field half-extent rr.
            normalOffset0: (2 * this.m_shadowCamera.right / mbShadowRes())
                * this.m_noffLerpClamp,
            normalOffset1: (2 * this.m_normalOffsetRR / mbShadowRes())
                * this.m_noffLerpClamp,
            // §717: mgl u_fade_range = [lastCascade.far×0.75, lastCascade.far]
            // (shadow_renderer.ts:363) — receiver shadows fade to lit across
            // the far quarter of the coverage; single-cascade far stands in.
            far: this.m_shadowCamera.far,
            // §885 g56 (audit S9): mgl cascade-1 far = shadowCutoutDist =
            // 3 × cascadeSplitDist(=1.5×cameraToCenterDistance) — in PIXELS
            // (mgl light/clip space is pixel-uniform). Our metric frame:
            // ctcd_px/ppm == targetDistance (metres), so the literal
            // far1 = 4.5 × ctcd is 4.5 × targetDistance metres.
            fadeFar: 4.5 * Math.max(1, (this.m_mapView as any).targetDistance ?? 500),
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
        const mat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            // OVERLAY mode (default) draws the quad ON TOP (transparent) —
            // needs transparent:true; the multiply-underlay mode
            // (shadowoverlay=0, 终一百四十二) composites in the color op instead.
            transparent: (globalThis as any).__mbShadowOverlay !== false,
            // §885 终一百四十七: the vertex replace drops project_vertex —
            // with material.fog on a fog style three's fog_vertex then reads
            // mvPosition and the program fails to compile (the quad was
            // silently absent from every fog-style measurement). The quad IS
            // the shadow overlay: no scene fog.
            fog: false,
        });
        // the scene sweep must not inject the ground receiver into the quad
        (mat as any).__mbShadowSkipped = true;
        (mat as any).__mbMglLit = true;
        mat.onBeforeCompile = (shader: any) => {
            const biasV = Number((globalThis as any).__mbShadowBias ?? 0.0002);
            // §885 终一百四十七: compile-time defines for the quad program —
            // MB_SH_BIAS must ALWAYS be defined (the smoothstep compare uses
            // it in both modes); MB_SH_HW only when on (#ifdef is a
            // defined-check, a `#define X 0` would activate it).
            const overlayOn = (globalThis as any).__mbShadowOverlay !== false;
            const hwDef = (globalThis as any).__mbShadowHW
                ? '#define MB_SH_HW 1\n'
                : '';
            const shadow2dOn = (globalThis as any).__mbShadow2D === true
                && (globalThis as any).__mbShadow2DQuad !== false;
            const s2dDef = shadow2dOn ? '#define MB_SH_SHADOW2D 1\n' : '';
            const biasDef = `#define MB_SH_BIAS ${biasV}\n#define MB_SHADOW_OVERLAY ${overlayOn ? 1 : 0}\n`;
            if (shadow2dOn) {
                // §885 g58 (audit S10): GLSL3 for sampler2DShadow. three's
                // GLSL3 prefix defines attribute/varying/texture2D but NOT
                // gl_FragColor — declare the out + alias here.
                (mat as any).glslVersion = THREE.GLSL3;
                shader.fragmentShader = 'layout(location = 0) out highp vec4 pc_fragColor;\n#define gl_FragColor pc_fragColor\n'
                    + hwDef + s2dDef + biasDef + shader.fragmentShader;
            } else {
                shader.fragmentShader = hwDef + s2dDef + biasDef + shader.fragmentShader;
            }
            shader.uniforms.uMBShadowMap = { value: this.m_shTex };
            // §885 g58 (audit S10): mgl sampler2DShadow (compare GREATER,
            // hardware bilinear PCF) — same texture, compare-mode binding.
            shader.uniforms.uMBShadowS0 = { value: this.m_shTex };
            shader.uniforms.uMBShadowMatrix = { value: this.m_matrix.clone() };
            shader.uniforms.uMBShadowMap1 = { value: this.m_shTex1 };
            shader.uniforms.uMBShadowMatrix1 = { value: this.m_matrix1.clone() };
            shader.uniforms.uMBGroundShadowFactor = { value: new THREE.Vector3() };
            shader.uniforms.uMBShadowIntensity = { value: 0 };
            shader.uniforms.uMBShadowDbg = { value: (globalThis as any).__mbShadowDbg ? ((globalThis as any).__mbQuadDbg ? 2 : 1) : 0 };
            // §885 终二百一十九: PCF texel size + cascade-1 view-depth fade
            // range ([0.75·far1, far1], mgl shadow_renderer.ts:362-363).
            shader.uniforms.uMBShadowTexel = { value: 1 / mbShadowRes() };
            shader.uniforms.uMBFadeRange = { value: new THREE.Vector2(
                4.5 * Math.max(1, (this.m_mapView as any).targetDistance ?? 500) * 0.75,
                4.5 * Math.max(1, (this.m_mapView as any).targetDistance ?? 500)) };
            shader.uniforms.uMBInvProj = { value: new THREE.Matrix4() };
            shader.uniforms.uMBCamWorld = { value: new THREE.Matrix4() };
            shader.uniforms.uMBGroundZ = { value: -80 };
            // the full-screen NDC rasterization (the plane IS the NDC quad)
            shader.vertexShader = ('varying vec2 vNdc;\n' + shader.vertexShader).replace(
                '#include <project_vertex>',
                'gl_Position = vec4(position.xy, 0.9999, 1.0);\n    vNdc = position.xy;');
            // prepend the uniforms; replace the color write with the ground
            // shadow composite (the LINEAR-domain modulation, encoded by the
            // trailing colorspace_fragment like every other material).
            // §885 终一百四十八: the FRAGMENT must declare the vNdc varying
            // (the vertex writes it) and the cascade-1 samplers — their
            // absence failed this program wholesale (the quad was silently
            // absent from every recent measurement; revived here WITH
            // lit=1.0-outside-cascades semantics, 终一百四十七).
            shader.fragmentShader = ('varying vec2 vNdc;\n' +
                'uniform sampler2D uMBShadowMap;\n' +
                // §885 g58 (audit S10): mgl sampler2DShadow — hardware
                // GREATER compare with bilinear PCF (shadow_renderer.ts:298).
                // DECLARED ONLY in GLSL3/shadow2d mode: ES 1.00 has no
                // sampler2DShadow type, an unconditional declaration fails
                // every GLSL1 compile of this program.
                (shadow2dOn ? 'uniform mediump sampler2DShadow uMBShadowS0;\n' : '') +
                'uniform sampler2D uMBShadowMap1;\n' +
                'uniform mat4 uMBShadowMatrix1;\n' +
                'uniform mat4 uMBShadowMatrix;\n' +
                'uniform vec3 uMBGroundShadowFactor;\n' +
                'uniform float uMBShadowIntensity;\n' +
                'uniform float uMBShadowDbg;\n' +
                'uniform mat4 uMBInvProj;\n' +
                'uniform mat4 uMBCamWorld;\n' +
                'uniform float uMBGroundZ;\n' +
                'uniform float uMBShadowTexel;\n' +
                'uniform vec2 uMBFadeRange;\n' + shader.fragmentShader).replace(
                '#include <opaque_fragment>',
                `#include <opaque_fragment>
                {
                    // §885 终四十g50t: projection-generic ground ray — two-point
                    // unproject of the NDC through near/far. Perspective: the
                    // points sit on the same eye ray (identical intersection to
                    // the old near-dir form). Ortho: the ray is the parallel
                    // view axis through the shifted xy — the old dir-only form
                    // tilted every ray and misframed the whole shadow quad
                    // (ortho-camera 57,230 → 190,479 with shadows on).
                    vec4 va = uMBInvProj * vec4(vNdc, -1.0, 1.0);
                    vec4 vb = uMBInvProj * vec4(vNdc, 1.0, 1.0);
                    vec3 pa = mat3(uMBCamWorld) * (va.xyz / va.w);
                    vec3 pb = mat3(uMBCamWorld) * (vb.xyz / vb.w);
                    vec3 dir = normalize(pb - pa);
                    if (dir.z < -1e-6 && uMBShadowIntensity > 0.5) {
                        vec3 mbWP = pa + dir * ((uMBGroundZ - pa.z) / dir.z);
                        // §885 终二百二十一: mgl u_shadow_normal_offset —
                        // offset the receiver sample point along its normal
                        // (ground = z-up) by normalOffset meters; the lateral
                        // shift (offset/tan(elevation)) recovers street texels
                        // at wall bases (mgl shadow_renderer.ts:546, default
                        // normalOffset 3).
                        // §885 终四十九g51i: 10.0 (was bare 10 — an int literal
                        // assigned to a float component is a hard GLSL ES
                        // compile error; it killed every perspective ground
                        // quad program since the g50u-era normal-offset
                        // experiment landed — shadows-underpass 0:501).
                        // §885 g52r A/B: removing this lift (mgl
                        // ground_shadow has none) + plane-bias + 2x2 kernel
                        // REGRESSED shadows-tunnel +8.5k — the tunnel family
                        // leans on this overlay's calibrated darkness inside
                        // tunnel interiors; restored until the ceiling-face
                        // lighting lands.
                        mbWP.z += 10.0;
                        vec4 uv4 = uMBShadowMatrix * vec4(mbWP, 1.0);
                        vec4 uv4b = uMBShadowMatrix1 * vec4(mbWP, 1.0);
                        // §885 终四十g50u: mgl _prelude_shadow.fragment.glsl
                        // shadow_occlusion:42-68 — outside BOTH cascades
                        // returns occlusion 0.0 → lit=1. The historical
                        // lit=0.0 default (终一百四十七) shadowed everything
                        // beyond the tight shadow-frustum fit and turned the
                        // whole ortho deck dark (190,479 with shadows on).
                        float lit = 1.0;
                        float sampD = 1.004;
                        bool inC0 = uv4.x >= 0.0 && uv4.x <= 1.0 &&
                            uv4.y >= 0.0 && uv4.y <= 1.0 && uv4.z >= 0.0 && uv4.z <= 1.0;
                        bool inC1 = !inC0 && uv4b.x >= 0.0 && uv4b.x <= 1.0 &&
                            uv4b.y >= 0.0 && uv4b.y <= 1.0 && uv4b.z >= 0.0 && uv4b.z <= 1.0;
                        // §885 终二百一十九: 3x3 PCF (mgl hardware sampler
                        // bilinear-compare equivalent) + cascade-1
                        // view-depth fade (u_fade_range semantics).
                        // §885 g52r A/B: the mgl-literal plane-bias + 2x2
                        // bilinear-compare variant was tested (g52r) and
                        // REGRESSED shadows-tunnel +8.5k — the calibrated
                        // smoothstep window over the 3x3 window is the
                        // current best for this overlay approximation.
                        if (inC0 || inC1) {
                            float litSum = 0.0;
                            #ifdef MB_SH_SHADOW2D
                            // §885 g58 (audit S10): mgl single-tap hardware
                            // compare — sampler2DShadow GREATER with LINEAR
                            // filtering performs the bilinear PCF in the
                            // sampler (_prelude_shadow.fragment.glsl:33-40).
                            if (inC0) {
                                litSum = texture(uMBShadowS0, vec3(uv4.xy, uv4.z)) * 9.0;
                            } else {
                                for (int dy = -1; dy <= 1; dy++) {
                                    for (int dx = -1; dx <= 1; dx++) {
                                        vec2 off = vec2(float(dx), float(dy)) * uMBShadowTexel * 1.5;
                                        vec4 pk = texture2D(uMBShadowMap1, uv4b.xy + off);
                                        float sd = pk.r + pk.g / 255.0;
                                        litSum += smoothstep(-float(MB_SH_BIAS), float(MB_SH_BIAS), sd - uv4b.z);
                                    }
                                }
                            }
                            #else
                            for (int dy = -1; dy <= 1; dy++) {
                                for (int dx = -1; dx <= 1; dx++) {
                                    vec2 off = vec2(float(dx), float(dy)) * uMBShadowTexel * 1.5;
                                    float l = 0.0;
                                    if (inC0) {
                                        vec4 pk = texture2D(uMBShadowMap, uv4.xy + off);
                                        #ifdef MB_SH_HW
                                        float sd = pk.r;
                                        #else
                                        float sd = pk.r + pk.g / 255.0;
                                        #endif
                                        l = smoothstep(-float(MB_SH_BIAS), float(MB_SH_BIAS), sd - uv4.z);
                                    } else {
                                        vec4 pk = texture2D(uMBShadowMap1, uv4b.xy + off);
                                        float sd = pk.r + pk.g / 255.0;
                                        l = smoothstep(-float(MB_SH_BIAS), float(MB_SH_BIAS), sd - uv4b.z);
                                    }
                                    litSum += l;
                                }
                            }
                            #endif
                            lit = litSum / 9.0;
                            // cascade-1 view-depth fade: fade OUT occlusion
                            // (toward lit) across uMBFadeRange.
                            if (inC1) {
                                vec3 wp = (uMBCamWorld * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                                float viewDist = distance(mbWP, wp);
                                float fade = 1.0 - smoothstep(uMBFadeRange.x, uMBFadeRange.y, viewDist);
                                lit = mix(1.0, lit, fade);
                            }
                        }
                        // 终五十七: shadowdbg=6 quad uv readout — R=uv4.z
                        // (clamped), G=depth-overflow flag (uv4.z>1),
                        // B=uv.xy-in-bounds flag. Diagnoses which gate kills
                        // the ground cast-shadow pattern.
                        if (uMBShadowDbg > 1.5) {
                            gl_FragColor.rgb = vec3(
                                clamp(uv4.z, 0.0, 1.0),
                                uv4.z > 1.0 ? 1.0 : 0.0,
                                (uv4.x >= 0.0 && uv4.x <= 1.0 &&
                                 uv4.y >= 0.0 && uv4.y <= 1.0) ? 1.0 : 0.0);
                        } else if (MB_SHADOW_OVERLAY == 1) {
                            // §885 终一百三十八: OVERLAY blend — alpha = 1−F
                            // reproduces mgl's per-channel ground-factor
                            // multiply on the GROUND surface (junction family
                            // factor 0.49). Kept DARKER than the raw factor
                            // (the g52r pure-factor 0.562 variant regressed
                            // shadows-tunnel +8.5k: the tunnel interior's
                            // darkness is approximated by this overlay until
                            // the tunnel ceiling face lighting lands — mgl
                            // gets that darkness from apply_lighting on the
                            // ceiling faces, not from the ground quad).
                            float shadowAlpha = (1.0 - lit) * uMBShadowIntensity * 0.7;
                            gl_FragColor.rgb = vec3(0.0, 0.0, 0.0);
                            gl_FragColor.a = shadowAlpha;
                        } else {
                            // mgl shadowed_light_factor_plane_bias: occlusion
                            // is 1 when BLOCKED; our lit is 1 when unblocked —
                            // light = 1 - intensity * (1 - lit).
                            // §885 终一百四十二: shadowoverlay=0 A/B gate —
                            // multiply-underlay composite (pre-终一百四十一 form).
                            gl_FragColor.rgb *= mix(
                                pow(uMBGroundShadowFactor, vec3(1.0 / 2.2)), vec3(1.0),
                                1.0 - uMBShadowIntensity * (1.0 - lit));
                        }
                    }
                }`);
            this.m_groundUniforms = shader.uniforms;
            (mat as any).customProgramCacheKey = () =>
                'mbgroundquad-v3' + ((globalThis as any).__mbShadowHW ? '-hw' : '')
                + ((globalThis as any).__mbShadow2D === true ? '-s2d' : '');
        };
        const quad = new THREE.Mesh(geo, mat);
        // §885 终五十八: assignment was MISSING — the quad was built, added
        // to both scenes and compiled (onBeforeCompile set m_groundUniforms)
        // but m_groundQuad stayed null, so drawGroundQuad always early-
        // returned and the clearColor never reached the quad material.
        this.m_groundQuad = quad;
        quad.name = 'MBShadowGroundQuad';
        quad.frustumCulled = false;
        // §885 终三十二: the underlay channel (m_groundScene) is wiped by the
        // scene render — the quad ALSO rides m_scene at the lowest render
        // order (drawn before all models, after the background ground).
        // §885 终一百四十二: overlay mode rides ON TOP (999) instead.
        quad.renderOrder = (globalThis as any).__mbShadowOverlay !== false ? 999 : -2000;
        // §885 终二百一十五: overlay mode (renderOrder 999, on-top darkening)
        // draws through the AfterRender channel — the composer render path
        // drops engine-external scene meshes, so a quad parented to m_scene
        // silently vanished on effect-enabled fixtures (ground-shadow-fog:
        // shadow-on ≡ shadow-off pixel-identical). Underlay mode keeps the
        // m_scene parenting (it must draw BENEATH the tiles).
        const overlayMode = (globalThis as any).__mbShadowOverlay !== false;
        this.m_groundScene.add(quad);
        if (!overlayMode) {
            (this.m_mapView as any)?.m_scene?.add?.(quad);
        }
        this.m_groundUniforms = (mat as any).uniforms || null;
    }

    /** Unproject one NDC corner onto the ground plane (far clamp on sky). */
    private cornerOnGround(
        cam: THREE.PerspectiveCamera, camPos: THREE.Vector3,
        ndcX: number, ndcY: number, far: number, planeZ: number, out: THREE.Vector3,
    ): void {
        // Projection-generic unproject: NDC (z=-1 near / z=+1 far) → view →
        // world; the ray through the NDC point is (p1 − p0). For a perspective
        // camera both points sit on the same eye ray (identical result to the
        // old camPos-origin form); for an ORTHO projection the ray is the
        // parallel view axis through the shifted near-plane point — the
        // perspective form would tilt every ray toward the near-plane xy
        // offset and throw the ground corners far outside the viewport.
        const v0 = new THREE.Vector4(ndcX, ndcY, -1, 1)
            .applyMatrix4(cam.projectionMatrixInverse);
        const v1 = new THREE.Vector4(ndcX, ndcY, 1, 1)
            .applyMatrix4(cam.projectionMatrixInverse);
        const p0 = new THREE.Vector3(v0.x / v0.w, v0.y / v0.w, v0.z / v0.w)
            .applyMatrix4(cam.matrixWorld);
        const p1 = new THREE.Vector3(v1.x / v1.w, v1.y / v1.w, v1.z / v1.w)
            .applyMatrix4(cam.matrixWorld);
        const dir = p1.sub(p0).normalize();
        const t = dir.z < -1e-6 ? (planeZ - p0.z) / dir.z : far;
        out.copy(p0).addScaledVector(dir, Math.min(Math.abs(t), far));
        // §885 终二十: one-shot per-corner dump — dir/t/out vs camPos, to
        // locate the 2.00× ground-intersection offset (far clamp vs ray
        // direction vs unproject origin).
        if (!(globalThis as any).__mbCgDumped) {
            (globalThis as any).__mbCgDumped = true;
            // eslint-disable-next-line no-console
            console.log(`[MBCG] ndc=(${ndcX},${ndcY}) camPos=(${camPos.x.toFixed(1)},${camPos.y.toFixed(1)},${camPos.z.toFixed(1)}) dir=(${dir.x.toFixed(4)},${dir.y.toFixed(4)},${dir.z.toFixed(4)}) t=${t.toFixed(0)} clamp=${Math.min(Math.abs(t), far).toFixed(0)} far=${far.toFixed(0)} out=(${out.x.toFixed(1)},${out.y.toFixed(1)},${out.z.toFixed(1)})`);
        }
    }

    /** §643: underlay draw — the engine calls this from preSceneHook, before
     * the scene render (frame already cleared, autoClear stays false, so the
     * quad lies beneath all content). Uniforms were prepared by run() in
     * WillRender; a fresh style's first frame simply draws nothing. */
    private drawGroundQuad(renderer: THREE.WebGLRenderer): void {
        // §885 终五十八: invocation counter probe.
        {
            const gq = (globalThis as any);
            gq.__mbGqInvoked = (gq.__mbGqInvoked ?? 0) + 1;
            if (gq.__mbGqInvoked === 1 || gq.__mbGqInvoked % 300 === 0) {
                // eslint-disable-next-line no-console
                console.log(`[MBGQInvoke] n=${gq.__mbGqInvoked} enabled=${this.m_enabled} int=${this.m_intensity} quad=${!!this.m_groundQuad} u=${!!this.m_groundUniforms} ortho=${this.m_orthoStyle} id=${(this as any).__mbId ?? '?'} draws=${gq.__mbGQDraws ?? 0}`);
            }
        }
        if (!this.m_enabled || this.m_intensity <= 0) return;
        if (!this.m_groundQuad) return;
        // §885 终四十一g50v: under ORTHOGRAPHIC camera-projection the quad's
        // ground-plane pattern is misframed (darkens the whole deck; the
        // per-material receivers carry the correct bands instead) — skip.
        // groundquadoff=1 disables it in every projection for A/B.
        if ((globalThis as any).__mbGroundQuadOff) return;
        if (this.m_orthoStyle) return;
        // §885 终四十g50u: groundquadoff=1 → kill the quad channel. mgl
        // background.fragment.glsl has NO shadow sampling (background never
        // receives cast-shadows; only fill/line/circle/symbol/extrusion do),
        // so the full-screen quad multiply darkening the background is
        // un-mgl (ortho-camera background rendered ×0.823 shadow factor,
        // expected plain radiance). Per-material receivers stay live.
        if ((globalThis as any).__mbGroundQuadOff) return;
        // §885 终四十g50t: ortho bail removed — the ground quad is a screen-
        // space full-frame draw (fullscreen OrthographicCamera) and the
        // corner math in prepGroundQuad/cornerOnGround is now projection-
        // generic; mgl renders ground cast-shadows under ortho.
        // orthogroundquadoff=1 restores the skip for A/B.
        // 终五十八: no m_groundUniforms requirement — MeshBasicMaterial has
        // no .uniforms, so m_groundUniforms is only set INSIDE
        // onBeforeCompile (first render). Gating the draw on it deadlocked:
        // the quad never rendered → never compiled → uniforms never created
        // → getShadowUniforms() stayed null → the whole fill-receiver family
        // stayed at intensity 0 (the missing ground cast-shadow pattern).
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

    /**
     * §885 终三十九g50f: CPU-rasterized analytic ground-shadow mask.
     * Every caster vertex v casts to ground = v + t·lightDir with
     * t = (groundZ − v.z)/lightDir.z (>0); the caster's shadow footprint is
     * the convex hull of {v, shadow(v)} projected through m_matrix. White
     * background (lit), black hulls (shadowed) — receivers sample .r
     * directly as the lit factor. Rebuilt every ~120 frames (fixtures are
     * static; the first frames matter for the idle-poke windows).
     */
    private buildAnalyticMask(eye: THREE.Vector3, size: number): void {
        const dirRaw = (this as any).__mbShLightDir as THREE.Vector3 | undefined;
        // §885 终三十九g50g fix: ls.dir points TOWARD the light (z>0,
        // NdotL convention) — the light TRAVEL direction is its negation.
        const dir = dirRaw ? (dirRaw.z < 0 ? dirRaw : dirRaw.clone().negate()) : undefined;
        if (!dir || dir.z >= -1e-4) return;
        const tick = ((this as any).__mbAnaTick = ((this as any).__mbAnaTick ?? 0) + 1);
        if (this.m_analyticTex && tick % 120 !== 1) return;
        const groundZ = -eye.z;
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        const v = new THREE.Vector3();
        const u4 = new THREE.Vector4();
        let meshN = 0;
        for (const obj of shadowCasters) {
            obj.updateWorldMatrix?.(true, false);
            obj.traverse((o: any) => {
                const g = o.geometry;
                const pos = g?.attributes?.position;
                if (!pos) return;
                meshN++;
                const stride = Math.max(1, Math.floor(pos.count / 4000));
                const pv: [number, number][] = [];
                for (let i = 0; i < pos.count; i += stride) {
                    v.set(pos.array[3 * i], pos.array[3 * i + 1], pos.array[3 * i + 2])
                        .applyMatrix4(o.matrixWorld);
                    pv.push(...this.analyticProject(v, dir, groundZ, u4, size));
                    const t = (groundZ - v.z) / dir.z;
                    if (t > 0) {
                        v.x += t * dir.x; v.y += t * dir.y; v.z = groundZ;
                        pv.push(...this.analyticProject(v, dir, groundZ, u4, size));
                    }
                }
                if (pv.length < 3) return;
                const hull = mbConvexHull(pv);
                if (hull.length < 3) return;
                ctx.beginPath();
                hull.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
                ctx.closePath();
                ctx.fill();
            });
        }
        const img = ctx.getImageData(0, 0, size, size);
        const tex = new THREE.DataTexture(
            new Uint8Array(img.data), size, size, THREE.RGBAFormat);
        tex.magFilter = THREE.LinearFilter;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        tex.flipY = false;
        tex.needsUpdate = true;
        this.m_shTex = tex;
        this.m_shTex1 = null;
        (globalThis as any).__mbShadowAnalyticOn = 1;
        (globalThis as any).__mbShadowAnalyticInfo = { meshes: meshN, groundZ: +groundZ.toFixed(2) };
    }

    /** world point → m_matrix uv → canvas pixels (GL orientation, y flipped). */
    private analyticProject(
        v: THREE.Vector3, _dir: THREE.Vector3, _groundZ: number,
        u4: THREE.Vector4, size: number): [number, number][] {
        u4.set(v.x, v.y, v.z, 1).applyMatrix4(this.m_matrix);
        if (!Number.isFinite(u4.w) || Math.abs(u4.w) < 1e-9) return [];
        return [[(u4.x / u4.w) * size, (1 - u4.y / u4.w) * size]];
    }

    private prepGroundQuad(center: THREE.Vector3, radius: number, eye: THREE.Vector3): void {
        this.ensureGroundQuad();
        // 终五十八: m_groundUniforms appears only after the quad's first
        // compile — skip the uniform WRITES until then (the draw itself no
        // longer depends on it, see drawGroundQuad).
        if (!this.m_groundUniforms) return;
        // 终五十八: pinpoint which uniform key the stash is missing.
        {
            const need = ['uMBInvProj', 'uMBCamWorld', 'uMBGroundZ', 'uMBShadowMap',
                'uMBShadowMatrix', 'uMBShadowIntensity', 'uMBGroundShadowFactor'];
            const missing = need.filter((k) => !(this.m_groundUniforms as any)[k]);
            if (missing.length) {
                // eslint-disable-next-line no-console
                console.log('[MBGQPrep] missing uniforms: ' + missing.join(',') +
                    ' have=' + Object.keys(this.m_groundUniforms).join(','));
                return;
            }
        }
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
        this.m_eye.copy(eye);
        const corners = this.m_corners;
        // §885 终九十七: the rteCam's projectionMatrixInverse is stale (its
        // projection matrix is copied from the logical camera without
        // recomputing the inverse) — recompute so cornerOnGround's unproject
        // produces 4 DISTINCT ground corners.
        cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
        const far = radius * 8;
        const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
        this.cornerOnGround(cam, camPos, -1, -1, far, groundZ, corners[0]);
        this.cornerOnGround(cam, camPos, 1, -1, far, groundZ, corners[1]);
        this.cornerOnGround(cam, camPos, 1, 1, far, groundZ, corners[2]);
        this.cornerOnGround(cam, camPos, -1, 1, far, groundZ, corners[3]);
        // §885 终五十八: cornerOnGround uses the rteCamera, which sits at the
        // RTE-frame ORIGIN — the corners come out RTE-RELATIVE. The fill
        // receivers reconstruct `mbWP` from them and sample with
        // `mbWP − uMBEye`, so the corners must be ABSOLUTE (RTE + eye);
        // otherwise uv lands far outside the map and every fragment reads
        // lit=1 — the never-diagnosed "no ground cast-shadow pattern".
        // (终十九 removed this add because it leaked into a different
        // channel's varying sky-gate; that channel no longer uses corners.)
        for (const c of corners) c.add(eye);
        this.m_groundUniforms.uMBShadowMap.value = this.m_shTex;
        this.m_groundUniforms.uMBShadowMatrix.value.copy(this.m_matrix);
        this.m_groundUniforms.uMBShadowIntensity.value = this.m_intensity;
        // §885 终一百三十: cascade-1 uniforms — refreshed per frame.
        this.m_groundUniforms.uMBShadowMap1 = { value: this.m_shTex1 };
        this.m_groundUniforms.uMBShadowMatrix1 = { value: this.m_matrix1.clone() };

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
            // §885 终三十二: the MeshBasic quad's material color = the map
            // background; the injected shadow composite modulates it.
            // 终五十八: the old uMBGroundColor uniform write here threw
            // (key never existed in the MeshBasic stash) and killed the
            // whole AfterRender listener from frame ~6 on.
            if (this.m_groundQuad) {
                // §885 终六十六: SHDIAG=3 → magenta base — proves which
                // ground pixels belong to the quad.
                const mag = (globalThis as any).__mbShadowDiag === '3';
                (this.m_groundQuad.material as THREE.MeshBasicMaterial)
                    .color.setHex(mag ? 0xff00ff : clear);
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
        // §885 终四十g50t: ortho bail removed — the depth pass frames the
        // light-space camera (world-space matrices, projection-independent),
        // and caster placement is RTE-frame world geometry. mgl casts
        // shadows under ortho camera-projection. orthodepthoff=1 restores.
        if ((globalThis as any).__mbOrthoDepthOff) return;
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
        // §885 终三十九g30: depth-pass caster census (decodedbg gated).
        if (typeof globalThis !== 'undefined' && (globalThis as any).__mbDecodeDbg
            && ((this as any)._castLogN ?? ((this as any)._castLogN = 0)) < 3) {
            (this as any)._castLogN = ((this as any)._castLogN ?? 0) + 1;
            // eslint-disable-next-line no-console
            console.log(`[MBShadowCast] casters=${shadowCasters.size} enabled=${this.m_enabled} intensity=${this.m_intensity} ortho=${this.m_orthoStyle}`);
        }
        // §885 终五: meshes instantiated AFTER the group registered (async
        // placement clones) miss the layer-1 enable done at build time and
        // silently drop out of the depth pass (3 of 8 landmark meshes).
        // Refresh every frame — enable is idempotent and cheap.
        // §885 终五十七g51p: selective layers — meshes WITHOUT a normal
        // attribute render the DoubleSide layer-2 pass (their winding is
        // arbitrary, FrontSide drops ~half the triangles); normal-having
        // meshes stay on layer 1. Main render is layer 0 for both.
        for (const obj of shadowCasters) {
            obj.traverse((o: any) => {
                if (!o.isMesh) return;
                if (o.geometry?.attributes?.normal) {
                    o.layers.enable(1);
                    o.layers.disable(2);
                } else {
                    o.layers.enable(2);
                    o.layers.disable(1);
                }
            });
        }

        // §885 终三十九g50e (ledger g50 step②): depth-pass caster frame
        // audit — dump each caster's matrixWorld translation + world AABB
        // AT DEPTH-PASS TIME. Answers the frame question with numbers: are
        // casters placed near the RTE origin (where the shadow camera and
        // the receivers sample) or at absolute world coords (~1e7, where
        // the ortho fit + float32 vertex precision both break)? Gate:
        // shcastaudit=1.
        if ((globalThis as any).__mbShCastAudit
            && ((this as any).__mbCastAuditN ?? 0) < 3) {
            (this as any).__mbCastAuditN = ((this as any).__mbCastAuditN ?? 0) + 1;
            const rows: any[] = [];
            for (const obj of shadowCasters) {
                obj.updateWorldMatrix?.(true, false);
                const p = new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld);
                const b = new THREE.Box3().setFromObject(obj);
                rows.push({
                    type: (obj as any).type, kids: obj.children.length,
                    pos: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)],
                    min: b.isEmpty() ? null : [+b.min.x.toFixed(2), +b.min.y.toFixed(2), +b.min.z.toFixed(2)],
                    max: b.isEmpty() ? null : [+b.max.x.toFixed(2), +b.max.y.toFixed(2), +b.max.z.toFixed(2)],
                    posArr: +(obj as any).position?.x?.toFixed(2),
                    matAuto: (obj as any).matrixAutoUpdate,
                });
                if (rows.length >= 8) break;
            }
            const rteA = (this.m_mapView as any).getRteCamera?.();
            // eslint-disable-next-line no-console
            console.log('[MBCastAudit] n=' + (this as any).__mbCastAuditN
                + ' casters=' + shadowCasters.size
                + ' rteEye=' + (rteA ? Array.from(rteA.position.toArray()).map((x: number) => +x.toFixed(2)).join(',') : 'none')
                + ' ' + JSON.stringify(rows));
            (globalThis as any).__mbShCastAuditData = rows;
        }

        // §530: independent WebGL CONTEXT for the depth pass. Rendering into
        // an RT of the main context — even just bind+clear — deterministically
        // darkens the subsequent main render on SwiftShader (§522–§529
        // exclusion matrix; resetState negative). A second renderer keeps the
        // main context untouched; its canvas flows back as a CanvasTexture
        // (4 MB upload per frame, test-environment acceptable).
        const size = mbShadowRes();
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
                (this as any).__mbShDbgEye = [eye.x, eye.y, eye.z].map((x2: number) => +x2.toFixed(1));
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
        // §885 终六十四: shadow-direction conversion A/B. §885 终五十g51j:
        // DEFAULT = the raw mgl spherical conversion (az+90, no §686
        // render-frame y mirror) — the mirrored §683 lighting3DState.dir
        // inverted the shadow of tall casters (elevated-symbols-lighting's
        // 200m shadow-casters extrusion landed its whole-scene shadow in the
        // map corner AWAY from the deck: 182,862 mismatched; shaz=180 →
        // 63,972; shdiralt raw → 73,184) and rotations cannot repair a
        // mirror — only the exact az=180 case coincides. The mirror remains
        // reachable via shdiralt=0. A/B (g51j): lighting −110k, tunnels
        // +4.4k, junction/road-extend unchanged.
        if ((globalThis as any).__mbShadowDirAlt === undefined
            || (globalThis as any).__mbShadowDirAlt === 1
            || (globalThis as any).__mbShadowDirAlt === true) {
            const dirProp2 = (this.m_dataSource as any).m_environment
                ?.m_3DDirectional?.direction as [number, number] | undefined;
            if (dirProp2) {
                const a2 = (dirProp2[0] + 90) * Math.PI / 180;
                const p2 = dirProp2[1] * Math.PI / 180;
                lightDir = new THREE.Vector3(
                    Math.cos(a2) * Math.sin(p2), Math.sin(a2) * Math.sin(p2), Math.cos(p2));
            } else if (lightDir) {
                // §885 终二六七: no raw dirProp on this style — emulate the
                // raw form from ls.dir (y mirror of the §683 frame).
                lightDir = new THREE.Vector3(lightDir.x, -lightDir.y, lightDir.z);
            }
        }
        // §885 终二六七: shdiralt=2 → tosun light axis (−x,−y of ls.dir) —
        // the direction that provably matches the 终二六六 tosun shading for
        // cast-shadow styles; the shadow CAMERA may need the same convention.
        if ((globalThis as any).__mbShadowDirAlt === 2 && lightDir) {
            lightDir = new THREE.Vector3(-lightDir.x, -lightDir.y, lightDir.z);
        }
        // §885 终二六八: shaz=<deg> → rotate the shadow light axis around
        // world Z — receivers proved LIVE (uv follows the shadow camera), so
        // the per-degree sweep argmin centers the scene in the map and
        // calibrates the shadow-camera azimuth convention in one batch.
        {
            // §885 终三十九g50e (ledger g50 step②): shkappa=<k> → scale the
        // shadow light axis's horizontal components. The scene frame is
        // anisotropic (1 horizontal unit = cos(lat) ground meters, Munich
        // ≈0.669) while ls.dir's meter-frame geometry projects shadows κ
        // times too long when sampled in scene units (g49: lit wedge
        // over-blacked, thin-plate offsets). k=cos(lat) shortens, 1/cos(lat)
        // lengthens — A/B decides the sign.
        {
            const sk = Number((globalThis as any).__mbShadowKappa ?? 1);
            if (Number.isFinite(sk) && sk !== 1 && lightDir) {
                lightDir = new THREE.Vector3(
                    lightDir.x * sk, lightDir.y * sk, lightDir.z).normalize();
            }
        }
        // §885 终二七二: under shbfix the shadow light axis carries a
            // fixed +90° world-Z rotation (empirically centers the scene in
            // the light frustum: fragZ 0.47-0.79 mid-range) plus the sweep
            // delta. Legacy path stays unrotated.
            const shAz = ((globalThis as any).__mbShadowBiasFix === 1 ? 90 : 0)
                + Number((globalThis as any).__mbShadowAzDelta ?? 0);
            if (shAz && lightDir) {
                const aR = shAz * Math.PI / 180;
                const cR = Math.cos(aR), sR = Math.sin(aR);
                lightDir = new THREE.Vector3(
                    lightDir.x * cR - lightDir.y * sR,
                    lightDir.x * sR + lightDir.y * cR,
                    lightDir.z);
            }
        }

        // §560: frame the ortho around the CASTERS' union AABB (worldCenter
        // sits at the camera target, but tiles can be a km+ away — a
        // targetDistance-sized box missed them entirely).
        const casterBox = new THREE.Box3();
        for (const obj of shadowCasters) {
            obj.updateWorldMatrix?.(true, false);
            const b = new THREE.Box3().setFromObject(obj);
            if (!b.isEmpty()) { casterBox.union(b); }
        }
        // §885 终五十五: mgl shadow_renderer.createLightMatrix exact port —
        // the light camera frames the VIEW-FRUSTUM bounding sphere
        // (rotation-invariant), NOT the caster AABB: the caster-AABB fit's
        // depth-map uv coverage landed the quad's dark region where the depth
        // map has content instead of where expected's cast shadow falls
        // (终五十四). mgl: k = sqrt(1+aspect²)·tan(fovX/2); sphere radius per
        // the lxjk minimal-frustum-sphere formula; sphere center at camera
        // space (0,0,−centerDepth); ortho extent = sphere radius; near = −2r,
        // far = r/dir.z. Cascade semantics: receivers inside cascade-0 bounds
        // sample cascade 0 exclusively (shadow_occlusion), so a single map
        // with cascade-0's extent (far = 1.5×cameraToCenterDistance) matches
        // mgl for every in-bounds fragment.
        // shadowDirectionFromProperties: polar clamped to 75°.
        {
            // §885 终二百二十三: feed the depth-pass normal-offset uniforms.
        const depthMat = (this.m_depthMaterial as THREE.ShaderMaterial);
        // §885 终三十九g50f: the analytic ground-shadow mask needs the final
        // (post κ/shaz/clamp) light axis — store it for buildAnalyticMask.
        (this as any).__mbShLightDir = lightDir.clone();
        if (depthMat.uniforms?.uMBLightDir) {
            depthMat.uniforms.uMBLightDir.value.copy(lightDir).normalize();
        }
        // §885 终四十九g51f: shcastnormal=<v> → restore a CASTER-side normal
        // offset for A/B (default 0 — mgl-faithful; see the uniform comment).
        if (depthMat.uniforms?.uMBNormalOffset) {
            const cn = (globalThis as any).__mbShCastNormal;
            if (Number.isFinite(cn)) depthMat.uniforms.uMBNormalOffset.value = cn;
        }
        const maxPolar = 75 * Math.PI / 180;
            const pol = Math.acos(THREE.MathUtils.clamp(lightDir.z, -1, 1));
            if (pol > maxPolar) {
                const hc = Math.sin(maxPolar);
                const h = Math.hypot(lightDir.x, lightDir.y) || 1e-9;
                lightDir.set(lightDir.x / h * hc, lightDir.y / h * hc, Math.cos(maxPolar));
            }
        }
        const aspect = (camera.aspect && camera.aspect > 0) ? camera.aspect : 1;
        const fovX = 2 * Math.atan(Math.tan((camera.fov * Math.PI / 180) / 2) * aspect);
        const k = Math.sqrt(1 + aspect * aspect) * Math.tan(fovX / 2);
        const k2 = k * k;
        // Our world units equal mgl's camera-space pixel units (targetDistance
        // == cameraToCenterDistance, §872j4 readout).
        const ctcd = Math.max(1, (this.m_mapView as any).targetDistance ?? camera.position.length());
        const frNear = ((this.m_mapView as any).canvas?.clientHeight ?? 600) / 50;
        const frFar = ctcd * 1.5;
        let centerDepth: number;
        let radius: number;
        if (k2 > (frFar - frNear) / (frFar + frNear)) {
            centerDepth = frFar;
            radius = frFar * k;
        } else {
            centerDepth = 0.5 * (frFar + frNear) * (1 + k2);
            radius = 0.5 * Math.sqrt(
                (frFar - frNear) * (frFar - frNear) +
                2 * (frFar * frFar + frNear * frNear) * k2 +
                (frFar + frNear) * (frFar + frNear) * k2 * k2);
        }
        // roundingMarginFactor (resolution / (resolution − 1)) — sub-texel
        // roundingMarginFactor (resolution / (resolution − 1)) — sub-texel
        // padding against edge clipping; shadow map resolution per shres knob.
        radius *= size / (size - 1);
        // §885 终九十五: frustum-sphere fit under-covers the caster extents —
        // on a square viewport (aspect 1) k shrinks and casters clip at the
        // ortho edge (truncated ground shadows). A/B gate: shrad=<f>.
        {
            const rf = Number((globalThis as any).__mbShadowRad ?? 1);
            radius *= rf;
        }
        const rteCam2 = (this.m_mapView as any).getRteCamera?.() as THREE.PerspectiveCamera | undefined;
        const rcam = (rteCam2 ?? camera);
        rcam.updateMatrixWorld();
        // Sphere center = camera-space (0,0,−centerDepth) → the RTE camera
        // sits at the scene-frame origin, so the center is forward·depth.
        const sphereCenter = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(rcam.getWorldQuaternion(new THREE.Quaternion()))
            .multiplyScalar(centerDepth);
        // §885 终三一一: shmcenter=1 → mgl mercator-frame sphere-center
        // placement. The engine scene frame is EQUIRECTANGULAR (horizontal
        // unit = cos(lat)·vertical meter — probe-measured: 1000 scene units
        // E→W = 668.8 ground m at Munich) while mgl's mercator frame is
        // CONFORMAL; the isotropic forward·depth center therefore misplaces
        // the whole light frustum by κ = mercZ-per-meter / mercX-per-unit
        // ≈ 1/cos(lat) ≈ 1.499 (museum ±44/±45 symmetric misalignment
        // signature). mgl: center = camPos + R_main·(0,0,−m/worldSize) in
        // mercator (getCameraToWorldMercator = [R|pos]); mapped back through
        // the frame affine the scene offset ∝ (f.x, f.y, κ·f.z).
        if ((globalThis as any).__mbShMercCenter) {
            try {
                const prC: any = (this.m_mapView as any).projection;
                const gcC: any = (this.m_mapView as any).geoCenter;
                if (prC && gcC) {
                    const mercX = (lng: number) => lng / 360 + 0.5;
                    const eC = prC.projectPoint(gcC, { x: 0, y: 0, z: 0 });
                    const gC: any = prC.unprojectPoint({
                        x: (eC as any).x + 1000, y: (eC as any).y, z: (eC as any).z,
                    });
                    const fxC = Math.abs(mercX(gC.longitude) - mercX(gcC.longitude)) / 1000;
                    const fzC = 1 / (40075016.686 * Math.cos(gcC.latitude * Math.PI / 180));
                    const kappa = fzC / fxC;
                    const fwd = new THREE.Vector3(0, 0, -1)
                        .applyQuaternion(rcam.getWorldQuaternion(new THREE.Quaternion()));
                    const den = Math.sqrt(fwd.x * fwd.x + fwd.y * fwd.y + kappa * kappa * fwd.z * fwd.z);
                    sphereCenter.set(
                        centerDepth * fwd.x / den,
                        centerDepth * fwd.y / den,
                        centerDepth * kappa * fwd.z / den,
                    );
                    (this as any).__mbShKappa = +kappa.toFixed(4);
                }
            } catch (e) {
                (globalThis as any).__mbShMercCenterErr = String(e);
            }
        }
        // §885 g52z: shadowkappa — scale the light ortho X window by
        // 1/cos(lat): the engine scene frame's E-W unit is cos(lat) ground m
        // while N-S/vertical are 1:1, so an isotropic ±radius window covers
        // 1/cos(lat)× more ground in x — the shadow pattern compresses
        // horizontally vs mgl's conformal-px frame. shadowkappa=<f> A/B.
        const shadowKappa = Number((globalThis as any).__mbShadowKappa ?? 1);
        this.m_shadowCamera.left = -radius * shadowKappa;
        this.m_shadowCamera.right = radius * shadowKappa;
        this.m_shadowCamera.top = radius;
        this.m_shadowCamera.bottom = -radius;
        this.m_shadowCamera.near = -2 * radius;
        this.m_shadowCamera.far = radius / Math.max(lightDir.z, 0.1);
        // §885 终三十九g49: auto depth-compare bias, ramped by the caster
        // box's z span. The 16-bit packed light-depth quantum is
        // (far−near)/65536 — the legacy 0.0002 bias is ~1/100 of one quantum
        // at this fixture's range, so every elevated surface self-shadowed
        // (acne). Flat-deck fixtures (span ≤ ~40 m) must keep the legacy bias
        // (a large one erases their legit thin shadows — shadows-tunnel
        // +39k at a flat 0.2); tall-occluder fixtures (the 200m
        // shadow-casters wall, span 272-318) need ~0.12-0.2. The ramp
        // (span−100)/range interpolates: 0 below 100 m of span, ~0.124 at
        // the wall. The manual shadowbias knob still overrides.
        // §885 终三十九g50b: stored on the renderer (not a global) and read
        // LIVE per frame — the receiver bias is now a uniform (baked-at-
        // injection defines raced the first fit nondeterministically).
        if (!casterBox.isEmpty()) {
const range = this.m_shadowCamera.far - this.m_shadowCamera.near;
            const spanZ = casterBox.max.z - casterBox.min.z;
            this.m_biasAuto = Math.max(
                0.002, Math.min(0.3, (spanZ - 100) / range));
            // The injection-time bake (MB_SH_BIAS define) reads the global —
            // keep it fed (the live uMBShadowBiasW uniform supersedes it for
            // already-compiled materials).
            (globalThis as any).__mbShadowBiasAuto = this.m_biasAuto;

            // §885 终四十二g50w: mgl u_shadow_normal_offset port
            // (shadow_renderer.ts:530-546 + _prelude_shadow.vertex.glsl:6-14).
            // Fill receivers displace the sample point along world-up by
            // h = texelInTileCoords · radius · scale · dotScale so a coplanar
            // surface samples IN FRONT of its own stored depth (acne fix).
            // texelInTileCoords = 2/tileSize·EXTENT/res = 0.03125 (tile coords
            // per shadow texel); scale = 1.0 (vector-tile) ·
            // lerpClamp(zoom, 22→0.125, 0→4); dotScale = (1−NdotL)/2+0.5 with
            // NdotL = shadow-direction z (surface normal = up).
            const lsN = (this.m_dataSource as any).m_environment?.lighting3DState;
            const ndl = Math.min(Math.max(lsN ? lsN.dir[2] : 0, 0), 1);
            const dotScale = (1 - ndl) * 0.5 + 0.5;
            const mbZoom = Math.max(0, (this.m_mapView?.zoomLevel ?? 20) - 1);
            const tC = Math.min(1, Math.max(0, (22 - mbZoom) / 22));
            const offScale = 0.125 + (4 - 0.125) * tC;
            // The ortho fit half-extent = m_shadowCamera.right (world units =
            // meters here). h = 0.03125·radius·scale·dotScale meters —
            // texelScale(2/512·8192/1024)·radius(tile)·scale·dotScale·
            // tileInMeters collapses to this in world meters. Guard against
            // non-finite inputs poisoning the receivers.
            const h = 0.03125 * this.m_shadowCamera.right * offScale * dotScale;
            this.m_normalOffsetZ = Number.isFinite(h) ? h : 0;
            // §885 g56: mgl lerpClamp(zoom, 22, 0, 0.125, 4) — same ramp the
            // z-only port used (offScale), shared by both cascades.
            this.m_noffLerpClamp = Number.isFinite(offScale) ? offScale : 1;
            this.m_normalOffsetRR = Number.isFinite((this as any).__mbCascade1HalfExtent)
                ? (this as any).__mbCascade1HalfExtent : this.m_shadowCamera.right;
        }        // §885 终七十二: shoff=<x>,<y> — world-XY calibration offset of the
        // shadow sphere center (dark-centroid A/B against expected).
        {
            const off = String((globalThis as any).__mbShadowOff ?? '');
            if (off) {
                const parts = off.split(',').map(Number);
                if (parts.length === 2 && parts.every(Number.isFinite)) {
                    const right = new THREE.Vector3(1, 0, 0)
                        .applyQuaternion(rcam.getWorldQuaternion(new THREE.Quaternion()));
                    right.z = 0;
                    right.normalize();
                    const fwd = new THREE.Vector3(0, 1, 0)
                        .applyQuaternion(rcam.getWorldQuaternion(new THREE.Quaternion()));
                    fwd.z = 0;
                    fwd.normalize();
                    sphereCenter.addScaledVector(right, parts[0]);
                    sphereCenter.addScaledVector(fwd, parts[1]);
                }
            }
        }
        // §885 终二八二: shbfix=1 → center the ortho on the CASTER BOX
        // center (world-frame) instead of the view-frustum-sphere center —
        // the empirical ~130-unit systematic offset between receiver uv and
        // map content vanishes when both use the same reference.
        if ((globalThis as any).__mbShadowBiasFix && !casterBox.isEmpty()) {
            const c2 = casterBox.getCenter(new THREE.Vector3());
            sphereCenter.copy(c2);
            const sz = casterBox.getSize(new THREE.Vector3());
            const rr = 0.6 * Math.max(sz.x, sz.y, sz.z);
            (this as any).__mbCascade1HalfExtent = rr;
            this.m_shadowCamera.left = -rr; this.m_shadowCamera.right = rr;
            this.m_shadowCamera.top = rr; this.m_shadowCamera.bottom = -rr;
            this.m_shadowCamera.near = -2 * rr;
            this.m_shadowCamera.far = 2 * rr / Math.max(lightDir.z, 0.1);
            this.m_shadowCamera.updateProjectionMatrix();
        }
        // §885 终三一四: sharref=1 → FULL-FRAME mgl createLightMatrix port
        // (ArRef.ts wired): light camera built END-TO-END in the mgl MERCATOR
        // frame — CtW(pose)·(0,0,−centerDepth/worldSize) sphere center,
        // compass light camera (FreeCamera.setPitchBearing semantics),
        // getWorldToCamera (y-row flip + ppm z-column), ortho near =
        // min(−2·mZ17·worldSize, −2R). The scene↔mercator affine A
        // (probe-priced: h merc/unit horizontal, v merc/m vertical, y
        // NEGATED — scene y=north vs mercator y=south; translation = eye
        // mercator) folds into the depth-pass camera so receivers keep
        // sampling scene coords: m_matrix = bias·P·V·A. sphereCenter becomes
        // the SCENE-frame image of the mercator center (A⁻¹·centerWorld) so
        // the shtexsnap and downstream probes stay reference-consistent.
        // Default OFF — the calibrated scene-frame path is untouched.
        let arrefPose: {
            position: [number, number, number]; pitch: number; bearing: number;
        } | null = null;
        let arrefFrame: { h: number; v: number; eyeMerc: number[]; worldSize: number; ppm: number } | null = null;
        if ((globalThis as any).__mbShArRef) {
            try {
                const mvA: any = this.m_mapView;
                const prA = mvA?.projection;
                const gcA = mvA?.geoCenter;
                const rcA = mvA?.getRteCamera?.() ?? camera;
                if (prA && gcA && rcA) {
                    const C = 40075016.686;
                    const mercX = (lng: number) => lng / 360 + 0.5;
                    const mercY = (lat: number) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
                    const mercZ = (alt: number, lat: number) => alt / (C * Math.cos(lat * Math.PI / 180));
                    const eA: any = prA.projectPoint(gcA, { x: 0, y: 0, z: 0 });
                    const gE: any = prA.unprojectPoint({ x: eA.x + 1000, y: eA.y, z: eA.z });
                    const hA = Math.abs(mercX(gE.longitude) - mercX(gcA.longitude)) / 1000;
                    const vA = 1 / (C * Math.cos(gcA.latitude * Math.PI / 180));
                    const fwdA = new THREE.Vector3(0, 0, -1)
                        .applyQuaternion(rcA.getWorldQuaternion(new THREE.Quaternion()));
                    // §885 终三一四补: the affine translation = mercator of
                    // the RTE ORIGIN (= the true EYE). projectPoint/
                    // unprojectPoint are SW-anchored WORLD conversions and
                    // worldCenter is world-frame too (measured: worldCenter ≈
                    // projectPoint(gc), NOT an RTE offset). The eye sits
                    // behind/above the view center by forward·ctcd — the SAME
                    // camera-space convention mgl's sphere center uses — so
                    // eye_merc = mglMerc(gc) − S·(forward·ctcd).
                    const ctcdA = Math.max(1, mvA.targetDistance ?? 500);
                    const gcMerc = [mercX(gcA.longitude), mercY(gcA.latitude), mercZ(gcA.altitude ?? 0, gcA.latitude)];
                    const eyeMerc = [
                        gcMerc[0] - hA * fwdA.x * ctcdA,
                        gcMerc[1] + hA * fwdA.y * ctcdA,
                        gcMerc[2] - vA * fwdA.z * ctcdA,
                    ];
                    const fM = [fwdA.x, -fwdA.y, fwdA.z];
                    const pitchM = Math.atan2(Math.hypot(fM[0], fM[1]), -fM[2]);
                    const bearM = Math.atan2(-fM[0], -fM[1]);
                    const wsA = 512 * Math.pow(2, mvA.zoomLevel ?? 17);
                    const ppmA = wsA / (C * Math.cos(gcA.latitude * Math.PI / 180));
                    arrefPose = { position: eyeMerc as [number, number, number], pitch: pitchM, bearing: bearM };
                    arrefFrame = { h: hA, v: vA, eyeMerc, worldSize: wsA, ppm: ppmA };
                    (this as any).__mbShArRefPose = { pitchM, bearM, h: hA, v: vA, eyeMerc, worldSize: wsA };
                }
            } catch (e) {
                (globalThis as any).__mbShArRefErr = String(e);
                arrefPose = null;
                arrefFrame = null;
            }
        }
        // Apply an mgl mercator-frame light camera for the given (already
        // mercator-frame) direction; returns via sphereOut the SCENE image of
        // the mercator sphere center (the snap/probe reference).
        const arrefApplyCamera = (dirMerc: THREE.Vector3, sphereOut: THREE.Vector3): boolean => {
            if (!arrefPose || !arrefFrame) return false;
            const lf = mglLightFrameRef({
                pose: arrefPose,
                dirMerc: [dirMerc.x, dirMerc.y, dirMerc.z],
                centerDepth,
                worldSize: arrefFrame.worldSize,
                ppm: arrefFrame.ppm,
                mercatorZ17: Math.pow(2, -17),
                radiusPx: radius,
                resolution: size,
            });
            const A = new THREE.Matrix4().set(
                arrefFrame.h, 0, 0, arrefFrame.eyeMerc[0],
                0, -arrefFrame.h, 0, arrefFrame.eyeMerc[1],
                0, 0, arrefFrame.v, arrefFrame.eyeMerc[2],
                0, 0, 0, 1);
            const Vscene = new THREE.Matrix4().fromArray(lf.view).multiply(A);
            const cam3 = this.m_shadowCamera;
            cam3.matrixAutoUpdate = false;
            cam3.matrixWorld.copy(Vscene).invert();
            cam3.matrixWorldInverse.copy(Vscene);
            cam3.matrixWorldNeedsUpdate = true;
            cam3.projectionMatrix.fromArray(lf.proj);
            cam3.projectionMatrixInverse.copy(cam3.projectionMatrix).invert();
            cam3.left = -lf.R; cam3.right = lf.R; cam3.top = lf.R; cam3.bottom = -lf.R;
            cam3.near = lf.near; cam3.far = lf.far;
            sphereOut.set(
                (lf.centerWorld[0] - arrefFrame.eyeMerc[0]) / arrefFrame.h,
                -(lf.centerWorld[1] - arrefFrame.eyeMerc[1]) / arrefFrame.h,
                (lf.centerWorld[2] - arrefFrame.eyeMerc[2]) / arrefFrame.v);
            cam3.position.setFromMatrixPosition(cam3.matrixWorld);
            cam3.up.set(0, 0, 1);
            (this as any).__mbShArRefCenter = Array.from(lf.centerWorld).map((x: number) => +x.toExponential(9));
            return true;
        };
        // mgl-faithful light axis in the MERCATOR frame: the raw dirProp
        // spherical conversion (mgl st(), az+90) is mercator-frame native;
        // otherwise y-mirror the scene dir (the raw-branch fallback).
        const arrefDirMerc = (): THREE.Vector3 => {
            const dirPropA = (this.m_dataSource as any).m_environment
                ?.m_3DDirectional?.direction as [number, number] | undefined;
            if (dirPropA) {
                const aA = (dirPropA[0] + 90) * Math.PI / 180;
                const pA = dirPropA[1] * Math.PI / 180;
                return new THREE.Vector3(
                    Math.cos(aA) * Math.sin(pA), Math.sin(aA) * Math.sin(pA), Math.cos(pA));
            }
            return new THREE.Vector3(lightDir.x, -lightDir.y, lightDir.z);
        };
        if (arrefPose && arrefFrame && arrefApplyCamera(arrefDirMerc(), sphereCenter)) {
            // Depth pass consumes the manual matrices directly; skip the
            // legacy position/lookAt below.
        } else {
        this.m_shadowCamera.position.copy(sphereCenter);
        this.m_shadowCamera.up.set(0, 0, 1);
        // §885 终二六九/二七一: ls.dir is the LIGHT-TRAVEL direction (downward
        // z); the shbfix profile probe (fragZ≈0.01-0.07 across the whole
        // scene) proved the legacy `lookAt(center − lightDir)` aims the light
        // camera at the SKY — the scene renders at the near plane, mirrored.
        // shbfix=1 looks ALONG +lightDir (down at the scene) instead.
        if ((globalThis as any).__mbShadowBiasFix !== 1) {
            this.m_shadowCamera.lookAt(sphereCenter.clone().sub(lightDir));
        } else {
            this.m_shadowCamera.lookAt(sphereCenter.clone().add(lightDir));
        }
        this.m_shadowCamera.updateProjectionMatrix();
        this.m_shadowCamera.updateMatrixWorld();
        // §885 终三十九g49b REVERTED: the caster-box re-center (box center →
        // NDC 0,0 along the light-camera right/up) was tested here and made
        // the lighting fixtures return pixel-exact to the no-shadow baseline
        // — the shifted light frame no longer overlaps the ground's sample
        // band. The view-sphere-centered framing stays.
        }
        // §885 终五十五: the mgl frustum-sphere fit already clamps [near,far]
        // around the light axis (near = −2r covers the sphere from behind the
        // light camera, far = r/dir.z covers the deepest ground reach) — the
        // former caster-AABB depth clamp is subsumed.

        // Depth-only pass over the casters (layer mask + override material)
        // in the INDEPENDENT context — the main renderer/canvas untouched.
        // §885 终一百零三: shadowhw=1 → HW depth-texture path: render into a
        // WebGLRenderTarget depth texture on the MAIN context (cross-context
        // textures can't be shared), giving receivers a 24-bit hardware depth
        // (no 16-bit pack) sampled as .r.
        const mainRenderer: THREE.WebGLRenderer | undefined = (globalThis as any).__mbShadowHW
            ? (this.m_mapView as any)?.renderer : undefined;
        const prevOverride = scene.overrideMaterial;
        const prevLayers = this.m_shadowCamera.layers.mask;
        // §532: layer 1 filter REQUIRED — it also excludes the atmosphere
        // sky/ground meshes whose onBeforeRender asserts
        // (material instanceof GroundAtmosphereMaterial) against the pass's
        // override material, aborting the whole render (white canvas).
        this.m_shadowCamera.layers.set(1);
        scene.overrideMaterial = this.m_depthMaterial;
        // §885 终四十九g51h: bind the receiver matrix BY REFERENCE — the
        // depth pass projects casters through the same m_matrix the receivers
        // sample with (g51h vertex rewrite), so last frame's compose drives
        // this frame's rasterization; static fixtures settle on frame 2.
        // A/B disabled
        try {
            if (mainRenderer) {
                if (!this.m_hwRT) {
                    const dt = new THREE.DepthTexture(size, size);
                    dt.type = THREE.UnsignedIntType;
                    dt.format = THREE.DepthFormat;
                    // §885 g58 (audit S10): m_hwRT's texture stays PLAIN —
                    // software-path receivers read it as sampler2D; hardware
                    // compare lives in the separate m_hwRTS depth texture.
                    this.m_hwRT = new THREE.WebGLRenderTarget(size, size, {
                        depthTexture: dt, depthBuffer: true, stencilBuffer: false,
                        minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
                        generateMipmaps: false,
                    });
                }
                const prevRT2 = mainRenderer.getRenderTarget();
                mainRenderer.setRenderTarget(this.m_hwRT);
                mainRenderer.setClearColor(0xffffff, 1);
                mainRenderer.clear(true, true);
                mainRenderer.render(scene, this.m_shadowCamera);
                // §885 终五十七g51p: layer-2 DoubleSide pass for no-normal
                // meshes (HW depth path accumulates in the same RT).
                this.renderDepthLayer2(scene, this.m_shadowCamera, mainRenderer);
                mainRenderer.setRenderTarget(prevRT2);
                this.m_shTex = this.m_hwRT.depthTexture;
                (this as any).__mbShHWTex = true;
                // §885 g58 (audit S10): render the depth AGAIN into a
                // compare-mode depth texture (sampler2DShadow GREATER +
                // LINEAR = hardware bilinear PCF, mgl shadow_renderer.ts
                // :298-309/:519). m_hwRT's texture must stay PLAIN — the
                // software-path receivers read it as sampler2D, and a
                // TEXTURE_COMPARE_MODE binding poisons every sampler2D read.
                if ((globalThis as any).__mbShadow2D === true
                    && (globalThis as any).__mbShadow2DQuad !== false) {
                    if (!this.m_hwRTS || this.m_hwRTS.width !== size) {
                        const dts = new THREE.DepthTexture(size, size);
                        dts.type = THREE.UnsignedIntType;
                        dts.format = THREE.DepthFormat;
                        dts.compareFunction = THREE.GreaterCompare;
                        this.m_hwRTS = new THREE.WebGLRenderTarget(size, size, {
                            depthTexture: dts, depthBuffer: true, stencilBuffer: false,
                            minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                            generateMipmaps: false,
                        });
                    }
                    mainRenderer.setRenderTarget(this.m_hwRTS);
                    mainRenderer.clear(true, true);
                    mainRenderer.render(scene, this.m_shadowCamera);
                    this.renderDepthLayer2(scene, this.m_shadowCamera, mainRenderer);
                    mainRenderer.setRenderTarget(prevRT2);
                    (this as any).__mbShTexS0 = this.m_hwRTS.depthTexture;
                } else {
                    (this as any).__mbShTexS0 = null;
                }
            } else {
                this.m_shRenderer.setRenderTarget(null);
                this.m_shRenderer.clear();
                this.m_shRenderer.render(scene, this.m_shadowCamera);
                // §885 终五十七g51p: layer-2 DoubleSide pass for no-normal
                // meshes (accumulates into the same depth target).
                this.renderDepthLayer2(scene, this.m_shadowCamera, this.m_shRenderer);
            }
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
            // §885 终三十九g33: dump the FULL depth readback as PNG (once at
            // frame 60) — visual confirmation of caster coverage/framing.
            const __dc = ((this as any).__mbDumpCount = ((this as any).__mbDumpCount ?? 0) + 1);
            if (__dc === 60) {
                try {
                    const c3 = document.createElement('canvas');
                    c3.width = size;
                    c3.height = size;
                    const id = c3.getContext('2d')!.createImageData(size, size);
                    // depth is packed hi/lo in R/G — visualize hi directly.
                    for (let p = 0; p < size * size; p++) {
                        id.data[p * 4] = this.m_depthPixels[p * 4];
                        id.data[p * 4 + 1] = this.m_depthPixels[p * 4 + 1];
                        id.data[p * 4 + 2] = this.m_depthPixels[p * 4 + 2];
                        id.data[p * 4 + 3] = 255;
                    }
                    c3.getContext('2d')!.putImageData(id, 0, 0);
                    const url = c3.toDataURL('image/png');
                    const fbR = (window as any).__karma__?.config?.args?.find?.(
                        (a: string) => a.startsWith('feedback-url='))?.slice('feedback-url='.length);
                    if (fbR) {
                        fetch(`${fbR}/mb-probe-dump`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ probe: 'shadow-depth-map', dataUrl: url }),
                        }).catch(() => { });
                        // eslint-disable-next-line no-console
                        console.log('[MBShadowDump] depth map posted len=' + url.length);
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.log('[MBShadowDump] fail ' + String(e));
                }
            }
        }
        // §530 probe: 8×8 sample of the depth canvas (shadowdbg diagnostics).
        if ((globalThis as any).__mbDecodeDbg || (globalThis as any).__mbShadowEnable) {
            // §692: also log a LATE frame (60th) — frame-1 framing differs
            // (few casters registered yet) and the early snapshot misled the
            // shadow investigation once already.
            const __rc = ((this as any).__mbRunCount = ((this as any).__mbRunCount ?? 0) + 1);
            if (__rc === 1 || (__rc <= 30 && __rc % 5 === 0) || __rc === 60 || __rc === 1800 || __rc === 5400) {
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
                    console.log(`[MBShadowFit] f=${__rc} darkBox=(${minX},${minY})..(${maxX},${maxY})/64 ndc=[${ndcs.join(' ')}]`);
                    // §885: full depth-canvas dump (visual) — POST dataURL to
                    // the result server via the harness feedback channel.
                    try {
                        const fb = (globalThis as any).__mbShadowFeedbackUrl;
                        if (fb && __rc === 60 || (globalThis as any).__mbShDumpSeries) {
                            const url2 = (this.m_shRenderer.domElement as HTMLCanvasElement).toDataURL('image/png');
                            fetch(`${fb}/mb-probe-dump`, {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ probe: 'shadow-depth-canvas', dataUrl: url2, casters: shadowCasters.size, frame: __rc }),
                            }).catch(() => { });
                            // §885 终二七七: numeric uv→depth consistency —
                            // for each caster-box corner project with the
                            // shadow camera, readPixels THAT texel, and compare
                            // with the corner's expected NDC z (decode r+g/255).
                            const corners: any[] = [];
                            const px4 = new Uint8Array(4);
                            for (let i = 0; i < 8; i++) {
                                v.set(
                                    i & 1 ? casterBox.max.x : casterBox.min.x,
                                    i & 2 ? casterBox.max.y : casterBox.min.y,
                                    i & 4 ? casterBox.max.z : casterBox.min.z,
                                ).project(this.m_shadowCamera);
                                const ux = Math.round((v.x * 0.5 + 0.5) * 1023);
                                const uy = Math.round((v.y * 0.5 + 0.5) * 1023);
                                const inb = ux >= 0 && ux <= 1023 && uy >= 0 && uy <= 1023;
                                let dep = -1;
                                if (inb) {
                                    gl2.readPixels(ux, uy, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px4);
                                    dep = +((px4[0] + px4[1] / 255)).toFixed(3);
                                }
                                corners.push({ ndc: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)], uv: [ux, uy], inb, depth: dep });
                            }
                            // §885 终二七七: courtyard-point depth audit —
                            // project the FIRST caster's world origin through
                            // BOTH cascade matrices and readPixels each map.
                            try {
                                const castList: any[] = [...shadowCasters];
                                const castInfo = castList.map((c: any, ci: number) => {
                                    const cp = new THREE.Vector3();
                                    c.getWorldPosition(cp);
                                    const parts: any = {};
                                    c.traverse((o: any) => {
                                        const pp = o.userData?.__mbPart;
                                        if (pp !== undefined) parts[pp] = (parts[pp] ?? 0) + 1;
                                    });
                                    return { i: ci, pos: [cp.x, cp.y, cp.z].map(x => +x.toFixed(0)), parts };
                                });
                                const firstCaster: any = castList[0];
                                const wp = new THREE.Vector3();
                                firstCaster?.getWorldPosition?.(wp);
                                const audits: any[] = [];
                                const auditM = (tag: string, mtx: THREE.Matrix4, tex: any) => {
                                    const u4 = new THREE.Vector4(wp.x, wp.y, wp.z, 1).applyMatrix4(mtx);
                                    const px5 = new Uint8Array(4);
                                    const ux = Math.round((u4.x * 0.5 + 0.5) * 1023);
                                    const uy = Math.round((u4.y * 0.5 + 0.5) * 1023);
                                    let dep: number | null = null;
                                    if (ux >= 0 && ux <= 1023 && uy >= 0 && uy <= 1023) {
                                        gl2.readPixels(ux, uy, 1, 1, gl2.RGBA, gl2.UNSIGNED_BYTE, px5);
                                        dep = +(((px5[0] + px5[1] / 255) / 255)).toFixed(4);
                                    }
                                    audits.push({ tag, uv: [ux, uy], depth: dep });
                                };
                                auditM('cascade0', this.m_matrix, this.m_shTex);
                                auditM('cascade1', this.m_matrix1, this.m_shTex1);
                                const v4chk = new THREE.Vector4(wp.x, wp.y, wp.z, 1).applyMatrix4(this.m_shadowCamera.matrixWorldInverse).applyMatrix4(this.m_shadowCamera.projectionMatrix);
                                audits.push({ tag: 'wp', world: [wp.x, wp.y, wp.z].map(x => +x.toFixed(1)), castInfo });
                                // §885 终三十九g48: receiver-vs-depth-pass 对拍 —
                                // dump the depth-pass matrix and project the box
                                // center + a south ground probe through it; the
                                // sweep side POSTs the receiver's own
                                // uMBShadowMatrix for offline comparison.
                                audits.push({
                                    tag: 'depth-matrix',
                                    m: Array.from(this.m_matrix.elements).map(v => +v.toPrecision(9)),
                                    proj: Array.from(this.m_shadowCamera.projectionMatrix.elements).map(v => +v.toPrecision(9)),
                                    view: Array.from(this.m_shadowCamera.matrixWorldInverse.elements).map(v => +v.toPrecision(9)),
                                });
                                {
                                    const bc2 = casterBox.getCenter(new THREE.Vector3());
                                    for (const [tag2, pt2] of [
                                        ['box-center', bc2],
                                        ['ground-south', new THREE.Vector3(bc2.x, bc2.y - casterBox.getSize(new THREE.Vector3()).y * 0.4, bc2.z)],
                                        ['wall-top', new THREE.Vector3(bc2.x, bc2.y + casterBox.getSize(new THREE.Vector3()).y * 0.3, casterBox.max.z)],
                                    ] as const) {
                                        const u5 = new THREE.Vector4(pt2.x, pt2.y, pt2.z, 1).applyMatrix4(this.m_matrix);
                                        audits.push({
                                            tag: `proj-${tag2}`,
                                            world: [pt2.x, pt2.y, pt2.z].map(v => +v.toFixed(1)),
                                            uv: [+(u5.x).toFixed(4), +(u5.y).toFixed(4), +(u5.z).toFixed(4)],
                                        });
                                    }
                                }
                                fetch(`${fb}/mb-probe-dump`, {
                                    method: 'POST',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({ probe: 'courtyard-audit', audits }),
                                }).catch(() => { });
                            } catch (e5) { (globalThis as any).__mbCourtyardErr = String(e5); }
                            fetch(`${fb}/mb-probe-dump`, {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ probe: 'shuv-corner-depth', corners }),
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
        // §885 终二六九: the [0,1] remap must LEFT-multiply (bias·proj·view).
        // The legacy right-multiply (proj·view·bias) pushed the +0.5 offsets
        // through the whole view transform as if they were geometry — every
        // receiver sampled garbage uv (scene at uv.x≈−0.65) and stayed lit,
        // killing ALL model-received cast shadows (sno 66.7k residual).
        // The fix is REAL but the activated pipeline still self-shadows
        // (acne: cascade-1 4× depth precision + compare window) — until the
        // bias/PCF pass is calibrated it stays behind shbfix=1.
        this.m_matrix
            .multiplyMatrices(this.m_shadowCamera.projectionMatrix, this.m_shadowCamera.matrixWorldInverse);
        {
            const mbBias = new THREE.Matrix4().set(
                0.5, 0, 0, 0.5,
                0, 0.5, 0, 0.5,
                0, 0, 0.5, 0.5,
                0, 0, 0, 1,
            );
            // §885 终二七三: migration default ON (shbfix=0 reverts).
            if ((globalThis as any).__mbShadowBiasFix === 0) {
                // shbfix=0: legacy right-multiply (revert knob).
                this.m_matrix.multiply(mbBias);
            } else {
                this.m_matrix.premultiply(mbBias);
            }
            // §885 终三〇八: mgl texel snapping (Ar tail, helpers now priced —
            // av=F is SCALAR multiply): Mtexel = clip·(res/2); F=floor(Mtexel);
            // z_clip = −fract(Mtexel)·(2/res); L' = translate(z_clip)·L.
            // Aligns the light-space center to texel boundaries (no shimmer).
            // §885 终三十九g50g: mgl ALWAYS snaps (shadow_renderer.ts:779
            // "Move light camera in discrete steps") — default-on with the
            // plane-bias bundle (−20k/fixture, g50g attribution);
            // shadowmgl=0 reverts both.
            if ((globalThis as any).__mbShTexelSnap
                || (globalThis as any).__mbShadowMgl !== 0) {
            const O = mbShadowRes() / 2;
            const Mc = new THREE.Vector4(sphereCenter.x, sphereCenter.y, sphereCenter.z, 1)
                .applyMatrix4(this.m_matrix);
                const zx = -(Mc.x * O - Math.floor(Mc.x * O)) / O;
                const zy = -(Mc.y * O - Math.floor(Mc.y * O)) / O;
                const zz = -(Mc.z * O - Math.floor(Mc.z * O)) / O;
                this.m_matrix.premultiply(new THREE.Matrix4().makeTranslation(zx, zy, zz));
            }
            // §885 终四十四g50x: band-line forensics (shbandline=1) — after
            // the FULL compose (bias + snap): walk a scanline of screen
            // pixels across candidate receiver planes (ground + deck-height
            // steps), compute m_matrix uv/z and the STORED depth at that uv
            // from this frame's readback, and POST the table. Numerically
            // answers whether occluded (z > stored) samples exist along the
            // expected band line.
            if ((globalThis as any).__mbBandLine && size > 0) {
                try {
                    const rteCamB: any = (this.m_mapView as any).getRteCamera?.()
                        ?? this.m_mapView?.camera;
                    rteCamB.updateMatrixWorld?.();
                    const ivpB = new THREE.Matrix4()
                        .multiplyMatrices(rteCamB.matrixWorld, rteCamB.projectionMatrixInverse.clone());
                    const groundZB = -(eye ? eye.z : 0);
                    const mmB = this.m_matrix;
                    const samples: any[] = [];
                    for (let sx = 250; sx <= 380; sx += 10) {
                        for (const dz of [0, 5, 10, 15]) {
                            const ndcX = (sx / 512) * 2 - 1;
                            const ndcY = 1 - (250 / 512) * 2;
                            const vFar = new THREE.Vector4(ndcX, ndcY, 1, 1).applyMatrix4(ivpB);
                            const vNear = new THREE.Vector4(ndcX, ndcY, -1, 1).applyMatrix4(ivpB);
                            const pFar = new THREE.Vector3(vFar.x / vFar.w, vFar.y / vFar.w, vFar.z / vFar.w);
                            const pNear = new THREE.Vector3(vNear.x / vNear.w, vNear.y / vNear.w, vNear.z / vNear.w);
                            const dir = pFar.sub(pNear).normalize();
                            const t = dir.z < -1e-6 ? (groundZB + dz - pNear.z) / dir.z : NaN;
                            const W = pNear.addScaledVector(dir, t);
                            const uv4 = new THREE.Vector4(W.x, W.y, W.z, 1).applyMatrix4(mmB);
                            const uu = uv4.x / uv4.w, vv = uv4.y / uv4.w, zz = uv4.z / uv4.w;
                            const tx = Math.min(size - 1, Math.max(0, Math.round(uu * size)));
                            const ty = Math.min(size - 1, Math.max(0, Math.round((1 - vv) * size)));
                            const o = (ty * size + tx) * 4;
                            const stored = this.m_depthPixels[o] / 255
                                + this.m_depthPixels[o + 1] / 255 / 255;
                            // §885 终四十八g51c: 5×5 neighborhood minimum —
                            // distinguishes "occluder truly absent from the
                            // map" (nbMin ≈ stored ≈ clear/own) from
                            // "sub-texel registration shift" (nbMin < stored
                            // nearby: the occluder is there, just offset).
                            let nbMin = stored;
                            for (let ddy = -2; ddy <= 2; ddy++) {
                                for (let ddx = -2; ddx <= 2; ddx++) {
                                    const nx = Math.min(size - 1, Math.max(0, tx + ddx));
                                    const ny = Math.min(size - 1, Math.max(0, ty + ddy));
                                    const no = (ny * size + nx) * 4;
                                    const v = this.m_depthPixels[no] / 255
                                        + this.m_depthPixels[no + 1] / 255 / 255;
                                    if (v < nbMin) nbMin = v;
                                }
                            }
                            samples.push({
                                sx, dz, w: [+W.x.toFixed(1), +W.y.toFixed(1), +W.z.toFixed(1)],
                                uv: [+uu.toFixed(4), +vv.toFixed(4), +zz.toFixed(4)],
                                stored: +stored.toFixed(4), nbMin: +nbMin.toFixed(4),
                                occ: +(zz - 0.0001 > stored),
                                occNb: +(zz - 0.0001 > nbMin),
                            });
                        }
                    }
                    const fbB = (globalThis as any).__mbShadowFeedbackUrl
                        ?? (window as any).__karma__?.config?.args
                            ?.find?.((a: string) => a.startsWith('feedback-url='))
                            ?.slice('feedback-url='.length);
                    if (fbB) {
                        fetch(`${fbB}/mb-probe-dump`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({
                                probe: 'band-forensics', groundZ: groundZB, size,
                                nOffZ: this.m_normalOffsetZ,
                                mMatrix: Array.from(mmB.elements).map(v => +v.toPrecision(9)),
                                samples,
                            }),
                        }).catch(() => { });
                    }
                } catch (e) {
                    (globalThis as any).__mbBandLineErr = String(e).slice(0, 160);
                }
            }
        }
        // §885 终三十九g50f: analytic ground-shadow mask (shadowanalytic=1)
        // — project every caster vertex along the light axis onto the
        // receiver ground plane, hull per caster, fill black over white in
        // the SAME m_matrix frame the receivers sample. Replaces the
        // shadow-map depth compare entirely (no 16-bit pack, no bias, no
        // acne); the mask bakes the geometrically-true shadow footprint.
        if ((globalThis as any).__mbShadowAnalytic) {
            try {
                this.buildAnalyticMask(eye, size);
            } catch (e) {
                (globalThis as any).__mbShadowAnalyticErr = String(e);
            }
        }

        // §885 终二六七: one-shot composition probe — the model receivers see
        // a ZERO-LINEAR m_matrix (uv constant out-of-bounds ⇒ everything lit).
        {
            const gM = (globalThis as any);
            gM.__mbShMatProbeN = (gM.__mbShMatProbeN ?? 0) + 1;
            if (gM.__mbShMatProbeN === 120 && !gM.__mbShMatProbeDone) {
                gM.__mbShMatProbeDone = true;
                try {
                    const fbM = (window as any).__karma__?.config?.args
                        ?.find?.((a: string) => a.startsWith('feedback-url='))
                        ?.slice('feedback-url='.length);
                    if (fbM) {
                        const f = (m: THREE.Matrix4) => Array.from(m.elements);
                        fetch(`${fbM}/mb-probe-dump`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({
                                probe: 'shmat-compose',
                                mMatrix: f(this.m_matrix),
                                proj: f(this.m_shadowCamera.projectionMatrix),
                                viewInv: f(this.m_shadowCamera.matrixWorldInverse),
                                world: f(this.m_shadowCamera.matrixWorld),
                                lr: [this.m_shadowCamera.left, this.m_shadowCamera.right, this.m_shadowCamera.top, this.m_shadowCamera.bottom, this.m_shadowCamera.near, this.m_shadowCamera.far],
                                camPos: Array.from(this.m_shadowCamera.position.toArray()).map((x: number) => +x.toFixed(1)),
                                eye: (this as any).__mbShDbgEye ? Array.from((this as any).__mbShDbgEye).map((x: number) => +x.toFixed(1)) : null,
                                worldCenter: (this.m_mapView as any)?.worldCenter?.toArray?.()?.map((x: number) => +x.toFixed(1)) ?? null,
                            }),
                        }).catch(() => { });
                    }
                } catch { /* probe only */ }
            }
        }

        // §885 终二九三+/终二九八: model-specific RAW-axis cascade-0 pass —
        // model receivers prefer the raw mgl spherical axis (sno −4.2k,
        // z-offset-v2 −1.0k at 0°) while the ground quad + fill receivers
        // stay on the mirror cascades (their calibration is mirror-frame).
        // Consumers split: ground quad + fill receivers keep sampling
        // m_shTex/m_matrix (mirror); the model tail prefers
        // m_shTexR0/m_matrixR0 (this pass). Framing mirrors cascade-0 (same
        // sphere center/radius/fit — the fit is direction-invariant for an
        // ortho sphere fit; far recomputed from the raw axis z). The
        // 终二九三+ −12° argmin is a sno-specific overfit (z-offset-v2 +55k)
        // — kept as the shrawaz knob, default 0.
        if (this.m_shRenderer && (globalThis as any).__mbModelRawShadow !== false) {
            const dirPropR = (this.m_dataSource as any).m_environment
                ?.m_3DDirectional?.direction as [number, number] | undefined;
            let rawDir: THREE.Vector3;
            if (dirPropR) {
                // raw mgl spherical conversion (az+90, no §686 y mirror) —
                // the SHDIRALT=1 sweep semantics.
                const aR = (dirPropR[0] + 90) * Math.PI / 180;
                const pR = dirPropR[1] * Math.PI / 180;
                rawDir = new THREE.Vector3(
                    Math.cos(aR) * Math.sin(pR), Math.sin(aR) * Math.sin(pR), Math.cos(pR));
            } else {
                // §683 scene-frame dir with the y mirror undone (the sweep's
                // fallback branch for styles without a raw direction prop).
                rawDir = new THREE.Vector3(lightDir.x, -lightDir.y, lightDir.z);
            }
            // shrawaz=<deg> sweep knob — default 0 = the unrotated raw mgl
            // axis (no fitted freedom). The 终二九三+ sno argmin (−12°) is
            // NOT the global default: it wrecks z-offset-v2 (+55k) while
            // winning ~1k more on sno — per-fixture knob only (终二九八).
            const rawAz = Number((globalThis as any).__mbShadowRawAz ?? 0);
            if (rawAz) {
                const azR = rawAz * Math.PI / 180;
                const cR2 = Math.cos(azR), sR2 = Math.sin(azR);
                rawDir = new THREE.Vector3(
                    rawDir.x * cR2 - rawDir.y * sR2,
                    rawDir.x * sR2 + rawDir.y * cR2,
                    rawDir.z);
            }
            // shadowDirectionFromProperties polar clamp (75°) — kept for the
            // y-mirror fallback form (azimuth-invariant otherwise).
            {
                const maxPolarR = 75 * Math.PI / 180;
                const polR = Math.acos(THREE.MathUtils.clamp(rawDir.z, -1, 1));
                if (polR > maxPolarR) {
                    const hcR = Math.sin(maxPolarR);
                    const hR = Math.hypot(rawDir.x, rawDir.y) || 1e-9;
                    rawDir.set(rawDir.x / hR * hcR, rawDir.y / hR * hcR, Math.cos(maxPolarR));
                }
            }
            // The caster-side normal offset follows THIS pass's axis (the
            // sweep fed the depth material the same raw axis).
            const depthMatR = (this.m_depthMaterial as THREE.ShaderMaterial);
            if (depthMatR.uniforms?.uMBLightDir) {
                depthMatR.uniforms.uMBLightDir.value.copy(rawDir).normalize();
            }
            // §885 终三一四: under sharref the raw pass shares the mgl
            // mercator-frame camera (mgl has a single light pipeline — the
            // raw axis IS the mgl-native mercator dir, so both passes
            // converge to one map; the model tail then samples the same
            // mgl semantics as the mirror consumers).
            if ((globalThis as any).__mbShArRef && arrefApplyCamera(arrefDirMerc(), sphereCenter)) {
                // manual matrices set; skip the legacy pose below
            } else {
            this.m_shadowCamera.left = -radius;
            this.m_shadowCamera.right = radius;
            this.m_shadowCamera.top = radius;
            this.m_shadowCamera.bottom = -radius;
            this.m_shadowCamera.near = -2 * radius;
            this.m_shadowCamera.far = radius / Math.max(rawDir.z, 0.1);
            this.m_shadowCamera.position.copy(sphereCenter);
            this.m_shadowCamera.up.set(0, 0, 1);
            // Same lookAt convention as the mirror pass (legacy center−dir vs
            // shbfix center+dir — the calibrated pair).
            if ((globalThis as any).__mbShadowBiasFix !== 1) {
                this.m_shadowCamera.lookAt(sphereCenter.clone().sub(rawDir));
            } else {
                this.m_shadowCamera.lookAt(sphereCenter.clone().add(rawDir));
            }
            this.m_shadowCamera.updateProjectionMatrix();
            this.m_shadowCamera.updateMatrixWorld();
            // §885 终五十六g51o2: expand the raw window to the CASTER BOX
            // union (never shrink) — the frustum-sphere square window misses
            // far-placed casters (landmark-conflation 192.8m model at
            // ~0.99r from the window center). Required together with
            // DoubleSide: the window must cover the model AND the walls must
            // rasterize despite winding.
            {
                const viewInvR = this.m_shadowCamera.matrixWorldInverse;
                const rawBox = new THREE.Box3();
                for (const obj of shadowCasters) {
                    obj.updateWorldMatrix?.(true, false);
                    const b = new THREE.Box3().setFromObject(obj);
                    if (!b.isEmpty()) rawBox.union(b);
                }
                if (!rawBox.isEmpty()) {
                    const cR = new THREE.Vector3();
                    let minX = Infinity, maxX = -Infinity;
                    let minY = Infinity, maxY = -Infinity;
                    let minZ = Infinity, maxZ = -Infinity;
                    for (let ci = 0; ci < 8; ci++) {
                        cR.set(
                            ci & 1 ? rawBox.max.x : rawBox.min.x,
                            ci & 2 ? rawBox.max.y : rawBox.min.y,
                            ci & 4 ? rawBox.max.z : rawBox.min.z);
                        cR.applyMatrix4(viewInvR);
                        minX = Math.min(minX, cR.x); maxX = Math.max(maxX, cR.x);
                        minY = Math.min(minY, cR.y); maxY = Math.max(maxY, cR.y);
                        minZ = Math.min(minZ, cR.z); maxZ = Math.max(maxZ, cR.z);
                    }
                    // this.m_shadowCamera.left = Math.min(this.m_shadowCamera.left, minX);
                    // this.m_shadowCamera.right = Math.max(this.m_shadowCamera.right, maxX);
                    // this.m_shadowCamera.top = Math.max(this.m_shadowCamera.top, maxY);
                    // this.m_shadowCamera.bottom = Math.min(this.m_shadowCamera.bottom, minY);
                    // g51p4→g51p7 A/B: the z near/far min/max extension is
                    // REQUIRED — lod 275,962 with it vs 310,496 without
                    // (+34k); landmark unchanged. Keep the g51n form.
                    // this.m_shadowCamera.near = Math.min(this.m_shadowCamera.near, minZ);
                    // this.m_shadowCamera.far = Math.max(this.m_shadowCamera.far, maxZ);
                    this.m_shadowCamera.updateProjectionMatrix();
                    this.m_shadowCamera.updateMatrixWorld();
                }
            }
            scene.overrideMaterial = this.m_depthMaterial;
            const prevLayersR = this.m_shadowCamera.layers.mask;
            this.m_shadowCamera.layers.set(1);
            try {
                this.m_shRenderer.setRenderTarget(null);
                this.m_shRenderer.clear();
                this.m_shRenderer.render(scene, this.m_shadowCamera);
                // §885 终五十七g51p: layer-2 DoubleSide pass for no-normal
                // meshes (accumulates into the same depth target).
                this.renderDepthLayer2(scene, this.m_shadowCamera, this.m_shRenderer);
            } catch (e) {
                (globalThis as any).__mbShadowPassRErr = String(e);
            } finally {
                scene.overrideMaterial = prevOverride;
                this.m_shadowCamera.layers.mask = prevLayersR;
            }
            {
                const glR: any = this.m_shRenderer.getContext();
                const pxR = size * size * 4;
                if (!this.m_depthPixelsR0 || this.m_depthPixelsR0.length !== pxR) {
                    this.m_depthPixelsR0 = new Uint8Array(pxR);
                }
                try {
                    glR.readPixels(0, 0, size, size, glR.RGBA, glR.UNSIGNED_BYTE, this.m_depthPixelsR0);
                } catch (e) { /* probe only */ }
                if (!this.m_shTexR0 || !(this.m_shTexR0 as any).isDataTexture) {
                    this.m_shTexR0 = new THREE.DataTexture(this.m_depthPixelsR0!, size, size, THREE.RGBAFormat);
                    this.m_shTexR0.magFilter = THREE.NearestFilter;
                    this.m_shTexR0.minFilter = THREE.NearestFilter;
                    this.m_shTexR0.generateMipmaps = false;
                    this.m_shTexR0.flipY = false;
                }
                this.m_shTexR0.needsUpdate = true;
            }
            // world → raw shadow-uv matrix (same premultiply-bias convention
            // as the mirror cascades — 终二六九 left-multiply).
            this.m_matrixR0
                .multiplyMatrices(this.m_shadowCamera.projectionMatrix, this.m_shadowCamera.matrixWorldInverse);
            {
                const mbBiasR = new THREE.Matrix4().set(
                    0.5, 0, 0, 0.5,
                    0, 0.5, 0, 0.5,
                    0, 0, 0.5, 0.5,
                    0, 0, 0, 1,
                );
                if ((globalThis as any).__mbShadowBiasFix === 0) {
                    this.m_matrixR0.multiply(mbBiasR);
                } else {
                    this.m_matrixR0.premultiply(mbBiasR);
                }
                // §885 终五十四g51m: raw-shadow footprint dump — project the
                // TALLEST caster's bbox corners + center through m_matrixR0
                // and readPixels m_depthPixelsR0 at those uvs. Answers whether
                // the model shadow footprint covers the receiver uv region
                // (landmark-conflation +12 万 residual vs 1edcafc5). Gate:
                // shcastaudit=1. One-shot at frame ≥ 30 (map settled).
                if ((globalThis as any).__mbShCastAudit) {
                    const fpN2 = ((globalThis as any).__mbRawFpN =
                        ((globalThis as any).__mbRawFpN ?? 0) + 1);
                    if (fpN2 === 30 && this.m_depthPixelsR0) {
                        try {
                            let tallest: any = null;
                            let tallH = -1;
                            for (const obj of shadowCasters) {
                                obj.updateWorldMatrix?.(true, false);
                                const b = new THREE.Box3().setFromObject(obj);
                                if (b.isEmpty()) continue;
                                const h = b.max.z - b.min.z;
                                if (h > tallH) { tallH = h; tallest = { obj, b }; }
                            }
                            if (tallest) {
                                const szR = size;
                                const v2 = new THREE.Vector3();
                                const px2 = new Uint8Array(4);
                                const pts: any[] = [];
                                const b2 = tallest.b;
                                const corners: any[] = [];
                                for (let ci = 0; ci < 8; ci++) {
                                    corners.push(new THREE.Vector3(
                                        ci & 1 ? b2.max.x : b2.min.x,
                                        ci & 2 ? b2.max.y : b2.min.y,
                                        ci & 4 ? b2.max.z : b2.min.z));
                                }
                                corners.push(b2.getCenter(new THREE.Vector3()));
                                for (const w of corners) {
                                    v2.copy(w).applyMatrix4(this.m_matrixR0);
                                    // gl.readPixels rows are BOTTOM-up: texture
                                    // v (flipY=false) maps directly, no flip.
                                    const ux = Math.round(v2.x * (szR - 1));
                                    const uy = Math.round(v2.y * (szR - 1));
                                    const inb = ux >= 0 && ux < szR && uy >= 0 && uy < szR;
                                    let dep = -1;
                                    if (inb) {
                                        const o = (uy * szR + ux) * 4;
                                        dep = +((this.m_depthPixelsR0[o] +
                                            this.m_depthPixelsR0[o + 1] / 255)).toFixed(3);
                                    }
                                    pts.push({ w: [+w.x.toFixed(1), +w.y.toFixed(1), +w.z.toFixed(1)],
                                        uv: [+v2.x.toFixed(3), +v2.y.toFixed(3), +v2.z.toFixed(3)],
                                        inb, depth: dep });
                                }
                                // §885 终六十八g51q4: also project via the
                                // MIRROR m_matrix (what fill receivers
                                // sample with) for the shadow-band coverage
                                // audit.
                                const mPts: any[] = [];
                                for (const w of corners) {
                                    const vM = w.clone().applyMatrix4(this.m_matrix);
                                    mPts.push({ uv: [+vM.x.toFixed(3), +vM.y.toFixed(3), +vM.z.toFixed(3)] });
                                }
                                const xs = mPts.map(p => p.uv[0]);
                                const ys = mPts.map(p => p.uv[1]);
                                const mRect = { x: [Math.min(...xs), Math.max(...xs)],
                                    y: [Math.min(...ys), Math.max(...ys)] };
                                const fbR = (globalThis as any).__mbShadowFeedbackUrl;
                                const payload: any = { probe: 'raw-shadow-footprint',
                                    tallestHeight: +tallH.toFixed(1), points: pts,
                                    mirrorRect: mRect };
                                if (fbR) {
                                    fetch(`${fbR}/mb-probe-dump`, {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify(payload),
                                    }).catch(() => { });
                                }
                                // eslint-disable-next-line no-console
                                console.log('[MBRawFp] ' + JSON.stringify(payload).slice(0, 1200));
                            }
                        } catch (e) {
                            (globalThis as any).__mbRawFpErr = String(e);
                        }
                    }
                }
                // §885 终三〇八: texel snap for the RAW cascade-0 (the model
                // tail's primary map) — same formula, own matrix.
                if ((globalThis as any).__mbShTexelSnap
                    || (globalThis as any).__mbShadowMgl !== 0) {
                    const OR = mbShadowRes() / 2;
                    const McR = new THREE.Vector4(sphereCenter.x, sphereCenter.y, sphereCenter.z, 1)
                        .applyMatrix4(this.m_matrixR0);
                    const zRx = -(McR.x * OR - Math.floor(McR.x * OR)) / OR;
                    const zRy = -(McR.y * OR - Math.floor(McR.y * OR)) / OR;
                    const zRz = -(McR.z * OR - Math.floor(McR.z * OR)) / OR;
                    this.m_matrixR0.premultiply(new THREE.Matrix4().makeTranslation(zRx, zRy, zRz));
                }
            }
            // §885 终三一四: restore the camera's own matrix composition
            // before cascade-1 reuses it (sharref drove it manually above).
            if ((globalThis as any).__mbShArRef) {
                this.m_shadowCamera.matrixAutoUpdate = true;
                this.m_shadowCamera.matrixWorldNeedsUpdate = true;
            }
            // Restore the MIRROR axis for the cascade-1 pass below (it reuses
            // this camera and historically inherited cascade-0's rotation).
            if (depthMatR.uniforms?.uMBLightDir) {
                depthMatR.uniforms.uMBLightDir.value.copy(lightDir).normalize();
            }
            this.m_shadowCamera.up.set(0, 0, 1);
            if ((globalThis as any).__mbShCompass) {
                // §885 终三〇九: shcompass=1 → mgl compass roll (Ti(pitch,
                // −bearing) priced as the shortest-arc quaternion from the
                // camera's −z to the light travel direction) instead of the
                // up-projected lookAt roll — the roll-convention candidate
                // for the museum 影图错位.
                const fwd = rawDir.clone().negate().normalize();
                const q = new THREE.Quaternion().setFromUnitVectors(
                    new THREE.Vector3(0, 0, -1), fwd);
                this.m_shadowCamera.quaternion.copy(q);
                this.m_shadowCamera.lookAt(
                    sphereCenter.x + fwd.x, sphereCenter.y + fwd.y, sphereCenter.z + fwd.z);
            } else if ((globalThis as any).__mbShadowBiasFix !== 1) {
                this.m_shadowCamera.lookAt(sphereCenter.clone().sub(lightDir));
            } else {
                this.m_shadowCamera.lookAt(sphereCenter.clone().add(lightDir));
            }
            this.m_shadowCamera.updateProjectionMatrix();
            this.m_shadowCamera.updateMatrixWorld();
        }

        // §885 终一百一十八: cascade-1 far-field pass — 4× extents, same
        // (skipped when the HW path is active — cascade-1 uses the
        // independent-context renderer).
        if (this.m_shRenderer) {
        // §885 终一百一十八: cascade-1 far-field pass — 4× extents, same
        // sphere center/direction. Ground receivers outside cascade-0 fall
        // back to this map (mgl shadow_occlusion cascade fallback).
        this.m_shadowCamera.left = -radius * 4;
        this.m_shadowCamera.right = radius * 4;
        this.m_shadowCamera.top = radius * 4;
        this.m_shadowCamera.bottom = -radius * 4;
        this.m_shadowCamera.near = -2 * radius * 4;
        this.m_shadowCamera.far = radius * 4 / Math.max(lightDir.z, 0.1);
        this.m_shadowCamera.updateProjectionMatrix();
        this.m_shadowCamera.updateMatrixWorld();
        this.m_matrix1
            .multiplyMatrices(this.m_shadowCamera.projectionMatrix, this.m_shadowCamera.matrixWorldInverse);
        {
            const mbBias1 = new THREE.Matrix4().set(
                0.5, 0, 0, 0.5,
                0, 0.5, 0, 0.5,
                0, 0, 0.5, 0.5,
                0, 0, 0, 1,
            );
            if ((globalThis as any).__mbShadowBiasFix === 0) {
                this.m_matrix1.multiply(mbBias1);
            } else {
                this.m_matrix1.premultiply(mbBias1);
            }
        }
        scene.overrideMaterial = this.m_depthMaterial;
        const prevLayers1 = this.m_shadowCamera.layers.mask;
        this.m_shadowCamera.layers.set(1);
        try {
            this.m_shRenderer.setRenderTarget(null);
            this.m_shRenderer.clear();
            this.m_shRenderer.render(scene, this.m_shadowCamera);
            // §885 终五十七g51p: layer-2 DoubleSide pass (no-normal meshes).
            this.renderDepthLayer2(scene, this.m_shadowCamera, this.m_shRenderer);
        } catch (e) {
            (globalThis as any).__mbShadowPass1Err = String(e);
        } finally {
            scene.overrideMaterial = prevOverride;
            this.m_shadowCamera.layers.mask = prevLayers1;
        }
        {
            const gl1: any = this.m_shRenderer.getContext();
            const px1 = size * size * 4;
            if (!this.m_depthPixels1 || this.m_depthPixels1.length !== px1) {
                this.m_depthPixels1 = new Uint8Array(px1);
            }
            try {
                gl1.readPixels(0, 0, size, size, gl1.RGBA, gl1.UNSIGNED_BYTE, this.m_depthPixels1);
            } catch (e) { /* probe only */ }
            if (!this.m_shTex1 || !(this.m_shTex1 as any).isDataTexture) {
                this.m_shTex1 = new THREE.DataTexture(this.m_depthPixels1, size, size, THREE.RGBAFormat);
                this.m_shTex1.magFilter = THREE.NearestFilter;
                this.m_shTex1.minFilter = THREE.NearestFilter;
                this.m_shTex1.generateMipmaps = false;
                this.m_shTex1.flipY = false;
            }
            this.m_shTex1.needsUpdate = true;
            // §885 终二七七: cascade-1 canvas dump — is the far-field pass
            // actually drawing casters?
            try {
                const c1n = ((globalThis as any).__mbC1DumpN = ((globalThis as any).__mbC1DumpN ?? 0) + 1);
                const fb1 = (globalThis as any).__mbShadowFeedbackUrl;
                if (fb1 && (c1n === 1 || c1n === 30)) {
                    const url3 = (this.m_shRenderer.domElement as HTMLCanvasElement).toDataURL('image/png');
                    fetch(`${fb1}/mb-probe-dump`, {
                        method: 'POST',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ probe: 'shadow-depth-canvas1', dataUrl: url3 }),
                    }).catch(() => { });
                }
            } catch { /* probe only */ }
        }
        }

        // §692 one-shot matrix probe: the receiver debug readout showed
        // intensity=1 (refresh chain ✓) but the depth sample stuck at its
        // 1.0 INIT with uv.z≈0 — the signature of the uv matrix reading as
        // identity at draw time. Log the actual matrix + framing once.
        if (!(this as any).__mbMatFrames) (this as any).__mbMatFrames = 0;
        const __rc = ++(this as any).__mbMatFrames;
        if (__rc === 1 || (__rc <= 30 && __rc % 5 === 0) || __rc === 60 || __rc === 1800 || __rc === 5400) {
            (this as any).__mbMatLogged = true;
            try {
                const p = this.m_shadowCamera.position;
                const pj = this.m_shadowCamera.projectionMatrix.elements;
                const vi = this.m_shadowCamera.matrixWorldInverse.elements;
                const bc = casterBox.getCenter(new THREE.Vector3());
                const bs = casterBox.getSize(new THREE.Vector3());
                // eslint-disable-next-line no-console
                console.log(`[MBShadowMat] f=${__rc} casters=${shadowCasters.size} cam=(${p.x.toFixed(0)},${p.y.toFixed(0)},${p.z.toFixed(0)}) r=${radius.toFixed(0)} nrfr=${this.m_shadowCamera.near.toFixed(0)}/${this.m_shadowCamera.far.toFixed(0)} p00=${pj[0].toExponential(2)} boxC=(${bc.x.toFixed(0)},${bc.y.toFixed(0)},${bc.z.toFixed(0)}) boxS=(${bs.x.toFixed(0)},${bs.y.toFixed(0)},${bs.z.toFixed(0)}) sc=(${sphereCenter.x.toFixed(0)},${sphereCenter.y.toFixed(0)},${sphereCenter.z.toFixed(0)}) eyeZ=${eye.z.toFixed(0)} dir=(${lightDir.x.toFixed(3)},${lightDir.y.toFixed(3)},${lightDir.z.toFixed(3)})`);
            } catch (e) {
                // eslint-disable-next-line no-console
                console.log('[MBShadowMat] probe error ' + String(e));
            }
        }

        // §885 终三一一: mercator↔RTE frame probe (ArRef.ts wiring prerequisite).
        // Dumps the live camera/transform state plus scene-axis → mercator
        // point samples so the bridge callbacks (getCameraToWorldMercator /
        // getWorldToCamera / mercatorZfromAltitude) can be derived from real
        // numbers instead of guessed frame conventions.
        {
            const fpN = ((this as any).__mbFrameProbeN = ((this as any).__mbFrameProbeN ?? 0) + 1);
            if ((globalThis as any).__mbShFrameProbe && (fpN === 1 || fpN === 60)) {
                try {
                    const mv: any = this.m_mapView;
                    const pr = mv?.projection;
                    const gc = mv?.geoCenter;
                    const rc = mv?.getRteCamera?.() ?? mv?.camera;
                    rc?.updateMatrixWorld?.();
                    const mglMerc = (latDeg: number, lngDeg: number, alt: number) => ({
                        x: lngDeg / 360 + 0.5,
                        y: (1 - Math.asinh(Math.tan(latDeg * Math.PI / 180)) / Math.PI) / 2,
                        z: alt / (40075016.686 * Math.cos(latDeg * Math.PI / 180)),
                    });
                    const samples: any[] = [];
                    if (pr && gc && rc) {
                        const eyeW = pr.projectPoint(gc, { x: 0, y: 0, z: 0 });
                        const axes: [string, number[]][] = [
                            ['+x', [1, 0, 0]], ['+y', [0, 1, 0]], ['-x', [-1, 0, 0]], ['-y', [0, -1, 0]],
                        ];
                        for (const [name, ax] of axes) {
                            for (const d of [1000, 10000]) {
                                const w = {
                                    x: (eyeW as any).x + ax[0] * d,
                                    y: (eyeW as any).y + ax[1] * d,
                                    z: (eyeW as any).z + ax[2] * d,
                                };
                                const g: any = pr.unprojectPoint(w);
                                samples.push({
                                    axis: name, dist: d,
                                    geo: [+g.latitude.toFixed(9), +g.longitude.toFixed(9), +(g.altitude ?? 0).toFixed(3)],
                                    merc: mglMerc(g.latitude, g.longitude, g.altitude ?? 0),
                                });
                            }
                        }
                    }
                    const dump = {
                        probe: 'sh-frame-probe',
                        frame: fpN,
                        zoomLevel: mv?.zoomLevel,
                        targetDistance: mv?.targetDistance,
                        geoCenter: gc ? [gc.latitude, gc.longitude, gc.altitude ?? 0] : null,
                        projection: pr?.type,
                        canvas: mv?.canvas ? [mv.canvas.width, mv.canvas.height] : null,
                        cameraFovAspect: rc ? [rc.fov, rc.aspect] : null,
                        rteMatrixWorld: rc?.matrixWorld?.elements ? Array.from(rc.matrixWorld.elements) : null,
                        rteProjection: rc?.projectionMatrix?.elements ? Array.from(rc.projectionMatrix.elements) : null,
                        samples,
                        mglExpected: gc ? mglMerc(gc.latitude, gc.longitude, gc.altitude ?? 0) : null,
                        // §885 终三一四: sharref bridge validation — the live
                        // pose/affine the light frame was built from.
                        arrefPose: (this as any).__mbShArRefPose ?? null,
                        arrefCenter: (this as any).__mbShArRefCenter ?? null,
                    };
                    // eslint-disable-next-line no-console
                    console.log('[MBFrameProbe] ' + JSON.stringify(dump));
                    const fb = (globalThis as any).__mbShadowFeedbackUrl;
                    if (fb) {
                        fetch(`${fb}/mb-probe-dump`, {
                            method: 'POST',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify(dump),
                        }).catch(() => { });
                    }
                } catch (e) {
                    (globalThis as any).__mbFrameProbeErr = String(e);
                }
            }
        }

        // §885 终四十九g51d: m_eye/m_res feed EVERY receiver's ray rebuild
        // (getShadowUniforms → patchTileMaterials refresh → uMBEye/uMBRes),
        // but their only writers lived inside prepGroundQuad behind the
        // `if (!this.m_groundUniforms) return` bail — under the ortho style
        // the quad never compiles, so every fill receiver sampled with
        // uMBEye=(0,0,0)/uMBRes=(1,1) seeds: the ray plane (vMBElev − 0) and
        // the NDC (gl_FragCoord·2−1 on a 512px buffer) were both garbage,
        // the uv gate rejected on every fragment, and the whole receiver
        // chain rendered shadows-off bit-exact (ortho-camera 57,255 恒 lit).
        // Refresh them here, in the pass that runs in both projections; the
        // quad path keeps writing the same values (idempotent).
        this.m_eye.copy(eye);
        {
            const cvR = this.m_mapView?.canvas as HTMLCanvasElement | undefined;
            if (cvR) this.m_res.set(cvR.width, cvR.height);
        }

        this.prepGroundQuad(center, radius, eye);

        // §885 终二百二十六: uv/calibration probe (RTE frame + uMBGroundZ).
        {
            const gU = (globalThis as any);
            gU.__mbUvN = (gU.__mbUvN ?? 0) + 1;
            if (gU.__mbUvN === 50 || gU.__mbUvN === 51) {
                const cam = (this.m_mapView as any).getRteCamera?.()
                    ?? (this.m_mapView?.camera as THREE.PerspectiveCamera);
                cam.updateMatrixWorld();
                const gZ = (this.m_groundUniforms as any)?.uMBGroundZ?.value;
                const out: string[] = [];
                if (Number.isFinite(gZ)) {
                    for (const [sx, sy] of [[128, 224], [384, 224], [256, 288], [256, 160], [120, 300], [128, 320]]) {
                        const ndcX = (sx / 512) * 2 - 1;
                        const ndcY = 1 - (sy / 512) * 2;
                        const v4 = new THREE.Vector4(ndcX, ndcY, -1, 1)
                            .applyMatrix4(cam.projectionMatrixInverse);
                        v4.multiplyScalar(1 / v4.w);
                        const dirW = new THREE.Vector3(v4.x, v4.y, v4.z)
                            .applyMatrix4(new THREE.Matrix4().extractRotation(cam.matrixWorld))
                            .normalize();
                        if (Math.abs(dirW.z) < 1e-6 || dirW.z > 0) { out.push(`(${sx},${sy})=up`); continue; }
                        const t = gZ / dirW.z;
                        const W = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld)
                            .addScaledVector(dirW, t);
                        const u4 = new THREE.Vector4(W.x, W.y, W.z, 1).applyMatrix4(this.m_matrix);
                        const u4b = new THREE.Vector4(W.x, W.y, W.z, 1).applyMatrix4(this.m_matrix1);
                        out.push(`(${sx},${sy}) c0(${(u4.x / u4.w).toFixed(2)},${(u4.y / u4.w).toFixed(2)},${(u4.z / u4.w).toFixed(2)}) c1(${(u4b.x / u4b.w).toFixed(2)},${(u4b.y / u4b.w).toFixed(2)},${(u4b.z / u4b.w).toFixed(2)})`);
                    }
                } else {
                    out.push('gz=undef');
                }
                // §885 g52z: also print the WORLD points so the offline
                // mgl-frame comparison (mgl-mat cascade0.matrix) can consume
                // exact (world, uv) pairs.
                const ctcdW = (this.m_mapView as any).targetDistance ?? 500;
                for (const [sx, sy] of [[128, 224], [384, 224], [256, 288], [256, 160], [120, 300], [128, 320]]) {
                    const ndcX = (sx / 512) * 2 - 1;
                    const ndcY = 1 - (sy / 512) * 2;
                    const v4 = new THREE.Vector4(ndcX, ndcY, -1, 1)
                        .applyMatrix4(cam.projectionMatrixInverse);
                    v4.multiplyScalar(1 / v4.w);
                    const dirW = new THREE.Vector3(v4.x, v4.y, v4.z)
                        .applyMatrix4(new THREE.Matrix4().extractRotation(cam.matrixWorld))
                        .normalize();
                    const W = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld)
                        .addScaledVector(dirW, ctcdW);
                    const u4 = new THREE.Vector4(W.x, W.y, W.z, 1).applyMatrix4(this.m_matrix);
                    out.push(`W(${sx},${sy})=(${W.x.toFixed(2)},${W.y.toFixed(2)},${W.z.toFixed(2)}) uv0(${(u4.x / u4.w).toFixed(5)},${(u4.y / u4.w).toFixed(5)},${(u4.z / u4.w).toFixed(5)})`);
                }
                // m_matrix elements (column-major) for the offline mgl
                // cascade comparison.
                const me = this.m_matrix.elements;
                out.push('M=[' + Array.from(me).map((x2: number) => x2.toExponential(8)).join(',') + ']');
                // eslint-disable-next-line no-console
                console.log('[MBUvProbe] frame=', gU.__mbUvN, 'gz=', gZ, out.join('  '));
            }
        }
        // §885 g53 fix: the model-raw shadow block's then-brace was lost when
        // the g52ab2 uv-probe block was spliced in (TS1128 at renderDepthLayer2).
        }


        // §885 终二百一十五: overlay-mode ground quad draws HERE — the
        // composer path bypasses preSceneHook and drops engine-external
        // meshes, so the on-top darkening must ride the AfterRender channel
        // (the same bypass the atmosphere/fog/star quads use).
        if ((globalThis as any).__mbShadowOverlay !== false
            && !(globalThis as any).__mbGroundQuadOff
            && !this.m_orthoStyle
            && this.m_groundQuad && this.m_groundScene) {
            const prevAuto = renderer.autoClear;
            const prevRT2 = renderer.getRenderTarget();
            try {
                renderer.autoClear = false;
                renderer.setScissorTest(false);
                renderer.setRenderTarget(null);
                renderer.render(this.m_groundScene, this.m_groundCamera);
                (globalThis as any).__mbGQDraws = ((globalThis as any).__mbGQDraws ?? 0) + 1;
            } finally {
                renderer.setRenderTarget(prevRT2);
                renderer.autoClear = prevAuto;
            }
        }
    }

    /** §885 终五十七g51p: layer-2 DoubleSide pass for no-normal meshes —
     * accumulates into the same target (autoClear false, depth LESS keeps
     * the closest surface). Safe no-op when no such casters exist. */
    private renderDepthLayer2(scene: THREE.Scene, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, renderer: THREE.WebGLRenderer): void {
        const prevAuto = renderer.autoClear;
        const prevOverride = scene.overrideMaterial;
        const prevLayers = camera.layers.mask;
        try {
            renderer.autoClear = false;
            camera.layers.set(2);
            scene.overrideMaterial = this.m_depthMaterialDS;
            renderer.render(scene, camera);
        } catch (e) {
            (globalThis as any).__mbShadowLayer2Err = String(e);
        } finally {
            scene.overrideMaterial = prevOverride;
            camera.layers.mask = prevLayers;
            renderer.autoClear = prevAuto;
        }
    }

    dispose(): void {
        (this.m_mapView?.mapRenderingManager as any).preSceneHook = null;
        this.m_shRenderer?.dispose();
        this.m_shRenderer = null;
        this.m_shTex?.dispose();
        this.m_shTex = null;
    }
}
