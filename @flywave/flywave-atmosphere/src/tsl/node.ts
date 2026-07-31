/* Copyright (C) 2025 flywave.gl contributors */

import type { Color, Matrix2, Matrix3, Matrix4, Vector2, Vector3, Vector4 } from "three/webgpu";
import { Node as ThreeNode } from "three/webgpu";

export { ThreeNode as Node };

/**
 * Complete set of TSL primitive type identifiers.
 */
export type NodeType =
    | "float"
    | "int"
    | "uint"
    | "bool"
    | "vec2"
    | "ivec2"
    | "uvec2"
    | "bvec2"
    | "vec3"
    | "ivec3"
    | "uvec3"
    | "bvec3"
    | "vec4"
    | "ivec4"
    | "uvec4"
    | "bvec4"
    | "mat2"
    | "mat3"
    | "mat4"
    | "color";

export type NodeValueType =
    | number
    | boolean
    | Vector2
    | Vector3
    | Vector4
    | Matrix2
    | Matrix3
    | Matrix4
    | Color;

// prettier-ignore
export type NodeTypeOf<T extends NodeValueType> =
    T extends number ? "float" :
    T extends boolean ? "bool" :
    T extends Vector2 ? "vec2" :
    T extends Vector3 ? "vec3" :
    T extends Vector4 ? "vec4" :
    T extends Matrix2 ? "mat2" :
    T extends Matrix3 ? "mat3" :
    T extends Matrix4 ? "mat4" :
    T extends Color ? "color" : never;

// prettier-ignore
export type NodeValueTypeOf<T extends NodeType> =
    T extends "float" | "int" | "uint" ? number :
    T extends "bool" ? boolean :
    T extends "vec2" | "ivec2" | "uvec2" | "bvec2" ? Vector2 :
    T extends "vec3" | "ivec3" | "uvec3" | "bvec3" ? Vector3 :
    T extends "vec4" | "ivec4" | "uvec4" | "bvec4" ? Vector4 :
    T extends "mat2" ? Matrix2 :
    T extends "mat3" ? Matrix3 :
    T extends "mat4" ? Matrix4 :
    T extends "color" ? Color : never;
