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
    private m_shadowCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    private m_depthMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
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
            map: this.m_rt.depthTexture!,
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
            const depthTexture = new THREE.DepthTexture(size, size);
            this.m_rt = new THREE.WebGLRenderTarget(size, size, {
                depthTexture,
                depthBuffer: true,
            });
        }

        // Frame the ortho shadow camera around the view center in scene
        // space. Radius from the camera distance (single cascade; mgl uses
        // two — refinement deferred to the calibration batch).
        const center = new THREE.Vector3();
        camera.getWorldPosition(center);
        const target = (this.m_mapView as any).worldCenter as THREE.Vector3 | undefined;
        if (target) center.copy(target);
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
            renderer.clear();
            renderer.render(scene, this.m_shadowCamera);
        } finally {
            scene.overrideMaterial = prevOverride;
            renderer.shadowMap.enabled = prevShadowEnabled;
            renderer.setRenderTarget(prevTarget);
            this.m_shadowCamera.layers.mask = prevLayers;
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
        this.m_rt?.dispose();
        this.m_rt = null;
    }
}
