// @ts-nocheck
import * as THREE from "three/webgpu";
import { Fn, uniform, ivec2, screenUV, vec3, vec4, mix } from "three/tsl";

/**
 * Selective mesh outline via mask morphology.
 *
 * Draws `edgeColor` as a ring around the visible silhouette of outlined
 * objects: the ring is `dilate(mask) && !erode(mask)` over ~`thickness`
 * pixels. The mask is the `outlineMask` MRT channel written by objects
 * registered through `mapRenderingManager.addOutlineObject`; everything else
 * writes 0. Deliberately does NOT read the depth buffer — depth central-
 * differences fire on tile seams / LOD skirts and would paint strokes over
 * the whole basemap.
 *
 * Texel addressing follows the proven pattern from flywave-atmosphere
 * (`tsl/sampling.ts`): integer coords are derived from screenUV × texture
 * size as `ivec2.toConst()` — never `screenCoordinate.toUint()` mixed with
 * float offsets, which miscompiles into column artifacts.
 *
 * Caveat: features thinner than the tap span (≈2·thickness px) fall entirely
 * outside the eroded interior and render solid `edgeColor`.
 *
 * @param inputNode   color so far in the post chain (post tone mapping / AA)
 * @param maskTexture scene pass `outlineMask` MRT texture (0 or 1 per pixel)
 * @param thickness   ring width in pixels (dilation radius)
 * @param edgeColor   CSS color of the ring
 */
export const outline = (inputNode, maskTexture, thickness = 2, edgeColor = "#ffffff") => {
    const c = uniform(new THREE.Color(edgeColor));

    return Fn(() => {
        const coord = ivec2(screenUV.mul(maskTexture.size())).toConst();

        // Fixed tap pattern: center + cross + diagonals at half/full radius.
        const r = Math.max(1, Math.round(thickness));
        const half = Math.max(1, Math.floor(r / 2));
        const taps = [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
            [half, half],
            [-half, half],
            [half, -half],
            [-half, -half]
        ];
        if (r > 2) {
            taps.push([r, 0], [-r, 0], [0, r], [0, -r]);
        }

        let dilated = null;
        let eroded = null;
        for (const [ox, oy] of taps) {
            const sample = maskTexture.load(coord.add(ivec2(ox, oy))).r;
            dilated = dilated == null ? sample : dilated.max(sample);
            eroded = eroded == null ? sample : eroded.min(sample);
        }

        const ring = dilated.mul(eroded.oneMinus());
        return mix(inputNode, vec4(vec3(c), 1), ring);
    })();
};
