/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type {
    type DirectionalLight,
    type PerspectiveCamera,
    type Vector2,
    NodeFrame
} from "three/webgpu";
import { MathUtils, Matrix4, Plane, Vector3 } from "three/webgpu";

declare module "three/examples/jsm/csm/CSMShadowNode.js" {
    interface CSMShadowNode {
        _cascades: Vector2[];
    }
}

const vectorScratch1 = /*@__PURE__*/ new Vector3();
const vectorScratch2 = /*@__PURE__*/ new Vector3();
const vectorScratch3 = /*@__PURE__*/ new Vector3();
const planeScratch = /*@__PURE__*/ new Plane();

/** Minimal shape of a shadow-casting scene object used by the caster filter. */
interface ICasterCandidate {
    castShadow?: boolean;
    visible: boolean;
    isInstancedMesh?: boolean;
    geometry?: {
        boundingSphere?: { radius: number; center: Vector3 } | null;
        computeBoundingSphere?: () => void;
    };
    matrixWorld: Matrix4;
}

/**
 * Cesium-style cascade split scheme (CesiumJS ShadowMap.js computeCascades):
 *
 * - Heavily log-biased split mix (`lerp(uniform, log, 0.9)`) concentrates the first
 *   cascades near the camera — three's default practical split (λ=0.5) gives cascade 0
 *   a far larger share and starves near-receiver resolution on planetary ranges.
 * - When only SMALL objects are near the camera (`closestObjectSize < 200 m`), each
 *   cascade's depth extent is clamped to `MAX_CASCADE_DISTANCES` ([25, 150, 700, ∞]) so
 *   near-cascade resolution is decoupled from the total shadow range: even at a 5 km
 *   range, cascade 0 stays at a ~2.4 cm texel on a 2048² map. Big near objects skip the
 *   clamp so tall casters are not sliced.
 */
const SPLIT_LAMBDA = 0.9;
const SMALL_OBJECT_SIZE = 200.0;
/**
 * Cesium ships [25, 150, 700] because its shadow camera has a caster-extension pass
 * (`fitShadowMapToScene` projects the whole scene into each cascade) — a caster just
 * outside a cascade slice still lands in that cascade's depth map. three's CSMShadowNode
 * fits each cascade's ortho box to the VIEW SLICE only, so a shadow crossing a cascade
 * boundary is cut in half (near half drawn, far half empty). At this engine's typical
 * viewing distances (a ~25 m character with a ~3 m shadow) a 25 m cascade-0 depth puts
 * the boundary mid-shadow and halves the shadow. Widen the near cascades so everyday
 * near-field shadows stay inside one cascade; texel at cascade 0 is still ~10 cm.
 */
const MAX_CASCADE_DISTANCES = [100.0, 300.0, 1000.0, Number.MAX_VALUE];

/**
 * Cascade far-depth ends in three's `customSplitsCallback` convention: `breaks.length ===
 * cascadeCount`, each entry the normalized (÷ `cameraFar`) far depth of cascade i — the
 * Cesium scheme converted from its own absolute `splits[0..cascadeCount]` convention.
 */
function cesiumCascadeSplits(
    cascadeCount: number,
    cameraNear: number,
    cameraFar: number,
    closestObjectSize: number,
    breaks: number[]
): void {
    const range = cameraFar - cameraNear;
    const ratio = cameraFar / cameraNear;

    // Smooth the clamp between unclamped and clamped splits over a band around
    // SMALL_OBJECT_SIZE. A hard boolean here changes the cascade ranges in one
    // step when the camera's height above terrain crosses the threshold; with
    // per-cascade caster culling that step also swaps hundreds of casters in and
    // out of the shadow passes at once, which reads as a one-frame shadow flash.
    const clampBlend = 100;
    const clampFactor = Math.min(
        1,
        Math.max(0, (SMALL_OBJECT_SIZE - closestObjectSize) / clampBlend)
    );

    breaks.length = cascadeCount;

    const cascadeDistances: number[] = [];
    let prevEnd = cameraNear;
    for (let i = 0; i < cascadeCount; ++i) {
        const p = (i + 1) / cascadeCount;
        const logScale = cameraNear * Math.pow(ratio, p);
        const uniformScale = cameraNear + range * p;
        // Cesium: lerp(uniform, log, lambda)
        const end = uniformScale + (logScale - uniformScale) * SPLIT_LAMBDA;
        breaks[i] = end / cameraFar;
        cascadeDistances[i] = end - prevEnd;
        prevEnd = end;
    }

    if (clampFactor > 0) {
        for (let i = 0; i < cascadeCount; ++i) {
            const clamped = Math.min(cascadeDistances[i], MAX_CASCADE_DISTANCES[i]);
            cascadeDistances[i] += (clamped - cascadeDistances[i]) * clampFactor;
        }
        // Recompute the split ends from the (blended) cascade extents.
        let distance = cameraNear;
        for (let i = 0; i < cascadeCount; ++i) {
            distance += cascadeDistances[i];
            breaks[i] = distance / cameraFar;
        }
    }
}

export class CascadedShadowMapsNode extends CSMShadowNode {
    declare camera: PerspectiveCamera;
    declare light: DirectionalLight;

    /**
     * Size (m) of the closest shadow receiver/caster to the camera, set per frame by the
     * AtmosphereSystem. Below {@link SMALL_OBJECT_SIZE} the cascades are clamped to
     * {@link MAX_CASCADE_DISTANCES} depths (Cesium behavior). Large default = no clamping.
     */
    closestObjectSize: number = 1000;

    /**
     * Per-cascade caster culling (engine-level experiment).
     *
     * three's CSM culls casters only against each cascade's light-space ortho box. That box
     * is huge in depth (originally a 60 km shadow camera far) and grows laterally with the
     * cascade distance, so a compact scene is submitted into every cascade: a stress scene
     * with 800 separate trees produced ~3000 shadow draw calls (81% of the frame), with all
     * 800 trees drawn into cascades whose receiver slices are kilometres away — a 15 m tree
     * cannot cast a 2.7 km shadow.
     *
     * This filter tests, per cascade, whether the caster's shadow volume (its bounding
     * sphere swept along the light for the shadow reach) can intersect that cascade's
     * receiver slice (the camera frustum between the cascade's view depths). It removes
     * only casters that physically cannot contribute; the visible shadow range, cascade
     * count and map size are untouched.
     *
     * Conservative by construction: the sweep reach is `radius / sin(sunElevation)`
     * (the shadow length of a caster of that radius), clamped to `casterReachMax`.
     */
    depthBoundedCasters = true;
    /**
     * Sine of the sun elevation, refreshed by the AtmosphereSystem each frame. The
     * default (0.2 ≈ 11.5°) is conservative until the first update arrives.
     */
    sunElevationSin = 0.2;

    /** Hard cap for the sweep length (m); avoids absurd sweeps for huge objects. */
    casterReachMax = 2000;

    private readonly m_sliceDepths: Array<[number, number]> = [];
    private readonly m_viewMatrixInverse = new Matrix4();
    private readonly m_lightDirection = new Vector3();
    private m_tanX = 0;
    private m_tanY = 0;

    private m_patchedRenderer?: { render: (...args: any[]) => any };
    private m_originalRender?: (...args: any[]) => any;

    constructor(light: DirectionalLight) {
        super(light, { cascades: 4, maxFar: 1e5 });
        this.mode = "custom";
        this.customSplitsCallback = (cascadeCount, cameraNear, cameraFar, breaks) => {
            cesiumCascadeSplits(
                cascadeCount,
                cameraNear,
                cameraFar,
                this.closestObjectSize,
                breaks
            );
        };
    }

    /**
     * three's `updateFrustums` walks `this.lights`, which is only populated by `_init()`
     * during the renderer's first shadow pass. Skip until that state is consistent — the
     * renderer itself calls `updateFrustums` right after `_init`, so nothing is lost.
     */
    override updateFrustums(): void {
        if (this.camera == null || this.lights.length !== this.cascades) {
            return;
        }
        super.updateFrustums();
    }

    /** Patch the renderer once the CSM node is initialized by the first shadow pass. */
    override _init(builder: any): void {
        super._init(builder);
        this.patchRenderer(builder.renderer);
    }

    override updateBefore(frame: NodeFrame): void {
        super.updateBefore(frame);

        const { lights } = this;
        if (lights.length < 2) {
            return;
        }

        const lastLight = lights[lights.length - 1];
        const lightDirection = vectorScratch1
            .subVectors(lastLight.target.position, lastLight.position)
            .normalize();
        const nearPlane = planeScratch.setFromNormalAndCoplanarPoint(
            lightDirection,
            lastLight.position
        );
        for (let i = 0; i < lights.length - 1; ++i) {
            const light = lights[i];
            nearPlane.projectPoint(light.position, light.position);
            light.target.position.copy(light.position).add(lightDirection);
        }

        // Cache the data the per-cascade caster filter needs for this frame.
        this.m_lightDirection.copy(lightDirection);
        this.updateCascadeSlices();
    }

    override dispose(): void {
        const renderer = this.m_patchedRenderer;
        if (renderer != null && this.m_originalRender != null) {
            renderer.render = this.m_originalRender;
        }
        this.m_patchedRenderer = undefined;
        this.m_originalRender = undefined;
        super.dispose();
    }

    /**
     * Receiver slice depths (metres along the view direction) for every cascade, plus the
     * view matrix and frustum tangents used by {@link isCasterRelevant}.
     */
    private updateCascadeSlices(): void {
        const camera = this.camera;
        const lights = this.lights;
        if (camera == null || lights.length === 0) {
            return;
        }
        camera.updateMatrixWorld();
        this.m_viewMatrixInverse.copy(camera.matrixWorld).invert();
        const tanY = Math.tan(MathUtils.degToRad(camera.fov / 2));
        this.m_tanY = tanY;
        this.m_tanX = tanY * Math.max(camera.aspect, 1e-3);

        this.m_sliceDepths.length = 0;
        for (let i = 0; i < lights.length; i++) {
            const nearDepth = (i === 0 ? 0 : this.breaks[i - 1] ?? 0) * this.maxFar;
            const farDepth = (this.breaks[i] ?? 1) * this.maxFar;
            this.m_sliceDepths.push([nearDepth, farDepth]);
        }
    }

    /**
     * Wrap `renderer.render` so the shadow pass of each cascade gets a filtered scene.
     * `CSMShadowNode` renders every cascade through `renderer.render(scene, shadowCamera)`;
     * the main pipeline does not use that entry point, so the wrapper only affects shadows.
     */
    private patchRenderer(renderer: any): void {
        if (renderer == null || this.m_patchedRenderer === renderer) {
            return;
        }
        if (this.m_patchedRenderer != null && this.m_originalRender != null) {
            this.m_patchedRenderer.render = this.m_originalRender;
        }
        const original = renderer.render.bind(renderer);
        this.m_patchedRenderer = renderer;
        this.m_originalRender = original;
        renderer.render = (scene: any, camera: any, ...rest: any[]) => {
            const cascade = this.lights.findIndex(
                (candidate: any) => candidate.shadow.camera === camera
            );
            if (cascade < 0) {
                return original(scene, camera, ...rest);
            }
            const hidden = this.filterCasters(scene, cascade);
            try {
                return original(scene, camera, ...rest);
            } finally {
                for (const object of hidden) {
                    object.visible = true;
                }
            }
        };
    }

    /**
     * Hide every caster that cannot cast into the given cascade's receiver slice and
     * return the objects so the caller can restore them.
     */
    private filterCasters(scene: any, cascade: number): any[] {
        if (!this.depthBoundedCasters) return [];
        const slice = this.m_sliceDepths[cascade];
        if (slice == null) return [];
        const root = scene as { traverse(callback: (object: ICasterCandidate) => void): void };

        const hidden: any[] = [];
        root.traverse((object: ICasterCandidate) => {
            if (object.castShadow !== true || object.visible !== true) return;
            // A batched mesh is a single draw per cascade; not worth per-instance logic.
            if (object.isInstancedMesh === true) return;
            const geometry = object.geometry;
            if (geometry == null) return;
            if (geometry.boundingSphere == null && geometry.computeBoundingSphere != null) {
                geometry.computeBoundingSphere();
            }
            const sphere = geometry.boundingSphere;
            if (sphere == null) return;

            const e = object.matrixWorld.elements;
            const scale = Math.max(
                Math.hypot(e[0], e[1], e[2]),
                Math.hypot(e[4], e[5], e[6]),
                Math.hypot(e[8], e[9], e[10])
            );
            const radius = Math.max(sphere.radius * scale, 0.01);
            // Conservative shadow length along the light. A caster's TOP can be up to
            // 2*radius above the ground (sphere touching the ground + full diameter),
            // and its shadow travels topHeight / sin(elevation). Add the radius so the
            // swept capsule also covers the sphere's far side. Using only
            // radius / sin(elevation) under-estimated tall merged geometries (MVT
            // tiles with skyscrapers showed missing shadows at the tile edge).
            const reach = Math.min(
                this.casterReachMax,
                2 * radius + radius / Math.max(this.sunElevationSin, 0.05)
            );
            vectorScratch3.copy(sphere.center).applyMatrix4(object.matrixWorld);

            if (!this.isCasterRelevant(vectorScratch3, radius, reach, slice)) {
                object.visible = false;
                hidden.push(object);
            }
        });
        return hidden;
    }

    /**
     * Sweep-test the caster's bounding sphere along the light direction against the
     * cascade's receiver slice (a perspective frustum between two view depths). Five
     * samples along the sweep approximate a capsule; the radius is inflated by half a
     * sample gap so a thin slice cannot slip between samples.
     */
    private isCasterRelevant(
        center: Vector3,
        radius: number,
        reach: number,
        slice: [number, number]
    ): boolean {
        const [nearDepth, farDepth] = slice;
        const steps = 5;
        // Keep borderline casters: a small margin prevents a caster from
        // flipping in/out when the cascade splits or the camera shift by a few
        // metres, which would read as a shadow flicker.
        const sliceMargin = Math.max(25, (farDepth - nearDepth) * 0.05);
        const margin = radius + reach / (2 * (steps - 1)) + sliceMargin;
        for (let step = 0; step < steps; step++) {
            vectorScratch2
                .copy(center)
                .addScaledVector(this.m_lightDirection, reach * (step / (steps - 1)));
            vectorScratch2.applyMatrix4(this.m_viewMatrixInverse);
            const depth = -vectorScratch2.z;
            if (depth < nearDepth - margin || depth > farDepth + margin) {
                continue;
            }
            if (
                Math.abs(vectorScratch2.x) <= depth * this.m_tanX + margin &&
                Math.abs(vectorScratch2.y) <= depth * this.m_tanY + margin
            ) {
                return true;
            }
        }
        return false;
    }
}
