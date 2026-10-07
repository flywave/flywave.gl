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
} from "three/webgpu";

/**
 * Serializable geometry data structure (extended, includes type information)
 */
export interface SerializableGeometryData {
    attributes: Record<
        string,
        {
            array: ArrayBufferLike;
            itemSize: number;
            normalized: boolean;
            usage?: number;
            arrayType: string; // stores the array type information
        }
    >;
    index?: {
        array: ArrayBufferLike;
        itemSize: number;
        normalized: boolean;
        usage?: number;
        arrayType: string; // stores the array type information
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
 * Convert a BufferGeometry into serializable data (for Worker transfer)
 * @param geometry the BufferGeometry to serialize
 * @returns the serializable geometry data
 */
export function serializeBufferGeometry(geometry: BufferGeometry): SerializableGeometryData {
    const data: SerializableGeometryData = {
        attributes: {},
        groups: [...geometry.groups],
        drawRange: { ...geometry.drawRange },
        userData: geometry.userData ? JSON.parse(JSON.stringify(geometry.userData)) : {}
    };

    // Serialize the vertex attributes
    for (const name in geometry.attributes) {
        const attribute = geometry.attributes[name];

        if (attribute instanceof BufferAttribute) {
            // Handle a plain BufferAttribute
            const arrayBuffer = attribute.array.buffer.slice(
                attribute.array.byteOffset,
                attribute.array.byteOffset + attribute.array.byteLength
            );

            data.attributes[name] = {
                array: arrayBuffer as ArrayBuffer,
                itemSize: attribute.itemSize,
                normalized: attribute.normalized,
                usage: attribute.usage,
                arrayType: attribute.array.constructor.name // stores the type information
            };
        } else if (attribute instanceof InterleavedBufferAttribute) {
            // Handle an interleaved buffer attribute
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
                arrayType: interleavedBuffer.array.constructor.name // stores the type information
            };
        }
    }

    // Serialize the index
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
            arrayType: geometry.index.array.constructor.name // stores the type information
        };
    }

    // Serialize the bounding box
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

    // Serialize the bounding sphere
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
 * Restore a BufferGeometry from serialized data (used in a Worker)
 * @param data the serialized geometry data
 * @returns the restored BufferGeometry
 */
export function deserializeBufferGeometry(data: SerializableGeometryData): BufferGeometry {
    const geometry = new BufferGeometry();

    // Restore the vertex attributes
    for (const name in data.attributes) {
        const attrData = data.attributes[name];
        const TypedArray = getTypedArrayByType(attrData.arrayType); // use the correct type

        const array = new TypedArray(attrData.array as ArrayBuffer);
        const attribute = new BufferAttribute(array, attrData.itemSize, attrData.normalized);

        if (attrData.usage !== undefined) {
            attribute.usage = attrData.usage as Usage;
        }

        geometry.setAttribute(name, attribute);
    }

    // Restore the index
    if (data.index) {
        const TypedArray = getTypedArrayByType(data.index.arrayType); // use the correct type

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

    // Restore the group information
    geometry.groups = [...data.groups];

    // Restore the draw range
    geometry.drawRange = { ...data.drawRange };

    // Restore the user data
    if (data.userData) {
        geometry.userData = JSON.parse(JSON.stringify(data.userData));
    }

    // Restore the bounding box
    if (data.boundingBox) {
        geometry.boundingBox = new Box3(
            new Vector3(...data.boundingBox.min),
            new Vector3(...data.boundingBox.max)
        );
    }

    // Restore the bounding sphere
    if (data.boundingSphere) {
        geometry.boundingSphere = new Sphere(
            new Vector3(...data.boundingSphere.center),
            data.boundingSphere.radius
        );
    }

    return geometry;
}

/**
 * Get the corresponding TypedArray constructor from a type name
 * @param type the type name
 * @returns the corresponding TypedArray constructor
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

// Removed the old unreliable getTypedArrayConstructor function
