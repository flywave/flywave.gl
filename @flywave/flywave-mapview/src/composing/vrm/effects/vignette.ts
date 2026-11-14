/* Copyright (C) 2025 flywave.gl contributors */

// @ts-nocheck
import { Fn, uniform, uv, vec4 } from "three/tsl";

/**
 * Persistent uniform slots for the vignette. They are owned by the manager
 * (not created inside the node factory) so theme edits — offset/darkness —
 * can be written into `.value` without disposing the pipeline and
 * recompiling the whole post-processing chain.
 */
export const createVignetteUniforms = () => ({
    offset: uniform(1),
    darkness: uniform(1)
});

export const vignette = (inputNode, u = createVignetteUniforms()) => {
    return Fn(() => {
        const color = inputNode.toVar();
        const coord = uv();
        const dist = coord.sub(0.5).length().mul(2);
        const factor = u.darkness.mul(dist.sub(u.offset).max(0)).oneMinus();
        return vec4(color.rgb.mul(factor.clamp(0, 1)), 1);
    })();
};
