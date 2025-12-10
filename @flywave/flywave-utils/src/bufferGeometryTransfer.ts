/* Copyright (C) 2025 flywave.gl contributors */

import {
    type Usage,
    Box3,
    BufferAttribute,
    BufferGeometry,
    InterleavedBuffer,
    InterleavedBufferAttribute,
    Sphere,
    Vector3
} from "three";

/**
 * 可序列化的几何体数据结构（增强版，包含类型信息）
 */
export interface SerializableGeometryData {
    attributes: Record<
        string,
        {
            array: ArrayBufferLike;
            itemSize: number;
            normalized: boolean;
            usage?: number;
            arrayType: string; // 保存数组类型信息
        }
    >;
    index?: {
        array: ArrayBufferLike;
        itemSize: number;
        normalized: boolean;
        usage?: number;
        arrayType: string; // 保存数组类型信息
    };
    groups: Array<{
        start: number;
        count: number;
        materialIndex?: number;
    }>;
    boundingBox?: {
        min: [number, number, number];
        max: [number, number, number];
    };
    boundingSphere?: {
        center: [number, number, number];
        radius: number;
    };
    drawRange: {
        start: number;
        count: number;
    };
    userData: any;
}

/**
 * 将 BufferGeometry 转换为可序列化数据（用于 Worker 传输）
 * @param geometry 要序列化的 BufferGeometry
 * @returns 可序列化的几何体数据
 */
export function serializeBufferGeometry(geometry: BufferGeometry): SerializableGeometryData {
    const data: SerializableGeometryData = {
        attributes: {},
        groups: [...geometry.groups],
        drawRange: { ...geometry.drawRange },
        userData: geometry.userData ? JSON.parse(JSON.stringify(geometry.userData)) : {}
    };

    // 序列化顶点属性
    for (const name in geometry.attributes) {
        const attribute = geometry.attributes[name];

        if (attribute instanceof BufferAttribute) {
            // 处理普通的 BufferAttribute
            const arrayBuffer = attribute.array.buffer.slice(
                attribute.array.byteOffset,
                attribute.array.byteOffset + attribute.array.byteLength
            );

            data.attributes[name] = {
                array: arrayBuffer as ArrayBuffer,
                itemSize: attribute.itemSize,
                normalized: attribute.normalized,
                usage: attribute.usage,
                arrayType: attribute.array.constructor.name // 保存类型信息
            };
        } else if (attribute instanceof InterleavedBufferAttribute) {
            // 处理交错缓冲区属性
            const interleavedBuffer = attribute.data;
            const arrayBuffer = interleavedBuffer.array.buffer.slice(
                interleavedBuffer.array.byteOffset,
                interleavedBuffer.array.byteOffset + interleavedBuffer.array.byteLength
            );

            data.attributes[name] = {
                array: arrayBuffer,
                itemSize: attribute.itemSize,
                normalized: attribute.normalized,
                usage: interleavedBuffer.usage,
                arrayType: interleavedBuffer.array.constructor.name // 保存类型信息
            };
        }
    }

    // 序列化索引
    if (geometry.index) {
        const arrayBuffer = geometry.index.array.buffer.slice(
            geometry.index.array.byteOffset,
            geometry.index.array.byteOffset + geometry.index.array.byteLength
        );

        data.index = {
            array: arrayBuffer,
            itemSize: geometry.index.itemSize,
            normalized: geometry.index.normalized,
            usage: geometry.index.usage,
            arrayType: geometry.index.array.constructor.name // 保存类型信息
        };
    }

    // 序列化包围盒
    if (geometry.boundingBox) {
        data.boundingBox = {
            min: [
                geometry.boundingBox.min.x,
                geometry.boundingBox.min.y,
                geometry.boundingBox.min.z
            ],
            max: [
                geometry.boundingBox.max.x,
                geometry.boundingBox.max.y,
                geometry.boundingBox.max.z
            ]
        };
    }

    // 序列化包围球
    if (geometry.boundingSphere) {
        data.boundingSphere = {
            center: [
                geometry.boundingSphere.center.x,
                geometry.boundingSphere.center.y,
                geometry.boundingSphere.center.z
            ],
            radius: geometry.boundingSphere.radius
        };
    }

    return data;
}

/**
 * 从序列化数据恢复 BufferGeometry（在 Worker 中使用）
 * @param data 序列化的几何体数据
 * @returns 恢复的 BufferGeometry
 */
export function deserializeBufferGeometry(data: SerializableGeometryData): BufferGeometry {
    const geometry = new BufferGeometry();

    // 恢复顶点属性
    for (const name in data.attributes) {
        const attrData = data.attributes[name];
        const TypedArray = getTypedArrayByType(attrData.arrayType); // 使用正确的类型

        const array = new TypedArray(attrData.array as ArrayBuffer);
        const attribute = new BufferAttribute(array, attrData.itemSize, attrData.normalized);

        if (attrData.usage !== undefined) {
            attribute.usage = attrData.usage as Usage;
        }

        geometry.setAttribute(name, attribute);
    }

    // 恢复索引
    if (data.index) {
        const TypedArray = getTypedArrayByType(data.index.arrayType); // 使用正确的类型

        const array = new TypedArray(data.index.array as ArrayBuffer);
        const indexAttribute = new BufferAttribute(
            array,
            data.index.itemSize,
            data.index.normalized
        );

        if (data.index.usage !== undefined) {
            indexAttribute.usage = data.index.usage as Usage;
        }

        geometry.setIndex(indexAttribute);
    }

    // 恢复组信息
    geometry.groups = [...data.groups];

    // 恢复绘制范围
    geometry.drawRange = { ...data.drawRange };

    // 恢复用户数据
    if (data.userData) {
        geometry.userData = JSON.parse(JSON.stringify(data.userData));
    }

    // 恢复包围盒
    if (data.boundingBox) {
        geometry.boundingBox = new Box3(
            new Vector3(...data.boundingBox.min),
            new Vector3(...data.boundingBox.max)
        );
    }

    // 恢复包围球
    if (data.boundingSphere) {
        geometry.boundingSphere = new Sphere(
            new Vector3(...data.boundingSphere.center),
            data.boundingSphere.radius
        );
    }

    return geometry;
}

/**
 * 根据类型名称获取对应的 TypedArray 构造函数
 * @param type 类型名称
 * @returns 对应的 TypedArray 构造函数
 */
export function getTypedArrayByType(type: string): any {
    switch (type) {
        case "Float32Array":
            return Float32Array;
        case "Float64Array":
            return Float64Array;
        case "Uint16Array":
            return Uint16Array;
        case "Uint32Array":
            return Uint32Array;
        case "Int8Array":
            return Int8Array;
        case "Int16Array":
            return Int16Array;
        case "Int32Array":
            return Int32Array;
        case "Uint8Array":
            return Uint8Array;
        case "Uint8ClampedArray":
            return Uint8ClampedArray;
        default:
            console.warn(`Unknown array type: ${type}, using Float32Array as fallback`);
            return Float32Array;
    }
}

// 删除旧的不可靠的 getTypedArrayConstructor 函数
