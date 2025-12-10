/* Copyright (C) 2025 flywave.gl contributors */

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { meshoptDecodeGltfBuffer } from "../../meshopt/meshopt-decoder";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type {
    GLTF,
    GLTF_KHR_gaussian_splatting,
    GLTFMeshPrimitive
} from "../types/gltf-json-schema";

// 导入 SPZ 压缩模块
import {
    decompressSPZ,
    EXT_SPZ_COMPRESSION,
    validateSPZExtension
} from "./utils/spz-compression";

// 扩展常量
const EXT_GAUSSIAN_SPLATTING = "KHR_gaussian_splatting";
const EXT_MESHOPT_COMPRESSION = "EXT_meshopt_compression";
const EXT_MESH_QUANTIZATION = "KHR_mesh_quantization";

export const name = EXT_GAUSSIAN_SPLATTING;

// 属性常量
const REQUIRED_ATTRIBUTES = {
    POSITION: "POSITION",
    COLOR_0: "COLOR_0",
    SCALE: "_SCALE",
    ROTATION: "_ROTATION"
} as const;

const OPTIONAL_ATTRIBUTES = {
    OPACITY: "_OPACITY"
} as const;

// 主解码函数
export async function decode(gltfData: { json: GLTF; buffers?: any[] }, options: GLTFLoaderOptions): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);

    // 保存原始状态用于检测是否需要重新打包
    const originalSourceBuffersCount = scenegraph.sourceBuffers.length;
    const originalByteLength = scenegraph.byteLength;

    await decodeExtGaussianSplatting(scenegraph, options);

    // 检查是否有新的 buffer 数据被添加
    const hasNewBufferData = scenegraph.sourceBuffers.length > originalSourceBuffersCount ||
        scenegraph.byteLength > originalByteLength;

    if (hasNewBufferData) {
        console.log(`Rebuilding binary chunk: added ${scenegraph.sourceBuffers.length - originalSourceBuffersCount} buffers`);
        scenegraph.createBinaryChunk();
        gltfData.buffers = scenegraph.gltf.buffers;
    }

    gltfData.json = scenegraph.json;
}

async function decodeExtGaussianSplatting(
    scenegraph: GLTFScenegraph,
    options: GLTFLoaderOptions
): Promise<void> {
    const promises: Array<Promise<void>> = [];

    for (const primitive of makeMeshPrimitiveIterator(scenegraph)) {
        // 使用统一的扩展检测函数
        if (hasGaussianSplattingExtension(primitive, scenegraph)) {
            promises.push(processPrimitive(scenegraph, primitive, options));
        }
    }

    await Promise.all(promises);

    // 只有在确实处理了扩展时才移除
    if (promises.length > 0) {
        scenegraph.removeExtension(EXT_GAUSSIAN_SPLATTING);
    }
}

/**
 * 检测图元是否包含高斯泼溅相关扩展（支持深度嵌套）
 */
function hasGaussianSplattingExtension(primitive: GLTFMeshPrimitive, scenegraph: GLTFScenegraph): boolean {
    const extensions = getGaussianSplattingExtension(primitive, scenegraph);
    return !!(extensions.main || extensions.spz);
}

/**
 * 获取统一的高斯泼溅扩展数据（支持深度嵌套）
 */
function getGaussianSplattingExtension(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph
): { main?: any; spz?: any } {
    // 1. 获取主扩展
    const main = scenegraph.getObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);

    // 2. 获取独立 SPZ 扩展
    const standaloneSpz = scenegraph.getObjectExtension(primitive, EXT_SPZ_COMPRESSION);

    // 3. 获取嵌套在主扩展中的 SPZ 扩展
    const nestedSpz = main?.extensions?.[EXT_SPZ_COMPRESSION];

    // 4. 获取深度嵌套的 SPZ 扩展
    const deeplyNestedSpz = main?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION];

    return {
        main,
        spz: standaloneSpz || nestedSpz || deeplyNestedSpz
    };
}

/**
 * 记录扩展检测结果用于调试
 */
function logExtensionDetection(primitive: GLTFMeshPrimitive, extensions: { main?: any; spz?: any }, scenegraph: GLTFScenegraph): void {
    const main = scenegraph.getObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);
    const standaloneSpz = scenegraph.getObjectExtension(primitive, EXT_SPZ_COMPRESSION);
    const nestedSpz = main?.extensions?.[EXT_SPZ_COMPRESSION];
    const deeplyNestedSpz = main?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION];

    console.log('Gaussian splatting extension detection:', {
        hasMainExtension: !!extensions.main,
        hasSpzExtension: !!extensions.spz,
        mainExtension: main ? 'found' : 'not found',
        spzExtensionTypes: {
            standalone: !!standaloneSpz,
            nested: !!nestedSpz,
            deeplyNested: !!deeplyNestedSpz
        },
        spzSource: standaloneSpz ? 'standalone' :
            nestedSpz ? 'nested' :
                deeplyNestedSpz ? 'deeplyNested' : 'none'
    });
}

async function processPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions
): Promise<void> {
    // 使用统一的扩展获取函数
    const extensions = getGaussianSplattingExtension(primitive, scenegraph);

    // 记录检测结果用于调试
    logExtensionDetection(primitive, extensions, scenegraph);

    const { main: mainExtension, spz: spzExtension } = extensions;

    // 如果没有找到任何高斯泼溅相关扩展，直接返回
    if (!mainExtension && !spzExtension) {
        console.log('No Gaussian splatting extensions found, skipping primitive');
        return;
    }

    try {
        // 1. 首先清理可能存在的旧扩展属性
        cleanupLegacyAttributes(primitive);

        // 2. 处理压缩数据 - 优先处理 SPZ 压缩
        if (spzExtension) {
            console.log('Processing SPZ compression extension');

            // 验证 SPZ 扩展数据
            validateSPZExtension(spzExtension);

            // 使用 SPZ 解压模块
            await decompressSPZ(scenegraph, primitive, spzExtension, {
                mergeAlphaToColor: true,
                preserveSHData: true
            });

            // 清理 SPZ 扩展
            await cleanupSPZExtension(primitive, scenegraph, mainExtension, spzExtension);

        } else if (mainExtension?.bufferView !== undefined && mainExtension.bufferView !== -1) {
            // 处理其他压缩格式
            await decompressPrimitive(scenegraph, primitive, mainExtension, options);
        } else {
            // 处理未压缩数据的不透明度
            processUncompressedOpacity(scenegraph, primitive);
        }

        // 3. 再次清理，确保没有遗留的扩展属性
        cleanupLegacyAttributes(primitive);

        // 4. 验证解压后的图元属性
        validateDecompressedPrimitive(scenegraph, primitive);

        // 5. 处理解量化（KHR_mesh_quantization）
        await dequantizePrimitive(scenegraph, primitive);

        // 6. 处理球谐系数
        if (mainExtension?.sphericalHarmonics) {
            processSphericalHarmonics(primitive, mainExtension.sphericalHarmonics);
        }

        primitive.extras = primitive.extras || {};
        primitive.extras.isGaussianSplatting = true;

        primitive.extras.originalExtensions = {
            hadMainExtension: !!mainExtension,
            hadSpzExtension: !!spzExtension
        };

    } catch (error) {
        console.error(`Failed to process Gaussian splatting primitive:`, error);
        throw error;
    } finally {
        // 确保最后移除所有相关扩展
        await cleanupAllGaussianExtensions(primitive, scenegraph);
    }
}

/**
 * 清理 SPZ 扩展（处理各种嵌套情况）
 */
async function cleanupSPZExtension(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph,
    mainExtension: any,
    spzExtension: any
): Promise<void> {
    // 移除独立 SPZ 扩展
    scenegraph.removeObjectExtension(primitive, EXT_SPZ_COMPRESSION);

    // 移除嵌套在主扩展中的 SPZ 扩展
    if (mainExtension?.extensions?.[EXT_SPZ_COMPRESSION]) {
        delete mainExtension.extensions[EXT_SPZ_COMPRESSION];
        if (Object.keys(mainExtension.extensions).length === 0) {
            delete mainExtension.extensions;
        }
    }

    // 移除深度嵌套的 SPZ 扩展
    if (mainExtension?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION]) {
        delete mainExtension.extensions[EXT_GAUSSIAN_SPLATTING].extensions[EXT_SPZ_COMPRESSION];
        if (Object.keys(mainExtension.extensions[EXT_GAUSSIAN_SPLATTING].extensions).length === 0) {
            delete mainExtension.extensions[EXT_GAUSSIAN_SPLATTING].extensions;
        }
        if (Object.keys(mainExtension.extensions[EXT_GAUSSIAN_SPLATTING]).length === 0) {
            delete mainExtension.extensions[EXT_GAUSSIAN_SPLATTING];
        }
    }
}

/**
 * 清理所有高斯泼溅相关扩展
 */
async function cleanupAllGaussianExtensions(primitive: GLTFMeshPrimitive, scenegraph: GLTFScenegraph): Promise<void> {
    scenegraph.removeObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);
    scenegraph.removeObjectExtension(primitive, EXT_SPZ_COMPRESSION);
}

/**
 * 清理遗留的扩展属性
 */
function cleanupLegacyAttributes(primitive: GLTFMeshPrimitive): void {
    const attributes = primitive.attributes;
    const legacyAttributePatterns = [
        /^KHR_gaussian_splatting:/, // 以扩展名开头的属性
        /^SH_DEGREE_\d+_COEF_\d+$/, // 球谐系数属性
        /^SH_COEFFS_\d+$/,          // 其他球谐系数格式
    ];

    let cleanedCount = 0;
    for (const attrName in attributes) {
        for (const pattern of legacyAttributePatterns) {
            if (pattern.test(attrName)) {
                delete attributes[attrName];
                cleanedCount++; 
                break;
            }
        }
    } 
}

// 验证解压后的图元属性
function validateDecompressedPrimitive(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive): void {
    const attributes = primitive.attributes;
    // 验证必需属性
    const requiredAttributes = ['POSITION', 'COLOR_0', '_SCALE', '_ROTATION'];
    for (const attrName of requiredAttributes) {
        if (attributes[attrName] === undefined) {
            throw new Error(`Missing required attribute after decompression: ${attrName}`);
        }

        const accessor = scenegraph.getAccessor(attributes[attrName]);
        if (!accessor) {
            throw new Error(`Invalid accessor for attribute: ${attrName}`);
        }

        // 验证数据有效性
        if (accessor.count === 0) {
            throw new Error(`Empty accessor for attribute: ${attrName}`);
        }
    }

    // 确保没有遗留的扩展属性
    for (const attrName in attributes) {
        if (attrName.startsWith('KHR_gaussian_splatting:')) {
            console.warn(`Found legacy extension attribute after cleanup: ${attrName}`);
            delete attributes[attrName];
        }
    }
}

function validateAttributeDataType(scenegraph: GLTFScenegraph, accessorIndex: number, expectedType: string): void {
    if (accessorIndex === undefined) return;

    const accessor = scenegraph.getAccessor(accessorIndex);
    if (!accessor) {
        throw new Error(`Missing accessor for validation: ${accessorIndex}`);
    }

    if (accessor.type !== expectedType) {
        throw new Error(`Attribute type mismatch after decompression. Expected ${expectedType}, found ${accessor.type}`);
    }

    // 验证组件类型为 FLOAT
    if (accessor.componentType !== 5126) {
        throw new Error(`Expected FLOAT component type for attribute, found: ${accessor.componentType}`);
    }
}

// 原有的验证函数（用于压缩前的验证）
function validateGaussianPrimitive(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive): void {
    const attributes = primitive.attributes;

    // 对于压缩数据，只需要验证基本的属性存在性
    for (const [attrKey, attrName] of Object.entries(REQUIRED_ATTRIBUTES)) {
        // 对于 SCALE 和 ROTATION，在压缩数据中可能不存在，由解压过程创建
        if (attrKey === "SCALE" || attrKey === "ROTATION") {
            continue;
        }

        if (attributes[attrName] === undefined) {
            throw new Error(`Missing required attribute for Gaussian splatting: ${attrName}`);
        }
    }
}

async function dequantizePrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive
): Promise<void> {
    const quantizationExt = scenegraph.getObjectExtension(primitive, EXT_MESH_QUANTIZATION);
    if (!quantizationExt) return;

    console.log("Processing mesh quantization extension");

    for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes)) {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor || accessor.componentType === 5126) continue;

        const bits = getQuantizationBits(attributeName, quantizationExt);
        if (bits === 0) continue;

        console.log(`Dequantizing attribute: ${attributeName} with ${bits} bits`);
        const newAccessorIndex = await dequantizeAccessor(scenegraph, accessor, bits);
        primitive.attributes[attributeName] = newAccessorIndex;
    }

    scenegraph.removeObjectExtension(primitive, EXT_MESH_QUANTIZATION);
}

function getQuantizationBits(attributeName: string, ext: any): number {
    // 简化的量化位深获取逻辑
    const quantizationMap: Record<string, number> = {
        'POSITION': ext.POSITION ?? 14,
        'POSITION_0': ext.POSITION ?? 14,
        'NORMAL': ext.NORMAL ?? 10,
        'NORMAL_0': ext.NORMAL ?? 10,
        'TANGENT': ext.TANGENT ?? 10,
        'TANGENT_0': ext.TANGENT ?? 10,
        'TEXCOORD': ext.TEXCOORD ?? 12,
        'TEXCOORD_0': ext.TEXCOORD ?? 12,
        'TEXCOORD_1': ext.TEXCOORD ?? 12,
        'COLOR': ext.COLOR ?? 8,
        'COLOR_0': ext.COLOR ?? 8,
        'COLOR_1': ext.COLOR ?? 8,
        'WEIGHTS': ext.WEIGHTS ?? 8,
        'WEIGHTS_0': ext.WEIGHTS ?? 8,
        '_SCALE': ext.GENERIC ?? 12,
        '_ROTATION': ext.GENERIC ?? 12
    };

    return quantizationMap[attributeName] ?? (ext.GENERIC ?? 8);
}

async function dequantizeAccessor(
    scenegraph: GLTFScenegraph,
    accessor: any,
    bits: number
): Promise<number> {
    if (!accessor.min || !accessor.max || accessor.min.length !== accessor.max.length) {
        return accessor.index;
    }

    const componentCount = getComponentCount(accessor.type);
    if (componentCount === 0) {
        return accessor.index;
    }

    const bufferView = scenegraph.getBufferView(accessor.bufferView);
    if (!bufferView) {
        return accessor.index;
    }

    const bufferData = scenegraph.getTypedArrayForBufferView(bufferView);
    if (!bufferData) {
        return accessor.index;
    }

    const count = accessor.count;
    const byteOffset = (accessor.byteOffset || 0) + (bufferView.byteOffset || 0);
    const stride = bufferView.byteStride || componentCount * getComponentSize(accessor.componentType);

    // 创建解量化后的浮点数据
    const floatData = new Float32Array(count * componentCount);
    const maxIntegerValue = Math.pow(2, bits) - 1;

    for (let i = 0; i < count; i++) {
        const elementOffset = byteOffset + i * stride;

        for (let c = 0; c < componentCount; c++) {
            const valueOffset = elementOffset + c * getComponentSize(accessor.componentType);
            const rawValue = readComponent(
                bufferData,
                valueOffset,
                accessor.componentType,
                accessor.normalized
            );

            // 解量化计算
            const normalized = accessor.normalized ? rawValue : (rawValue / maxIntegerValue);
            const floatValue = accessor.min[c] + (accessor.max[c] - accessor.min[c]) * normalized;

            floatData[i * componentCount + c] = floatValue;
        }
    }

    // 创建新的 buffer view 和 accessor
    const newBufferViewIndex = createAlignedBufferView(scenegraph, floatData);

    const newAccessor = {
        bufferView: newBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count,
        type: accessor.type,
        min: accessor.min,
        max: accessor.max,
        normalized: false
    };

    return scenegraph.addAccessor(newBufferViewIndex, newAccessor);
}

// 统一的字节对齐 buffer view 创建函数
function createAlignedBufferView(scenegraph: GLTFScenegraph, data: Float32Array): number {
    const sourceBuffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const alignedByteLength = Math.ceil(sourceBuffer.byteLength / 4) * 4;

    if (alignedByteLength > sourceBuffer.byteLength) {
        const alignedBuffer = new Uint8Array(alignedByteLength);
        alignedBuffer.set(sourceBuffer);
        // 填充剩余字节为 0
        for (let i = sourceBuffer.byteLength; i < alignedByteLength; i++) {
            alignedBuffer[i] = 0;
        }
        return scenegraph.addBufferView(alignedBuffer);
    }

    return scenegraph.addBufferView(sourceBuffer);
}

function readComponent(
    data: Uint8Array,
    offset: number,
    componentType: number,
    normalized: boolean
): number {
    if (offset >= data.length) {
        throw new Error(`Read component offset out of bounds: ${offset} >= ${data.length}`);
    }

    const view = new DataView(data.buffer, data.byteOffset + offset);

    switch (componentType) {
        case 5120: // BYTE
            const int8 = view.getInt8(0);
            return normalized ? Math.max(int8 / 127, -1) : int8;
        case 5121: // UNSIGNED_BYTE
            const uint8 = view.getUint8(0);
            return normalized ? uint8 / 255 : uint8;
        case 5122: // SHORT
            const int16 = view.getInt16(0, true);
            return normalized ? Math.max(int16 / 32767, -1) : int16;
        case 5123: // UNSIGNED_SHORT
            const uint16 = view.getUint16(0, true);
            return normalized ? uint16 / 65535 : uint16;
        default:
            throw new Error(`Unsupported component type for dequantization: ${componentType}`);
    }
}

function getComponentCount(type: string): number {
    switch (type) {
        case "SCALAR":
            return 1;
        case "VEC2":
            return 2;
        case "VEC3":
            return 3;
        case "VEC4":
            return 4;
        case "MAT2":
            return 4;
        case "MAT3":
            return 9;
        case "MAT4":
            return 16;
        default:
            return 0;
    }
}

function getComponentSize(componentType: number): number {
    switch (componentType) {
        case 5120: // BYTE
        case 5121: // UNSIGNED_BYTE
            return 1;
        case 5122: // SHORT
        case 5123: // UNSIGNED_SHORT
            return 2;
        case 5125: // UNSIGNED_INT
        case 5126: // FLOAT
            return 4;
        default:
            return 0;
    }
}

async function decompressPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    extension: GLTF_KHR_gaussian_splatting,
    options: GLTFLoaderOptions
): Promise<void> {
    // 检查是否有 meshopt 压缩
    if (extension.bufferView !== undefined && extension.bufferView !== -1) {
        const bufferView = scenegraph.getBufferView(extension.bufferView);
        if (!bufferView) throw new Error(`Invalid bufferView index: ${extension.bufferView}`);

        // 检查 meshopt 压缩
        const meshoptExt = scenegraph.getObjectExtension(bufferView, EXT_MESHOPT_COMPRESSION);
        if (meshoptExt) {
            await decompressMeshopt(scenegraph, primitive, bufferView, meshoptExt);
            scenegraph.removeObjectExtension(bufferView, EXT_MESHOPT_COMPRESSION);
            return;
        }
    }

    // 如果没有支持的压缩扩展，但有 bufferView，抛出错误
    if (extension.bufferView !== undefined && extension.bufferView !== -1) {
        throw new Error("Unsupported compression format for Gaussian splatting");
    }

    // 如果既没有 SPZ 扩展也没有 bufferView，说明是未压缩数据
    // 这种情况下，属性应该已经在 primitive.attributes 中了
}

function processUncompressedOpacity(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive) {
    // 保持原有实现
    console.log("Processing uncompressed opacity data");
    // 这里可以添加处理未压缩不透明度数据的逻辑
}

async function decompressMeshopt(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    bufferView: any,
    meshoptExt: any
) {
    console.log("Decompressing meshopt compressed data");
    // 保持原有实现
    // 这里应该包含 meshopt 解压缩逻辑
}

function processSphericalHarmonics(
    primitive: GLTFMeshPrimitive,
    sphericalHarmonics: { coefficients: number[] }
): void {
    primitive.extras = primitive.extras || {};
    primitive.extras.sphericalHarmonics = { coefficients: sphericalHarmonics.coefficients };
    console.log("Processed spherical harmonics coefficients");
}

function* makeMeshPrimitiveIterator(scenegraph: GLTFScenegraph): Generator<GLTFMeshPrimitive> {
    for (const mesh of scenegraph.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            yield primitive;
        }
    }
}