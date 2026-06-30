// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { ivec2, ivec4, vec4 } from "three/tsl";
import { reinterpretType } from "./types";
import { FnVar } from "./FnVar";
const components = ["x", "y", "z", "w"];
export const textureGather = /*#__PURE__*/ FnVar((textureNode, uvNode, component = 0) => {
    let componentValue;
    if (typeof component === "number") {
        componentValue = component;
    }
    else if (component?.isConstNode === true) {
        reinterpretType(component);
        componentValue = component.value;
    }
    else {
        throw new Error("Component must be a constant.");
    }
    const size = textureNode.size();
    const coord = ivec2(uvNode.mul(size).sub(0.5).floor()).toConst();
    const i = ivec4(coord, coord.add(1)).toConst();
    const c = components[componentValue]; // element() fails for depth textures
    return vec4(textureNode.load(i.xw)[c], // min, max
    textureNode.load(i.zw)[c], // max, max
    textureNode.load(i.zy)[c], // max, min
    textureNode.load(i.xy)[c] // min, min
    );
});
//# sourceMappingURL=sampling.js.map