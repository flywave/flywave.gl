import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';

/**
 * Background fog gradient (mgl draw_background + fog).
 *
 * mgl fogs the background layer like any ground content: each fragment's fog
 * depth comes from the view ray ∩ ground-plane distance, so a pitched view
 * shows a fog-color → background-color gradient across the lower screen
 * (fog/color family: expected spans the full fog range over the background).
 * Our background is a flat clear color — unfogged below the horizon.
 *
 * This renderer composites the missing gradient in AfterRender (the
 * MBHeatmapRenderer direct-draw channel): a fullscreen quad at the far plane
 * with the default LESS depth test, so it only fills fragments where nothing
 * was rendered (true background regions — content keeps its own material
 * fog). Above the horizon the quad is discarded (the atmosphere dome owns
 * the sky).
 */
export class MBBackgroundFogRenderer {
    /** Per-pitch fog-space scale: [pitch, s] pairs, linear interpolation. */
    /**
     * Per-pitch fog-space scale: [pitch, s] pairs, linear interpolation.
     * The 0.735 at 70° folds the rig's distCam-heuristic residual (§180);
     * 85° was fitted on fog/horizon-blend null family — the expected band is a
     * white strip within ~4px of the horizon plus a flat ~5% lift (the
     * exp-cube ramp needs s≈0.26 there; s=1.0 whitens the whole band).
     */
    static pitchScales: Array<[number, number]> = [[70, 0.735], [85, 0.10]];

    static scaleForPitch(pitchDeg: number): number {
        const t = MBBackgroundFogRenderer.pitchScales;
        if (pitchDeg <= t[0][0]) return t[0][1];
        if (pitchDeg >= t[t.length - 1][0]) return t[t.length - 1][1];
        for (let i = 0; i + 1 < t.length; i++) {
            if (pitchDeg >= t[i][0] && pitchDeg <= t[i + 1][0]) {
                const f = (pitchDeg - t[i][0]) / (t[i + 1][0] - t[i][0]);
                return t[i][1] + f * (t[i + 1][1] - t[i][1]);
            }
        }
        return t[0][1];
    }

    private m_scene: THREE.Scene;
    private m_camera: THREE.OrthographicCamera;
    private m_mesh: THREE.Mesh | null = null;
    private m_material: THREE.ShaderMaterial | null = null;

    constructor(
        private m_mapView: MapView,
        private m_getFogState: () => {
            enabled: boolean;
            color: THREE.Color;
            alpha: number;
            bgAlpha: number;
            r0: number;
            r1: number;
            shift: number;
            distCam: number;
            hasBackground: boolean;
            hasContentLayers?: boolean;
            hasSky: boolean;
            bgColor: THREE.Color | null;
        } | null,
    ) {
        this.m_scene = new THREE.Scene();
        this.m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }

    /** Draw the background fog gradient. Call once per frame from AfterRender. */
    run(): void {
        const state = this.m_getFogState();
        if (!state || !state.enabled || state.alpha <= 0.001) return;
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        if (!renderer) return;

        const cam = this.m_mapView.camera as THREE.PerspectiveCamera | undefined;
        if (!cam) return;
        const dir = cam.getWorldDirection(new THREE.Vector3());
        const pitchDeg = Math.acos(Math.min(1, Math.max(-1, -dir.z))) * 180 / Math.PI;
        // The gradient is calibrated (s table) for the fog/2d + fog/color
        // pitch-70 family. Outside 60..75 the rig's pitch-80 sky/raster
        // geometry diverges from mgl and the quad only adds error (§181) —
        // skip it there (background keeps the flat clear color as before).
        // Exception: explicit-sky-layer styles with a background layer
        // (horizon-blend family, pitch 85) — mgl fogs the background tiles
        // at any pitch and the expected images show the whitened band.
        // The engine background plane carries the fog chunk with the a²
        // semantics and the mgl tile ramp — above 76° it alone matches the
        // expected band better (§190/§193 measurements); 60..76 keeps the
        // calibrated quad (fog/color family).
        if (pitchDeg < 60 || pitchDeg > 76) return;

        this.ensureMesh();
        if (!this.m_mesh || !this.m_material) return;

        this.m_material.uniforms.uFogColor.value.copy(state.color);
        this.m_material.uniforms.uFogAlpha.value =
            Number.isFinite(state.bgAlpha) && state.bgAlpha > 0 ? state.bgAlpha : state.alpha;
        this.m_material.uniforms.uR0.value = state.r0;
        this.m_material.uniforms.uR1.value = state.r1;
        this.m_material.uniforms.uShift.value = state.shift;
        this.m_material.uniforms.uDistCam.value = Math.max(state.distCam, 1);
        // Per-pitch scale table (two-point calibrated §180/§181): linear in
        // pitch, clamped at the ends.
        this.m_material.uniforms.uScale.value = MBBackgroundFogRenderer.scaleForPitch(pitchDeg);
        // §198: with the engine plane removed, the quad's depth test alone
        // separates background (clear color) from content tiles — transparent
        // blending is correct again; opaque mode covered content (heatmap).
        this.m_material.uniforms.uOpaque.value = 0;
        if (state.bgColor) (this.m_material.uniforms.uBgColor.value as THREE.Color).copy(state.bgColor);
        this.m_material.uniforms.uCamHeight.value = Math.max(cam.position.z, 1);
        // Camera world→view rotation as mat3 for ray reconstruction.
        this.m_material.uniforms.uCamMatrix.value.copy(cam.matrixWorld);
        this.m_material.uniforms.uInvProj.value.copy(cam.projectionMatrixInverse);
        // Screen-horizon params (same semantics as the sky shaders, §188).
        const cv = (this.m_mapView as any).canvas as HTMLCanvasElement | undefined;
        this.m_material.uniforms.uHeight.value = cv?.clientHeight || cv?.height || 256;
        this.m_material.uniforms.uFovRad.value = (cam.fov ?? 36.87) * Math.PI / 180;
        // Use the tilt PROPERTY (same source as the sky shaders' horizon
        // line) — the camera-derived pitch differs slightly and opens a 1px
        // seam between the two cuts (§188).
        this.m_material.uniforms.uPitchRad.value =
            Math.max(((this.m_mapView as any).tilt as number | undefined) ?? pitchDeg, 0.1) * Math.PI / 180;

        const prevAutoClear = renderer.autoClear;
        const prevRT = renderer.getRenderTarget();
        try {
            renderer.autoClear = false;
            renderer.setScissorTest(false);
            renderer.setRenderTarget(null);
            renderer.render(this.m_scene, this.m_camera);
        } finally {
            renderer.setRenderTarget(prevRT);
            renderer.autoClear = prevAutoClear;
        }
    }

    private ensureMesh(): void {
        if (this.m_mesh) return;
        const material = new THREE.ShaderMaterial({
            transparent: true,
            depthTest: true,
            depthWrite: false,
            uniforms: {
                uFogColor: { value: new THREE.Color(1, 1, 1) },
                uFogAlpha: { value: 1 },
                uR0: { value: -0.5 },
                uR1: { value: 2.5 },
                uShift: { value: 1.5 },
                uDistCam: { value: 1000 },
                uScale: { value: 0.735 },
                uCamHeight: { value: 1000 },
                uCamMatrix: { value: new THREE.Matrix4() },
                uInvProj: { value: new THREE.Matrix4() },
                uHeight: { value: 256 },
                uBgColor: { value: new THREE.Color(0.96, 0.96, 0.86) },
                uOpaque: { value: 0 },
                uFovRad: { value: 36.87 * Math.PI / 180 },
                uPitchRad: { value: 60 * Math.PI / 180 },
            },
            vertexShader: `
                varying vec2 vNdc;
                void main() {
                    vNdc = position.xy;
                    gl_Position = vec4(position.xy, 0.9999, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uFogColor;
                uniform float uFogAlpha;
                uniform float uR0;
                uniform float uR1;
                uniform float uShift;
                uniform float uDistCam;
                uniform float uScale;
                uniform float uCamHeight;
                uniform mat4 uCamMatrix;
                uniform mat4 uInvProj;
                uniform float uHeight;
                uniform float uFovRad;
                uniform float uPitchRad;
                uniform vec3 uBgColor;
                uniform float uOpaque;
                varying vec2 vNdc;
                void main() {
                    // Reconstruct the world-space view ray from NDC.
                    vec4 view = uInvProj * vec4(vNdc, -1.0, 1.0);
                    vec3 dir = normalize((uCamMatrix * vec4(view.xyz / view.w, 0.0)).xyz);
                    // mgl's background tiles (and their fog band) start at
                    // the SCREEN horizon line (transform.horizonLineFromTop
                    // with the 0.1 shift) — a few px BELOW the true horizon
                    // (§188), matching the sky shaders' cut.
                    float hPx = uHeight / 2.0 / tan(uFovRad / 2.0) / tan(max(uPitchRad, 0.1));
                    float horizonFromTop = (uHeight / 2.0 - hPx * 0.9) / uHeight;
                    if (vNdc.y * 0.5 + 0.5 > 1.0 - horizonFromTop) {
                        // Above the screen horizon line — the sky owns it.
                        discard;
                    }
                    // Ray ∩ ground-plane distance (z-up, camera at height uCamHeight).
                    float rayLen = uCamHeight / (-dir.z);
                    // mgl _prelude_fog: depth = length(fog_matrix * pos) with a
                    // uniform fog matrix scale shift/distCam → depth = shift * L / distCam
                    // (RAY length); ramp = fog_opacity((depth - r0)/(r1 - r0)) =
                    // 1.00747 * (1 - exp(-6t))^3 (NOT smoothstep); below-horizon
                    // rays keep full horizon blending (t = max(0, dir.z/hb) = 0).
                    // mgl _prelude_fog exact: t = (depth - (r0+shift)) / (r1-r0)
                    // (the FOV shift is added to BOTH range ends — screen center
                    // lands at depth = shift), depth = |fogMatrix * pos| = ray
                    // length in fog space, and the ramp is the exp-cube
                    // fog_opacity curve (NOT smoothstep). The 0.735 folds the
                    // residual engine↔mgl fog-space scale (same family as the
                    // content fog's kFog=3.7; calibrated on fog/color §180).
                    float depth = uScale * uShift * rayLen / uDistCam;
                    float t = (depth - (uR0 + uShift)) / max(uR1 - uR0, 0.001);
                    float falloff = 1.0 - min(1.0, exp(-6.0 * t));
                    falloff *= falloff * falloff;
                    float opacity = min(1.0, 1.00747 * falloff);
                    // mgl content fog = fog_opacity (carries color.a) ×
                    // fog_horizon_blending (carries color.a AGAIN; the
                    // quad only paints below the horizon where the blend
                    // factor is exactly a) — so the effective alpha is a².
                    opacity *= uFogAlpha;
                    // uFogColor is a LINEAR THREE.Color; this raw
                    // ShaderMaterial must encode to sRGB itself.
                    vec3 fogSrgb = mix(uFogColor * 12.92,
                        pow(uFogColor, vec3(1.0 / 2.4)) * 1.055 - 0.055,
                        vec3(greaterThan(uFogColor, vec3(0.0031308))));
                    if (uOpaque > 0.5) {
                        // Opaque composite: the engine background plane's own
                        // fog (shared built-in uniforms, cannot be bypassed
                        // per-material) would double-apply under the quad —
                        // output the full mgl composite over the background
                        // color instead (§194).
                        gl_FragColor = vec4(mix(uBgColor, fogSrgb, uFogAlpha * opacity), 1.0);
                    } else {
                        gl_FragColor = vec4(fogSrgb, uFogAlpha * opacity);
                    }
                }
            `,
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        mesh.frustumCulled = false;
        this.m_scene.add(mesh);
        this.m_mesh = mesh;
        this.m_material = material;
    }

    dispose(): void {
        if (this.m_mesh) {
            this.m_mesh.geometry.dispose();
            this.m_mesh = null;
        }
        this.m_material?.dispose();
        this.m_material = null;
    }
}
