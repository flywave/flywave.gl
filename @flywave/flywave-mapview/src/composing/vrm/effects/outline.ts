/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
import { float, Fn, mix, screenUV, uniform, vec2, vec3, vec4 } from "three/tsl";
import * as THREE from "three/webgpu";

/**
 * Temporary debugging aid: set to true to visualize the raw mask reads
 * instead of the ring (R = dilated mask, G = eroded mask, B = ring).
 */
export const OUTLINE_DEBUG = false;

/** Bias (in reversed-depth units) for the outline-vs-scene occlusion test. */
const OCCLUSION_BIAS = 1e-6;

/**
 * Selective mesh outline via mask morphology over a dedicated depth prepass.
 *
 * Draws a ring around the silhouette of the objects registered through
 * `mapRenderingManager.addOutlineObject`. The mask source is the depth
 * texture of the outline-only pass that ViewRenderManager builds over
 * `OUTLINE_LAYER_BIT` objects with a fresh depth buffer. The engine uses a
 * REVERSED depth buffer (`MapView`: reversedDepthBuffer: true), so the pass
 * clears to 0 and any outlined-object fragment writes > 0, while occluders
 * from the main scene are simply not part of this pass. The ring is
 * `dilate(mask) && !erode(mask)` over ~`thickness` pixels.
 *
 * Modes:
 * - `xray` (default): the ring follows the FULL silhouette, including parts
 *   hidden behind other geometry. With `hiddenColor` set, the occluded ring
 *   sections are painted in that color instead (classic "bright visible /
 *   dim hidden" selection look).
 * - `xray: false`: only the VISIBLE silhouette is outlined — mask taps are
 *   gated by an outline-depth vs main-scene-depth occlusion test.
 *
 * Deliberately does NOT run depth central-differences on the main scene
 * depth buffer — tile seams / LOD skirts would paint strokes over the whole
 * basemap.
 *
 * Sampling uses UV `texture()` taps (the engine-proven path for render-target
 * textures, cf. aerial perspective / TAA), never `textureLoad`: integer-coord
 * loads read zeros in the post chain on WebGPU.
 *
 * Caveat: features thinner than the tap span (≈2·thickness px) fall entirely
 * outside the eroded interior and render solid ring color. Transparent
 * fragments that don't write depth leave holes in the mask.
 *
 * @param inputNode          color so far in the post chain (post tone
 *                           mapping / AA)
 * @param depthTexture       depth texture of the outline-only mask pass
 * @param thickness          ring width in pixels (dilation radius)
 * @param edgeColor          CSS color of the ring
 * @param sceneDepthTexture  main scene pass depth (required unless plain
 *                           xray without hiddenColor)
 * @param hiddenColor        CSS color for occluded ring sections (xray only)
 * @param xray               full-silhouette mode, default true
 */
export const outline = (
    inputNode,
    depthTexture,
    thickness = 2,
    edgeColor = "#ffffff",
    {
        sceneDepthTexture,
        hiddenColor,
        xray = true
    }: { sceneDepthTexture?: unknown; hiddenColor?: string; xray?: boolean } = {}
) => {
    const c = uniform(new THREE.Color(edgeColor));
    const needsOcclusionTest = !xray || hiddenColor != null;
    const hiddenC = uniform(new THREE.Color(hiddenColor ?? edgeColor));
    const bias = uniform(OCCLUSION_BIAS);

    return Fn(() => {
        const uv = screenUV.toConst();
        // Integer texel coord of this pixel; taps are whole-texel offsets so
        // the ring width stays pixel-accurate.
        const texel = uv.mul(depthTexture.size()).sub(0.5).floor().toConst();

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

        const sampleMask = offset => {
            // + 0.5 lands on the texel center of the integer texel coord.
            const p = texel.add(offset).add(0.5).div(depthTexture.size());
            const d = depthTexture.sample(p).r;
            // Reversed depth: geometry > 0 (clear value), empty = 0. For the
            // visible-only mode the tap is additionally gated by the main
            // scene depth: the outlined fragment survives only where it is
            // not behind the scene surface.
            let m = d.greaterThan(float(0)).select(float(1), float(0));
            if (needsOcclusionTest) {
                const sd = sceneDepthTexture.sample(p).r;
                const inFront = d.greaterThan(sd.sub(bias)).select(float(1), float(0));
                m = m.mul(inFront);
            }
            return m;
        };

        // Morphology over 0/1 tap values: dilated (ANY tap inside the
        // silhouette) ⇔ max(mask) = 1; eroded (ALL taps inside) ⇔
        // min(mask) = 1.
        let dMax = null;
        let dMin = null;
        for (const [ox, oy] of taps) {
            const m = sampleMask(vec2(ox, oy));
            dMax = dMax == null ? m : dMax.max(m);
            dMin = dMin == null ? m : dMin.min(m);
        }
        const dilated = dMax;
        const eroded = dMin;
        const ring = dilated.mul(eroded.oneMinus());

        if (OUTLINE_DEBUG) {
            return vec4(dilated, eroded, ring, 1);
        }

        if (!xray) {
            return mix(inputNode, vec4(vec3(c), 1), ring);
        }

        if (hiddenColor == null) {
            return mix(inputNode, vec4(vec3(c), 1), ring);
        }

        // X-ray with a separate occluded color: ring of the visible mask is
        // painted `color`, the remainder of the full ring `hiddenColor`.
        let vMax = null;
        let vMin = null;
        for (const [ox, oy] of taps) {
            const p = texel.add(vec2(ox, oy)).add(0.5).div(depthTexture.size());
            const d = depthTexture.sample(p).r;
            const sd = sceneDepthTexture.sample(p).r;
            const m = d
                .greaterThan(float(0))
                .select(float(1), float(0))
                .mul(d.greaterThan(sd.sub(bias)).select(float(1), float(0)));
            vMax = vMax == null ? m : vMax.max(m);
            vMin = vMin == null ? m : vMin.min(m);
        }
        const ringVisible = vMax.mul(vMin.oneMinus());
        const ringHidden = ring.mul(ringVisible.oneMinus());
        return mix(
            mix(inputNode, vec4(vec3(hiddenC), 1), ringHidden),
            vec4(vec3(c), 1),
            ringVisible
        );
    })();
};
