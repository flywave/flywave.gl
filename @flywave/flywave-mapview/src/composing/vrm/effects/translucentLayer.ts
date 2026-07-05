// @ts-nocheck
import { Fn, texture, vec4, vec3, vec2, float, uv } from "three/tsl";

/**
 * TSL post-process node for translucent layer composition.
 *
 * The translucent pass renders ONLY translucent-layer objects (layers bit 10)
 * with a flat white override material. Background is black (0,0,0).
 * Detection: red channel > 0.5 means an object is present.
 *
 * @param mainColor           - Tone-mapped color from the main render pass.
 * @param translucentColorNode - PassNode color texture node (flat white = object, black = empty).
 * @param layerDataTexture    - Raw DataTexture with per-layer config.
 * @param _layerCount          - Number of active layers (unused, single layer).
 */
export const translucentLayer = (
    mainColor,
    translucentColorNode,
    layerDataTexture,
    _layerCount
) => {
    return Fn(() => {
        const color = mainColor.toVar();

        // Flat white pass: background = black (0), object = white (1)
        const hasObject = translucentColorNode.r.greaterThan(0.5);

        // Layer 0 config from data texture
        const texWidth = float(256.0);
        const u0 = float(0.5).div(texWidth);
        const u1 = float(1.5).div(texWidth);

        const pixel0 = texture(layerDataTexture, vec2(u0, 0.5));
        const pixel1 = texture(layerDataTexture, vec2(u1, 0.5));

        const mixFactor = pixel0.r;
        const blendMode = pixel0.g;
        const tintColor = vec3(pixel0.b, pixel0.a, pixel1.r);

        // Blend modes
        const mixBlend = color.rgb.mix(tintColor, mixFactor);
        const addBlend = color.rgb.add(tintColor.mul(mixFactor));
        const multiplyBlend = color.rgb.mix(color.rgb.mul(tintColor), mixFactor);
        const screenBlend = color.rgb.mix(
            float(1.0).sub(float(1.0).sub(color.rgb).mul(float(1.0).sub(tintColor))),
            mixFactor
        );

        const blendedColor = blendMode
            .lessThan(0.5)
            .select(
                mixBlend,
                blendMode
                    .lessThan(1.5)
                    .select(addBlend, blendMode.lessThan(2.5).select(multiplyBlend, screenBlend))
            );

        const result = hasObject.select(vec4(blendedColor, color.a), color);

        return result;
    })();
};
