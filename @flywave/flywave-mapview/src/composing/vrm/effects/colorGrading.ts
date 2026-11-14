/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
import { Fn, uniform, vec3, vec4 } from "three/tsl";

/**
 * Persistent uniform slots for the analytic color-grading effects. They are
 * owned by the manager (not created inside the node factories) so theme edits
 * can be written into `.value` without a graph rebuild — see
 * `ViewRenderManager.applyUniformParams`.
 */
export const createColorGradingUniforms = () => ({
    brightness: uniform(0),
    contrast: uniform(0),
    saturation: uniform(0),
    sepiaAmount: uniform(0)
});

export const brightnessContrast = (inputNode, u = createColorGradingUniforms()) => {
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        const factor = u.contrast.add(1).max(0.0001);
        const result = color.sub(0.5).mul(factor).add(0.5).add(u.brightness);
        return vec4(result, 1);
    })();
};

export const hueSaturation = (inputNode, u = createColorGradingUniforms()) => {
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        const lum = color.dot(vec3(0.299, 0.587, 0.114));
        const result = color.sub(lum).mul(u.saturation.add(1)).add(lum);
        return vec4(result, 1);
    })();
};

export const sepia = (inputNode, u = createColorGradingUniforms()) => {
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        const r = color.x;
        const g = color.y;
        const b = color.z;
        const sr = r.mul(0.393).add(g.mul(0.769)).add(b.mul(0.189));
        const sg = r.mul(0.349).add(g.mul(0.686)).add(b.mul(0.168));
        const sb = r.mul(0.272).add(g.mul(0.534)).add(b.mul(0.131));
        const sepiaColor = vec3(sr, sg, sb);
        const result = color.mul(u.sepiaAmount.oneMinus()).add(sepiaColor.mul(u.sepiaAmount));
        return vec4(result, 1);
    })();
};
