import { type TypedArray, BufferAttribute } from "three";
import type { GLTFAccessor } from "../types/gltf-json-schema";
export declare function getGLTFAccessors(attributes: Record<string, BufferAttribute | {
    value: TypedArray;
    size?: number;
}>): Record<string, GLTFAccessor>;
export declare function getGLTFAccessor(attribute: BufferAttribute | {
    value: TypedArray;
    size?: number;
}): GLTFAccessor;
