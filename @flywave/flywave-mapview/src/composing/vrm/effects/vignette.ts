// @ts-nocheck
import { Fn, uniform, uv, vec4 } from "three/tsl";

export const vignette = (inputNode, offset = 1, darkness = 1) => {
    return Fn(() => {
        const color = inputNode.toVar();
        const coord = uv();
        const dist = coord.sub(0.5).length().mul(1.5);
        const vignetteFactor = dist.sub(uniform(offset)).max(0).oneMinus();
        const factor = vignetteFactor.mul(vignetteFactor).mul(uniform(darkness)).oneMinus();
        return vec4(color.mul(factor), 1);
    })();
};
