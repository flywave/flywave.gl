/* Copyright (C) 2025 flywave.gl contributors */

// import type {TypedArray} from '../types/loader-utils';
import { type TypedArray, BufferAttribute } from "three";

import type { GLTFAccessor } from "../types/gltf-json-schema";
import { getAccessorTypeFromSize, getComponentTypeFromArray } from "./gltf-utils";

// Returns a fresh attributes object with glTF-standardized attributes names
// Attributes that cannot be identified will not be included
// Removes `indices` if present, as it should be stored separately from the attributes
export function getGLTFAccessors(
    attributes: Record<string, BufferAttribute | { value: TypedArray; size?: number }>
): Record<string, GLTFAccessor> {
    const accessors: Record<string, GLTFAccessor> = {};
    for (const name in attributes) {
        const attribute = attributes[name];
        if (name !== "indices") {
            const glTFAccessor = getGLTFAccessor(attribute);
            accessors[name] = glTFAccessor;
        }
    }
    return accessors;
}

// Fix up a single accessor.
// Input: typed array or a partial accessor object
// Return: accessor object
export function getGLTFAccessor(attribute: BufferAttribute | { value: TypedArray; size?: number }) {
    const { buffer, size, count } = getAccessorData(attribute);

    const glTFAccessor: GLTFAccessor = {
        // 保持原有逻辑，添加 THREE 类型支持
        // @ts-ignore
        value: buffer,
        size,
        byteOffset: 0,
        count,
        type: getAccessorTypeFromSize(size),
        componentType: getComponentTypeFromArray(buffer)
    };
    return glTFAccessor;
}

// export function getGLTFAttribute(data, gltfAttributeName): GLTFAccessor {
//   return data.attributes[data.glTFAttributeMap[gltfAttributeName]];
// }

function getAccessorData(attribute: BufferAttribute | { value: TypedArray; size?: number }) {
    let buffer: TypedArray;
    let size: number;
    let count = 0;

    // 处理 THREE.BufferAttribute 的情况
    if (attribute instanceof BufferAttribute) {
        buffer = attribute.array;
        size = attribute.itemSize;
        count = attribute.count;
    } else if (attribute?.value) {
        // 原有逻辑兼容
        buffer = attribute.value;
        size = attribute.size || 1;
        count = buffer.length / size;
    } else {
        throw new Error("Invalid attribute format");
    }

    // 保持原有类型转换逻辑
    if (!ArrayBuffer.isView(buffer)) {
        buffer = toTypedArray(buffer, Float32Array);
    }

    return { buffer, size, count };
}

// Convert non-typed arrays to arrays of specified format
function toTypedArray(array, ArrayType, convertTypedArrays = false) {
    if (!array) {
        return null;
    }
    if (Array.isArray(array)) {
        return new ArrayType(array);
    }
    if (convertTypedArrays && !(array instanceof ArrayType)) {
        return new ArrayType(array);
    }
    return array;
}
