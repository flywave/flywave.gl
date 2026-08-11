// @ts-nocheck
import { Fn, uniform, uv, vec4 } from "three/tsl";

export const vignette = (inputNode, offset = 1, darkness = 1) => {
    return Fn(() => {
        const color = inputNode.toVar();
        const coord = uv();
        const dist = coord.sub(0.5).length().mul(2);
        const factor = uniform(darkness).mul(dist.sub(uniform(offset)).max(0)).oneMinus();
        return vec4(color.rgb.mul(factor.clamp(0, 1)), 1);
    })();
};
