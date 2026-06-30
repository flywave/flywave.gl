// @ts-nocheck
import { Fn, uniform, vec3, vec4 } from "three/tsl";

export const brightnessContrast = (inputNode, brightness = 0, contrast = 0) => {
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        const factor = uniform(contrast).add(1).max(0.0001);
        const result = color.sub(0.5).mul(factor).add(0.5).add(uniform(brightness));
        return vec4(result, 1);
    })();
};

export const hueSaturation = (inputNode, hue = 0, saturation = 0) => {
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        const luminance = color.dot(vec3(0.299, 0.587, 0.114));
        const result = color.sub(luminance).mul(uniform(saturation).add(1)).add(luminance);
        return vec4(result, 1);
    })();
};

export const sepia = (inputNode, amount = 0.5) => {
    const a = uniform(amount);
    return Fn(() => {
        const color = inputNode.rgb.toVar();
        const r = color.x;
        const g = color.y;
        const b = color.z;
        const sr = r.mul(0.393).add(g.mul(0.769)).add(b.mul(0.189));
        const sg = r.mul(0.349).add(g.mul(0.686)).add(b.mul(0.168));
        const sb = r.mul(0.272).add(g.mul(0.534)).add(b.mul(0.131));
        const sepiaColor = vec3(sr, sg, sb);
        const result = color.mul(a.oneMinus()).add(sepiaColor.mul(a));
        return vec4(result, 1);
    })();
};
