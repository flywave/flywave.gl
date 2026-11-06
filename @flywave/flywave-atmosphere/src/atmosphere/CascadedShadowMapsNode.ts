/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
import { CSMShadowNode } from "three/examples/jsm/csm/CSMShadowNode.js";
import type {
    type DirectionalLight,
    type PerspectiveCamera,
    type Vector2,
    NodeFrame
} from "three/webgpu";
import { Plane, Vector3 } from "three/webgpu";

declare module "three/examples/jsm/csm/CSMShadowNode.js" {
    interface CSMShadowNode {
        _cascades: Vector2[];
    }
}

const vectorScratch1 = /*#__PURE__*/ new Vector3();
const planeScratch = /*#__PURE__*/ new Plane();

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

    const clampCascades = closestObjectSize < SMALL_OBJECT_SIZE;

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

    if (clampCascades) {
        for (let i = 0; i < cascadeCount; ++i) {
            cascadeDistances[i] = Math.min(cascadeDistances[i], MAX_CASCADE_DISTANCES[i]);
        }
        // Recompute the split ends from the clamped cascade extents.
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

    constructor(light: DirectionalLight) {
        super(light, { cascades: 4, maxFar: 1e5 });
        this.mode = "custom";
        this.customSplitsCallback = (cascadeCount, cameraNear, cameraFar, breaks) =>
            cesiumCascadeSplits(cascadeCount, cameraNear, cameraFar, this.closestObjectSize, breaks);
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
    }
}
