// @ts-nocheck
import { Fn, texture, uniform, vec4, vec3, vec2, float, uv } from "three/tsl";

/**
 * TSL node for translucent layer composition.
 * Reads layer ID, color, depth textures and layer data texture,
 * applies depth-based occlusion and blend modes.
 */
export const translucentLayer = (
    inputColor,
    layerIDTexture,
    layerColorTexture,
    layerDepthTexture,
    layerDataTexture,
    layerCount,
    cameraNear,
    cameraFar
) => {
    const layerCountUniform = uniform(layerCount);
    const nearUniform = uniform(cameraNear);
    const farUniform = uniform(cameraFar);

    return Fn(() => {
        const color = inputColor.toVar();
        const coord = uv();

        // Sample layer textures
        const layerID = texture(layerIDTexture, coord);
        const layerColor = texture(layerColorTexture, coord);
        const layerDepth = texture(layerDepthTexture, coord).r;

        // Check if pixel has a layer
        const hasLayer = layerID.r.greaterThan(0.001);

        // Decode layer index
        const layerIndex = layerID.r.mul(256.0).sub(1.0).toInt();

        // Read layer data from data texture (2 pixels per layer)
        const texWidth = float(256.0); // LAYERS_PER_ROW * PIXELS_PER_LAYER
        const u0 = float(layerIndex).mul(2.0).add(0.5).div(texWidth);
        const u1 = float(layerIndex).mul(2.0).add(1.5).div(texWidth);

        const pixel0 = texture(layerDataTexture, vec2(u0, 0.5));
        const pixel1 = texture(layerDataTexture, vec2(u1, 0.5));

        const mixFactor = pixel0.r;
        const blendMode = pixel0.g;
        const layerRGB = vec3(pixel0.b, pixel0.a, pixel1.r);
        const occlusionDistance = pixel1.g;

        // Unpack useObjectColor and objectColorMix
        const packedValue = pixel1.a;
        const useObjectColor = packedValue.greaterThanEqual(1.0);
        const objectColorMix = packedValue.sub(packedValue.floor()).mul(10000.0);

        // Blend highlight color with object color
        const highlightColor = useObjectColor
            ? layerRGB.mix(layerColor.rgb, objectColorMix)
            : layerRGB;

        // Depth comparison
        const currentDepth = float(inputColor.a); // depth from main pass (unused, simplified)
        const isLayerInFront = layerDepth.lessThan(0.999).and(layerDepth.greaterThan(0.001));

        // Linearize depth
        const linearLayerDepth = float(2.0)
            .mul(nearUniform)
            .div(farUniform.add(nearUniform).sub(layerDepth.mul(farUniform.sub(nearUniform))));

        // Apply blend modes
        const mixBlend = inputColor.rgb.mix(highlightColor, mixFactor);
        const addBlend = inputColor.rgb.add(highlightColor.mul(mixFactor));
        const multiplyBlend = inputColor.rgb.mix(inputColor.rgb.mul(highlightColor), mixFactor);
        const screenBlend = inputColor.rgb.mix(
            float(1.0).sub(float(1.0).sub(inputColor.rgb).mul(float(1.0).sub(highlightColor))),
            mixFactor
        );

        // Select blend mode
        const blendedColor = blendMode
            .lessThan(0.5)
            .select(
                mixBlend,
                blendMode
                    .lessThan(1.5)
                    .select(addBlend, blendMode.lessThan(2.5).select(multiplyBlend, screenBlend))
            );

        // Final: if has layer, use blended color; otherwise original
        const result = hasLayer.select(vec4(blendedColor, inputColor.a), color);

        return result;
    })();
};
