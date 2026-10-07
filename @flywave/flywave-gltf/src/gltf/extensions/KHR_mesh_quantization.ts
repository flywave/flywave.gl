/* Copyright (C) 2025 flywave.gl contributors */

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type {
    GLTF,
    GLTFAccessor,
    GLTFBufferView,
    GLTFMeshPrimitive
} from "../types/gltf-json-schema";

const EXT_NAME = "KHR_mesh_quantization";

interface QuantizationParams {
    POSITION?: number;
    NORMAL?: number;
    TANGENT?: number;
    TEXCOORD?: number;
    COLOR?: number;
    GENERIC?: number;
    JOINTS?: number;
    WEIGHTS?: number;
}

export const name = EXT_NAME;

// Cache dequantization results to avoid reprocessing the same accessor
const dequantizationCache = new Map<string, number>();

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions) {
    const scenegraph = new GLTFScenegraph(gltfData);

    // Process all primitives that need dequantization in parallel
    const promises: Array<Promise<void>> = [];
    let hasProcessed = false;

    for (const mesh of gltfData.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            const ext = scenegraph.getObjectExtension<QuantizationParams>(primitive, EXT_NAME);
            if (ext) {
                hasProcessed = true;
                promises.push(processPrimitive(scenegraph, primitive, ext, options));
            }
        }
    }

    await Promise.all(promises);

    // Clear the cache
    dequantizationCache.clear();

    // Remove the top-level extension declaration
    if (hasProcessed) {
        scenegraph.removeExtension(EXT_NAME);
    }
}

async function processPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    params: QuantizationParams,
    options: GLTFLoaderOptions
) {
    try {
        const attributePromises = Object.entries(primitive.attributes).map(
            async ([attributeName, accessorIndex]) => {
                const originalAccessor = scenegraph.json.accessors?.[accessorIndex];
                if (!originalAccessor) return;

                // Build the cache key
                const cacheKey = `${accessorIndex}:${attributeName}`;

                // Check the cache
                if (dequantizationCache.has(cacheKey)) {
                    primitive.attributes[attributeName] = dequantizationCache.get(cacheKey)!;
                    return;
                }

                // Create a new accessor to avoid polluting the original data
                const newAccessorIndex = await dequantizeAccessor(
                    scenegraph,
                    originalAccessor,
                    params,
                    attributeName,
                    options
                );

                // Point the primitive attribute at the new accessor
                primitive.attributes[attributeName] = newAccessorIndex;

                // Store it in the cache
                dequantizationCache.set(cacheKey, newAccessorIndex);
            }
        );

        await Promise.allSettled(attributePromises);
    } catch (error) {
        options.log?.error(`处理图元解量化失败: ${error.message}`);
    } finally {
        scenegraph.removeObjectExtension(primitive, EXT_NAME);
    }
}

async function dequantizeAccessor(
    scenegraph: GLTFScenegraph,
    accessor: GLTFAccessor,
    params: QuantizationParams,
    attributeName: string,
    options: GLTFLoaderOptions
): Promise<number> {
    // Skip float types and attributes that do not need dequantization
    if (accessor.componentType === 5126) {
        return accessor.bufferView!; // Return the original index
    }

    // Make sure there is a valid buffer view
    if (accessor.bufferView === undefined) {
        throw new Error(`访问器 ${accessor.name || "unnamed"} 缺少缓冲视图引用`);
    }

    const bufferView = scenegraph.json.bufferViews?.[accessor.bufferView] as
        | GLTFBufferView
        | undefined;
    if (!bufferView) {
        throw new Error(`无法找到访问器 ${accessor.bufferView} 引用的缓冲视图`);
    }

    // Get the raw quantized data
    const bufferData = scenegraph.getTypedArrayForBufferView(accessor.bufferView);
    if (!bufferData) {
        throw new Error(`无法获取缓冲视图 ${accessor.bufferView} 的数据`);
    }

    // Compute the component layout
    const componentSize = getComponentSize(accessor.type);
    const componentByteSize = getComponentByteSize(accessor.componentType);
    const stride = bufferView.byteStride || componentSize * componentByteSize;

    // Get the quantization bit depth (per attribute semantic)
    const bits = getQuantizationBits(attributeName, params);

    // Validate the min/max values
    if (!accessor.min || !accessor.max) {
        throw new Error(`访问器 ${accessor.name || "unnamed"} 缺少解量化所需的 min/max 值`);
    }

    const minValues = accessor.min as number[];
    const maxValues = accessor.max as number[];

    if (minValues.length < componentSize || maxValues.length < componentSize) {
        throw new Error(`访问器 ${accessor.name || "unnamed"} 的 min/max 数组长度不匹配组件大小`);
    }

    // Perform the dequantization
    const dequantized = dequantizeData(
        bufferData.buffer,
        accessor,
        componentSize,
        componentByteSize,
        stride,
        bits,
        bufferView.byteOffset || 0,
        minValues,
        maxValues
    );

    // Add a new buffer view (using the GLTFScenegraph API)
    const newBufferViewIndex = scenegraph.addBufferView(dequantized);

    // Update the buffer view metadata
    const newBufferView = scenegraph.json.bufferViews?.[newBufferViewIndex];
    if (newBufferView) {
        newBufferView.byteStride = componentSize * 4; // 4 bytes per component after dequantization

        // Keep the original target type (if present)
        if (bufferView.target !== undefined) {
            newBufferView.target = bufferView.target;
        }

        // Keep the name (if present)
        if (bufferView.name) {
            newBufferView.name = `${bufferView.name}_dequantized`;
        }
    }

    // Create the new accessor (preserving metadata)
    const newAccessor = { ...accessor };
    newAccessor.bufferView = newBufferViewIndex;
    newAccessor.componentType = 5126; // FLOAT
    newAccessor.normalized = false;

    // Keep the original name (if present)
    if (accessor.name) {
        newAccessor.name = `${accessor.name}_dequantized`;
    }

    // Push the new accessor and return its index
    scenegraph.json.accessors!.push(newAccessor);
    return scenegraph.json.accessors!.length - 1;
}

function dequantizeData(
    data: ArrayBuffer,
    accessor: GLTFAccessor,
    components: number,
    componentByteSize: number,
    stride: number,
    bits: number,
    baseByteOffset: number,
    min: number[],
    max: number[]
): Float32Array {
    // Compute the quantization range
    const maxIntegerValue = Math.pow(2, bits) - 1;

    // Determine whether it is an unsigned integer type (per the glTF component type)
    const isUnsigned =
        accessor.componentType === 5121 || // UNSIGNED_BYTE
        accessor.componentType === 5123 || // UNSIGNED_SHORT
        accessor.componentType === 5125; // UNSIGNED_INT

    // Compute the quantization offset per the spec (used for signed integer types)
    const quantizationOffset = isUnsigned ? 0 : Math.pow(2, bits - 1);

    const srcView = new DataView(data);
    const accessorOffset = accessor.byteOffset || 0;
    const totalOffset = baseByteOffset + accessorOffset;
    const dstArray = new Float32Array(accessor.count * components);

    // Compute the range of each component (performance optimization)
    const ranges: number[] = [];
    for (let c = 0; c < components; c++) {
        ranges[c] = max[c] - min[c];
    }

    // Handle the tightly packed case (no stride)
    if (stride === components * componentByteSize) {
        const startOffset = totalOffset;

        for (let i = 0; i < accessor.count; i++) {
            const elementOffset = startOffset + i * stride;

            for (let c = 0; c < components; c++) {
                const byteOffset = elementOffset + c * componentByteSize;
                const rawValue = readComponent(srcView, byteOffset, accessor.componentType);

                // Correct dequantization formula (per the spec)
                const normalized = isUnsigned
                    ? rawValue / maxIntegerValue
                    : rawValue / (maxIntegerValue / 2);

                const floatValue = min[c] + ranges[c] * normalized;
                dstArray[i * components + c] = floatValue;
            }
        }
    } else {
        // Handle the strided case (non-contiguous data)
        let dstIndex = 0;
        for (let i = 0; i < accessor.count; i++) {
            const elementOffset = totalOffset + i * stride;

            for (let c = 0; c < components; c++) {
                const byteOffset = elementOffset + c * componentByteSize;
                const rawValue = readComponent(srcView, byteOffset, accessor.componentType);

                // Dequantize using the quantization offset
                const normalized = (rawValue - quantizationOffset) / maxIntegerValue;
                const floatValue = min[c] + (max[c] - min[c]) * normalized;
                dstArray[dstIndex++] = floatValue;
            }
        }
    }

    return dstArray;
}

function readComponent(view: DataView, offset: number, type: number): number {
    try {
        switch (type) {
            case 5120: // BYTE
                return view.getInt8(offset);
            case 5121: // UNSIGNED_BYTE
                return view.getUint8(offset);
            case 5122: // SHORT
                return view.getInt16(offset, true);
            case 5123: // UNSIGNED_SHORT
                return view.getUint16(offset, true);
            case 5125: // UNSIGNED_INT (non-standard but possible)
                return view.getUint32(offset, true);
            case 5124: // INT (non-standard but possible)
                return view.getInt32(offset, true);
            default:
                throw new Error(`不支持的组件类型: ${type}`);
        }
    } catch (error) {
        throw new Error(`在偏移量 ${offset} 读取组件失败: ${error.message}`);
    }
}

function getQuantizationBits(attributeName: string, params: QuantizationParams): number {
    // Look up the bit depth by attribute semantic
    if (attributeName.startsWith("POSITION")) return params.POSITION || 12;
    if (attributeName.startsWith("NORMAL")) return params.NORMAL || 10;
    if (attributeName.startsWith("TANGENT")) return params.TANGENT || 10;
    if (attributeName.startsWith("TEXCOORD")) return params.TEXCOORD || 12;
    if (attributeName.startsWith("COLOR")) return params.COLOR || 8;
    if (attributeName.startsWith("WEIGHTS")) return params.WEIGHTS || 8;
    return params.GENERIC || 8;
}

function getComponentSize(type: string): number {
    const componentMap: Record<string, number> = {
        SCALAR: 1,
        VEC2: 2,
        VEC3: 3,
        VEC4: 4,
        MAT2: 4,
        MAT3: 9,
        MAT4: 16
    };

    const size = componentMap[type];
    if (size === undefined) {
        throw new Error(`不支持的访问器类型: ${type}`);
    }
    return size;
}

function getComponentByteSize(componentType: number): number {
    switch (componentType) {
        case 5120: // BYTE
        case 5121: // UNSIGNED_BYTE
            return 1;
        case 5122: // SHORT
        case 5123: // UNSIGNED_SHORT
            return 2;
        case 5124: // INT
        case 5125: // UNSIGNED_INT
        case 5126: // FLOAT (kept for completeness even though it is skipped)
            return 4;
        default:
            throw new Error(`不支持的组件类型: ${componentType}`);
    }
}
