/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck
// (TSL node types are intentionally loose — same convention as the other
// effect/node files: bloom, TemporalAntialiasNode, LensFlareNode.)

import {
    depthToViewZ,
    inverseProjectionMatrix,
    projectionMatrix,
    screenToPositionView
} from "@flywave/flywave-atmosphere";
import {
    clamp,
    exp,
    float,
    Fn,
    int,
    Loop,
    select,
    screenCoordinate,
    uniform,
    uniformArray,
    vec3,
    vec4,
    viewportUV
} from "three/tsl";
import { Camera, TextureNode, Vector3, Vector4 } from "three/webgpu";

/**
 * Volumetric light halos (lamp glow through haze): analytic per-light
 * scattering integrated along the view ray up to the scene depth, ported
 * from navara's fogLight (ijdykeman-style closed-form integral). Pure
 * screen-space — no scene geometry, no environmental fog (scene haze stays
 * owned by the atmosphere / FogExp2 stack).
 *
 * Light data lives in fixed-capacity uniform slots; add/remove/reposition of
 * lights only rewrites the arrays and never rebuilds the node graph (same
 * contract as the LUT texture slot). `visibility` is consumed premultiplied
 * at upload time and is reserved for a future per-light occlusion pass.
 */

/** Fixed light slot capacity; lights beyond this count are ignored. */
export const FOG_LIGHT_CAPACITY = 32;

export interface IFogLightUniforms {
    /** Camera-relative light positions, vec3[FOG_LIGHT_CAPACITY] (meters). */
    positions: ReturnType<typeof uniformArray>;
    /** Per light: rgb premultiplied by intensity×visibility, a = radius. */
    data: ReturnType<typeof uniformArray>;
    /** Number of valid slots (≤ FOG_LIGHT_CAPACITY). */
    count: ReturnType<typeof uniform>;
    /** Halo reach along the view ray (1/m). */
    density: ReturnType<typeof uniform>;
    /** Global intensity multiplier. */
    intensity: ReturnType<typeof uniform>;
}

export const createFogLightUniforms = (): IFogLightUniforms => ({
    positions: uniformArray(
        Array.from({ length: FOG_LIGHT_CAPACITY }, () => new (Vector3 as any)()),
        "vec3"
    ),
    data: uniformArray(
        Array.from({ length: FOG_LIGHT_CAPACITY }, () => new (Vector4 as any)(0, 0, 0, 1)),
        "vec4"
    ),
    count: uniform(0),
    density: uniform(0.002),
    intensity: uniform(1)
});

/**
 * Build the additive fog-light inscattering node for the current frame.
 * Inserted into the graph BEFORE bloom (in the linear working space) so the
 * halos stay pre-tonemapping; bright cores can be folded into bloom's input
 * later if the night look needs it.
 */
export const fogLight = (
    depthNode: TextureNode,
    camera: Camera,
    u: IFogLightUniforms,
    webglDepthRead = false
): ReturnType<ReturnType<typeof Fn>> =>
    Fn(() => {
        // Mirror AerialPerspectiveNode's reconstruction exactly (same pass
        // depth texture). The backend decides the depth read: WebGPU resolves
        // .load(screenCoordinate) (texelFetch) while the WebGL backend reads
        // all zeros through it and needs texel-center UV sampling instead.
        const depthSize = depthNode.size();
        const depthUv = viewportUV.mul(depthSize).sub(0.5).floor().add(0.5).div(depthSize);
        const depth = (
            webglDepthRead ? depthNode.sample(depthUv) : depthNode.load(screenCoordinate)
        ).r.toVar();
        const viewZ = depthToViewZ(depth, camera).toVar();
        const positionView = screenToPositionView(
            viewportUV,
            depth,
            viewZ,
            projectionMatrix(camera),
            inverseProjectionMatrix(camera)
        ).toVar();

        const rayDir = positionView.normalize().toVar();
        const rayEnd = positionView.length().toVar();

        const acc = vec3(0).toVar();
        Loop(
            { start: int(0), end: int(FOG_LIGHT_CAPACITY), type: "int", condition: "<" },
            ({ i }) => {
                // Slot beyond the live count contributes exactly 0 — keeps the
                // loop unrollable without dynamic branching.
                const active = select(float(i).lessThan(u.count), float(1), float(0));
                const light = u.positions.element(i).toVar();
                const data = u.data.element(i).toVar();

                // Closest approach of the view ray to the light center.
                const t = clamp(light.dot(rayDir), float(0), rayEnd).toVar();
                const h2 = light.dot(light).sub(t.mul(t)).toVar();

                const radius2 = data.a.mul(data.a).max(float(1));
                const halo = float(1).div(float(1).add(h2.div(radius2)));
                const inscatter = float(1).sub(exp(t.mul(u.density).negate()));

                acc.addAssign(data.rgb.mul(halo).mul(inscatter).mul(active));
            }
        );

        return vec4(acc.mul(u.intensity), 0);
    })();
