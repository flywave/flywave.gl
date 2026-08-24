/* Copyright (C) 2026 flywave.gl contributors */

import { SurfaceType } from "@flywave/flywave-mapview";
import {
    Discard,
    Fn,
    If,
    abs,
    cameraProjectionMatrixInverse,
    cross,
    clamp,
    float,
    max,
    min,
    mix,
    screenSize,
    screenUV,
    step,
    vec2,
    vec3,
    vec4
} from "three/tsl";

/**
 * Meters per screen pixel at the given view-space position.
 * `pixelsPerMeterFactor` is `2*tan(fovY/2)/viewportHeightPx`, fed from JS so
 * the shader stays free of camera-matrix element typing quirks.
 */
export function metersPerPixel(viewPosition: any, pixelsPerMeterFactor: any) {
    return viewPosition.z.negate().max(1e-6).mul(pixelsPerMeterFactor);
}

export interface DrapedFragmentContext {
    depthTextureNode: any;
    typeTextureNode: any;
    halfWidthPx: any;
    pixelsPerMeterFactor: any;
    colorVec: any;
    allowTerrain: any;
    allowModel: any;
    debug: any;
    probe: any;
    /** Eye-space position of the current fragment's vertex (interpolated). */
    fragEye: any;
    varyings: Record<string, any>;
}

/**
 * Shared fragment logic for both draped volume kinds.
 *
 * The graph is composed purely from expressions (`mix`/`step` masks): inline
 * `Fn()` bodies must not `return` from nested conditionals, so all gates are
 * evaluated as 0/1 masks and combined arithmetically; only `Discard()`
 * statements remain inside `If` blocks.
 *
 * Gates (applied only while neither debugging nor probing):
 * 1. sampled surface type must be non-zero (not sky),
 * 2. the type must be allowed by the current {@link DrapedTarget} filter,
 * 3. the reconstructed ground point must pass geometry containment.
 *
 * Instrumentation:
 * - `debug` > 0.5: render the raw volume solid opaque magenta.
 * - `probe`: encode an intermediate value into the output color instead:
 *     1 — sampled surface type on a red scale (`type / 2`)
 *     2 — raw captured depth on a grayscale
 *     3 — reconstructed view-space distance, kilometers on a grayscale
 *     4+ — containment result: white = inside, dark purple = outside
 */
export function buildDrapedColorNode(mode: "curtain" | "prism", context: DrapedFragmentContext) {
    return Fn(() => {
        const depth = context.depthTextureNode.r;
        const surfaceType = context.typeTextureNode.r;
        const probe = context.probe;

        const rangeMask = (v: any, lo: number, hi: number) =>
            step(float(lo), v).mul(float(1).sub(step(float(hi), v)));

        /** Indicator that `surfaceType` lies within ±0.25 of `center`. */
        const typeBand = (center: number) =>
            float(1).sub(step(float(0.25), surfaceType.sub(float(center)).abs()));

        const typeValid = step(float(SurfaceType.None + 0.25), surfaceType);
        const targetPass = max(
            typeBand(SurfaceType.Terrain).mul(context.allowTerrain),
            typeBand(SurfaceType.Model).mul(context.allowModel)
        );

        // Reconstruct the captured ground position in view space from depth.
        // Convention (verified against PerspectiveCamera.makePerspective):
        // the projection matrix is built for the active coordinate system,
        // so under WebGPU clip Z already spans [0,w] and device depth maps
        // 1:1 onto NDC Z (`z = depth`, no rescale). `screenUV` follows the
        // WebGPU frame convention (origin top-left) while NDC Y grows toward
        // the bottom, hence the Y flip. `cameraProjectionMatrixInverse` is
        // the exact inverse of that same matrix.
        const ndc = vec3(screenUV.x.mul(2).sub(1), screenUV.y.oneMinus().mul(2).sub(1), depth);
        const viewH = cameraProjectionMatrixInverse.mul(vec4(ndc, 1));
        const groundView = viewH.div(viewH.w).xyz;

        // Convention-fit probes (5..8): rebuild the ground point with each
        // candidate uv/depth convention and color by how close it lands to
        // this very fragment. Green (<100 m) marks the correct convention —
        // the volume hugs the terrain, so a valid reconstruction is near.
        // 5: flipY + z=2d-1 · 6: no flip + z=2d-1 · 7: flipY + z=d · 8: no flip + z=d
        const groundWith = (flipY: any, zLinear: any) => {
            const yGL = screenUV.y.mul(2).sub(1);
            const y = mix(yGL, screenUV.y.oneMinus().mul(2).sub(1), flipY);
            const z = mix(depth.mul(2).sub(1), depth, zLinear);
            const vh = cameraProjectionMatrixInverse.mul(vec4(vec3(ndc.x, y, z), 1));
            return vh.div(vh.w).xyz;
        };
        const fitColor = (flipY: number, zLinear: number) => {
            const delta = groundWith(float(flipY), float(zLinear)).sub(context.fragEye).length();
            const c = mix(vec4(0.8, 0, 0, 1), vec4(0.8, 0.6, 0, 1), step(delta, float(500)));
            return mix(c, vec4(0, 0.85, 0, 1), step(delta, float(100)));
        };

        // Geometry-specific containment, as a 0/1 mask.
        let probe13Color: any = vec4(0);
        let probe14Color: any = vec4(0);
        let probe15Color: any = vec4(0);
        let insideF: any;
        if (mode === "curtain") {
            // Screen-space band (GroundPolyline-style): the vertex stage
            // projects the segment endpoints to clip space; here the current
            // pixel's distance to that screen segment decides membership.
            // Constant width in pixels is guaranteed by construction and the
            // result is immune to view angle or reconstruction precision.
            const toScreenUv = (n: any) =>
                vec2(
                    n.x.div(n.w).mul(0.5).add(0.5),
                    n.y.div(n.w).mul(-0.5).add(0.5) // NDC y-up → screenUV y-down
                );
            const uvStart = toScreenUv(context.varyings.ndcStart);
            const uvEnd = toScreenUv(context.varyings.ndcEnd);

            const segDelta = uvEnd.sub(uvStart);
            const denom = segDelta.dot(segDelta).max(1e-12);
            const t = screenUV.sub(uvStart).dot(segDelta).div(denom).clamp(0, 1);
            const closest = uvStart.add(segDelta.mul(t));

            // Aspect-correct pixel distance between this fragment and the segment.
            const deltaPx = closest.sub(screenUV).mul(screenSize);

            // Probes 13/14 — curtain instrumentation:
            // 13: distance field, grayscale over 64 px (dark ridge = the band)
            // 14: degeneracy check — green while the projected endpoints are
            //     distinct, red when they collapse (attribute/projection fault)
            // Probe 15 — self-projection consistency: re-project this very
            // fragment and compare against its own pixel. R channel glows with
            // X-axis error, G with Y-axis error (8 px full scale); black means
            // our NDC→screenUV mapping is exactly the renderer's.
            const selfUv = toScreenUv(context.varyings.ndcSelf);
            const dSelfPx = selfUv.sub(screenUV).mul(screenSize);
            probe15Color = vec4(
                clamp(dSelfPx.x.abs().div(8), 0, 1),
                clamp(dSelfPx.y.abs().div(8), 0, 1),
                0,
                1
            );

            const g13 = float(0.9).sub(clamp(deltaPx.length().div(float(64)), 0, 1).mul(0.9));
            probe13Color = vec4(g13, g13, g13, 1);
            probe14Color = mix(vec4(0.7, 0, 0, 1), vec4(0, 0.85, 0, 1), step(float(1e-10), denom));

            insideF = float(1).sub(step(context.halfWidthPx, deltaPx.length()));
        } else {
            // Containment within the fragment's own footprint triangle via
            // sign tests of scaled triple products (no tangent frame needed).
            const cornerA = context.varyings.cornerA;
            const cornerB = context.varyings.cornerB;
            const cornerC = context.varyings.cornerC;

            const areaNormal = cross(cornerB.sub(cornerA), cornerC.sub(cornerA));

            const wedge = (p: any, a: any, b: any) => areaNormal.dot(cross(a.sub(p), b.sub(p)));

            const sAB = wedge(groundView, cornerA, cornerB);
            const sBC = wedge(groundView, cornerB, cornerC);
            const sCA = wedge(groundView, cornerC, cornerA);

            const minSign = min(min(sAB, sBC), sCA);
            const maxSign = max(max(sAB, sBC), sCA);
            // Inside iff all signs agree (all >= 0 or all <= 0).
            insideF = max(step(float(-1e-4), minSign), float(1).sub(step(float(1e-4), maxSign)));
        }

        // Probe color selection: later mixes win, so lowest probe wins.
        const km = groundView.z.abs().mul(0.001);

        let color = fitColor(0, 1); // probe 8 fallback base
        color = mix(color, fitColor(1, 1), rangeMask(probe, 6.5, 7.5)); // 7
        color = mix(color, fitColor(0, 0), rangeMask(probe, 5.5, 6.5)); // 6
        color = mix(color, fitColor(1, 0), rangeMask(probe, 4.5, 5.5)); // 5
        color = mix(color, probe14Color, rangeMask(probe, 13.5, 14.5)); // 14
        color = mix(color, probe13Color, rangeMask(probe, 12.5, 13.5)); // 13
        color = mix(color, probe15Color, rangeMask(probe, 14.5, 15.5)); // 15
        color = mix(
            color,
            mix(vec4(0.45, 0, 0.45, 1), vec4(1, 1, 1, 1), insideF),
            rangeMask(probe, 3.5, 4.5)
        ); // 4
        color = mix(color, vec4(km, km, km, 1), rangeMask(probe, 2.5, 3.5)); // 3
        color = mix(color, vec4(depth, depth, depth, 1), rangeMask(probe, 1.5, 2.5)); // 2
        color = mix(color, vec4(surfaceType.mul(0.5), 0, 0, 1), rangeMask(probe, 0.5, 1.5)); // 1

        // Debug volumes override everything except nothing; probes override drape.
        color = mix(color, vec4(1, 0, 1, 1), step(float(0.5), context.debug));

        const alpha = context.colorVec.a;
        const drapeColor = vec4(context.colorVec.rgb.mul(alpha), alpha);
        const probeActive = step(float(0.5), probe);
        color = mix(drapeColor, color, max(probeActive, step(float(0.5), context.debug)));

        // Gates are skipped while debugging or probing so instrumentation stays observable.
        const gating = float(1).sub(max(probeActive, step(float(0.5), context.debug)));
        If(gating.mul(float(1).sub(typeValid)).greaterThan(0.5), () => {
            Discard();
        });
        If(gating.mul(float(1).sub(targetPass)).greaterThan(0.5), () => {
            Discard();
        });
        If(gating.mul(float(1).sub(insideF)).greaterThan(0.5), () => {
            Discard();
        });

        return color;
    })();
}
