/* Copyright (C) 2026 flywave.gl contributors */

import { SurfaceType } from "@flywave/flywave-mapview";
import {
    Discard,
    Fn,
    If,
    abs,
    cameraProjectionMatrixInverse,
    cross,
    float,
    max,
    min,
    mix,
    screenUV,
    step,
    vec3,
    vec4,
    clamp
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
 *     4 — containment result: white = inside, dark purple = outside
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

        // Geometry-specific containment, as a 0/1 mask.
        let insideF: any;
        if (mode === "curtain") {
            // Faithful port of PolylineShadowVolumeFS: measure the
            // reconstructed ground point against the segment's three bounding
            // planes (lateral right plane + two miter cap planes). Outside
            // any of them the fragment is not part of the line.
            //
            //   |widthwise| > halfMaxWidth  OR  dStart < 0  OR  dEnd < 0
            //
            // where halfMaxWidth = halfWidthPx * metersPerPixel(reconstructed).
            const halfMaxWidth = context.halfWidthPx.mul(
                metersPerPixel(groundView, context.pixelsPerMeterFactor)
            );

            // Tube containment: distance from the reconstructed ground point
            // to the segment itself (endpoints clamped to [0,1] along it).
            // Unlike a corridor of planes this region cannot slide across
            // slopes as the camera moves.
            const segStart = context.varyings.ecStart;
            const segEnd = context.varyings.ecEnd;
            const segDelta = segEnd.sub(segStart);
            const denom = segDelta.dot(segDelta).max(1e-12);
            const t = clamp(groundView.sub(segStart).dot(segDelta).div(denom), 0, 1);
            const closest = segStart.add(segDelta.mul(t));
            const distanceToSegment = groundView.sub(closest).length();

            insideF = step(distanceToSegment, halfMaxWidth);
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

        let color = vec4(0);
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
