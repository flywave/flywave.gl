import * as THREE from 'three';
import { MapView } from '@flywave/flywave-mapview';

/**
 * mgl atmosphere glow as an AfterRender screen-space quad.
 *
 * Port of mapbox-gl-js `draw_atmosphere` + `atmosphere.{vertex,fragment}.glsl`
 * (mercator path): per fragment, the view ray is interpolated from the four
 * frustum corner rays; the horizon ray is the same interpolation at
 * `u_horizon` (the screen-space horizon line from
 * `transform.horizonLineFromTop`: h = height/2/tan(fov/2)/tan(pitch), offset
 * by the 0.1 horizon shift). The gradient is the three-color stop ramp
 * space→high→fog with `t = exp(−(angle/π)/fadeout)`.
 *
 * Drawn through the MBHeatmapRenderer direct-draw channel (§180). Fragments
 * below the horizon line are discarded so map content keeps its own
 * rendering. Gated to pitch > 76 (the legacy dome covers ≤70 and the
 * background-fog quad 60-76, §181/§182).
 */
export class MBAtmosphereRenderer {
    /** Set by the datasource when the style has content layers (§228). */
    static contentStandDown = false;
    private m_scene: THREE.Scene;
    private m_camera: THREE.OrthographicCamera;
    private m_mesh: THREE.Mesh | null = null;
    private m_material: THREE.ShaderMaterial | null = null;

    constructor(
        private m_mapView: MapView,
        private m_getState: () => {
            fogColor: THREE.Color;
            fogAlpha: number;
            highColor: THREE.Color;
            spaceColor: THREE.Color;
            fadeout: number;
        } | null,
    ) {
        this.m_scene = new THREE.Scene();
        this.m_camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }

    /** Draw the atmosphere gradient. Call once per frame from AfterRender. */
    run(): void {
        const state = this.m_getState();
        if (!state) return;
        // §228: content tiles carry their own fog (mgl semantics) — the glow
        // quad must stand down for content-bearing styles (fog/culling).
        if (MBAtmosphereRenderer.contentStandDown) return;
        const renderer = (this.m_mapView as any).renderer as THREE.WebGLRenderer | undefined;
        const cam = this.m_mapView.camera as THREE.PerspectiveCamera | undefined;
        if (!renderer || !cam) return;

        const tilt = (this.m_mapView as any).tilt as number | undefined;
        const pitchDeg = tilt ?? 60;
        // The engine's scene-object filtering drops the legacy dome from
        // ~pitch 70 too (§197 red-probe: 0 px at 70) — this screen-space
        // quad is the sole reliable glow channel from 60° up (it renders
        // directly in AfterRender, outside the scene graph).
        if (pitchDeg < 60) return;

        const canvas = (this.m_mapView as any).canvas as HTMLCanvasElement | undefined;
        // Off-DOM canvas: clientHeight is 0 (not null) — `??` keeps the 0 and
        // NaN-poisons every derived uniform. Use truthy fallbacks (§184).
        const height = canvas?.clientHeight || canvas?.height || 256;
        const fovRad = (cam.fov ?? 36.87) * Math.PI / 180;
        const pitch = Math.max(pitchDeg, 0.1) * Math.PI / 180;
        // mgl transform.horizonLineFromTop: h = height/2/focal/tan(pitch),
        // line = height/2 − h·(1 − horizonShift 0.1); u_horizon = line/height.
        const h = (height / 2) / Math.tan(fovRad / 2) / Math.tan(pitch);
        const uHorizon = (height / 2 - h * 0.9) / height;

        this.ensureMesh();
        if (!this.m_mesh || !this.m_material) return;
        const u = this.m_material.uniforms;
        // Frustum corner view rays in WORLD space (z-up) — same NDC ray
        // reconstruction as the (working) background-fog quad.
        cam.updateMatrixWorld(true);
        const rot = new THREE.Matrix4().extractRotation(cam.matrixWorld);
        const corner = (nx: number, ny: number): THREE.Vector3 => {
            const v = new THREE.Vector3(nx, ny, -1).applyMatrix4(cam.projectionMatrixInverse);
            return v.applyMatrix4(rot).normalize();
        };
        (u.uTl.value as THREE.Vector3).copy(corner(-1, 1));
        (u.uTr.value as THREE.Vector3).copy(corner(1, 1));
        (u.uBr.value as THREE.Vector3).copy(corner(1, -1));
        (u.uBl.value as THREE.Vector3).copy(corner(-1, -1));
        u.uHorizon.value = uHorizon;
        (u.uFogColor.value as THREE.Color).copy(state.fogColor).convertLinearToSRGB();
        u.uFogAlpha.value = state.fogAlpha;
        (u.uHighColor.value as THREE.Color).copy(state.highColor).convertLinearToSRGB();
        (u.uSpaceColor.value as THREE.Color).copy(state.spaceColor).convertLinearToSRGB();
        u.uFadeout.value = Math.max(state.fadeout, 0.0005);

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
            // mgl drawAtmosphere: LEQUAL ReadOnly at max depth — the glow
            // fails the depth test wherever opaque content drew, so it only
            // fills sky gaps (§198; depthTest:false overpainted content).
            transparent: true,
            depthTest: true,
            depthWrite: false,
            uniforms: {
                uTl: { value: new THREE.Vector3(0, 0, -1) },
                uTr: { value: new THREE.Vector3(0, 0, -1) },
                uBr: { value: new THREE.Vector3(0, 0, -1) },
                uBl: { value: new THREE.Vector3(0, 0, -1) },
                uHorizon: { value: 0.25 },
                uFogColor: { value: new THREE.Color(1, 1, 1) },
                uFogAlpha: { value: 1 },
                uHighColor: { value: new THREE.Color(0.14, 0.36, 0.87) },
                uSpaceColor: { value: new THREE.Color(0.01, 0.04, 0.1) },
                uFadeout: { value: 0.025 },
            },
            vertexShader: `
                varying vec2 vNdc;
                void main() {
                    // Same convention as the background-fog quad (§180).
                    vNdc = position.xy;
                    gl_Position = vec4(position.xy, 0.9999, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uTl;
                uniform vec3 uTr;
                uniform vec3 uBr;
                uniform vec3 uBl;
                uniform float uHorizon;
                uniform vec3 uFogColor;
                uniform float uFogAlpha;
                uniform vec3 uHighColor;
                uniform vec3 uSpaceColor;
                uniform float uFadeout;
                varying vec2 vNdc;
                void main() {
                    // a_uv equivalent: v = 1 at the TOP (mgl buffer convention).
                    vec2 a_uv = vec2(vNdc.x * 0.5 + 0.5, vNdc.y * 0.5 + 0.5);
                    vec3 ray = normalize(mix(
                        mix(uTl, uTr, a_uv.x),
                        mix(uBl, uBr, a_uv.x),
                        1.0 - a_uv.y));
                    vec3 horizonDir = normalize(mix(
                        mix(uTl, uBl, uHorizon),
                        mix(uTr, uBr, uHorizon),
                        a_uv.x));
                    // mgl uses mercator y; our world is z-up.
                    if (ray.z < horizonDir.z) {
                        // Below the horizon line — map content owns it.
                        discard;
                    }
                    float horizonAngle = max(
                        acos(clamp(dot(ray, horizonDir), -1.0, 1.0)), 0.0) / 3.14159265359;
                    float t = exp(-horizonAngle / uFadeout);
                    vec3 c0 = mix(uSpaceColor, uHighColor, 1.0);
                    vec3 c1 = mix(c0, uFogColor, uFogAlpha);
                    vec3 c2 = mix(c0, c1, t);
                    // mgl blends the gradient premultiplied over a clear of
                    // space-color: result = space*(1-t) + c2*t.
                    vec3 col = mix(uSpaceColor, c2, t);
                    // mgl has NO color management — atmosphere colors are
                    // sRGB floats mixed DIRECTLY (gamma space). Uniforms are
                    // pre-converted (convertLinearToSRGB) so no encode here
                    // (§191: linear-domain mixing rendered the mid band too
                    // light on fog/2d/basic pitch 80).
                    gl_FragColor = vec4(col, 1.0);
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
