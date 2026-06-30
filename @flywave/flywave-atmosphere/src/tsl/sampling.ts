// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */


import { ivec2, ivec4, vec2, vec4 } from "three/tsl";
import type { ConstNode, TextureNode } from "three/webgpu";

import { reinterpretType } from "./types";
import { FnVar } from "./FnVar";
import type { Node } from "./node";

const components = ["x", "y", "z", "w"] as const;

export const textureGather = /*#__PURE__*/ FnVar(
    (textureNode: TextureNode, uvNode: Node<"vec2">, component = 0): Node<"vec4"> => {
        let componentValue;
        if (typeof component === "number") {
            componentValue = component;
        } else if ((component as any)?.isConstNode === true) {
            reinterpretType<ConstNode<number>>(component);
            componentValue = component.value;
        } else {
            throw new Error("Component must be a constant.");
        }

        const size = textureNode.size();
        const coord = ivec2(uvNode.mul(size).sub(0.5).floor()).toConst();
        const i = ivec4(coord, coord.add(1)).toConst();
        const c = components[componentValue]; // element() fails for depth textures
        return vec4(
            textureNode.load(i.xw)[c], // min, max
            textureNode.load(i.zw)[c], // max, max
            textureNode.load(i.zy)[c], // max, min
            textureNode.load(i.xy)[c] // min, min
        );
    }
);
