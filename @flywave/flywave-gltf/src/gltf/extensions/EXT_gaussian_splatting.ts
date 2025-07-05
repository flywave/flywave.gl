import { sliceArrayBuffer } from "@flywave/flywave-utils";
import { TypedArray } from "three";

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { meshoptDecodeGltfBuffer } from "../../meshopt/meshopt-decoder";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import { getGLTFAccessors } from "../gltf-utils/gltf-attribute-utils";
import type {
    GLTF,
    GLTF_KHR_gaussian_splatting,
    GLTFMeshPrimitive
} from "../types/gltf-json-schema";

const EXT_NAME = "KHR_gaussian_splatting";
const MESHOPT_COMPRESSION_EXT = "EXT_meshopt_compression";
const MESH_QUANTIZATION_EXT = "KHR_mesh_quantization";

export const name = EXT_NAME;

const REQUIRED_ATTRIBUTES = {
    POSITION: "POSITION",
    COLOR_0: "COLOR_0",
    SCALE: "_SCALE",
    ROTATION: "_ROTATION"
} as const;

const OPTIONAL_ATTRIBUTES = {
    OPACITY: "_OPACITY"
} as const;

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);
    await decodeExtGaussianSplatting(scenegraph, options);
}

async function decodeExtGaussianSplatting(
    scenegraph: GLTFScenegraph,
    options: GLTFLoaderOptions
): Promise<void> {
    if (!options?.splats?.decompress) {
        return;
    }

    const promises: Array<Promise<void>> = [];
    for (const primitive of makeMeshPrimitiveIterator(scenegraph)) {
        if (scenegraph.getObjectExtension(primitive, EXT_NAME)) {
            promises.push(processPrimitive(scenegraph, primitive, options));
        }
    }

    await Promise.all(promises);
    scenegraph.removeExtension(EXT_NAME);
}

async function processPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions
): Promise<void> {
    const extension = scenegraph.getObjectExtension<GLTF_KHR_gaussian_splatting>(
        primitive,
        EXT_NAME
    );
    if (!extension) {
        return;
    }

    // eslint-disable-next-line no-useless-catch
    try {
        // 1. 验证图元属性
        validateGaussianPrimitive(scenegraph, primitive);

        // 2. 处理压缩数据
        if (extension.bufferView !== undefined && extension.bufferView !== -1) {
            await decompressPrimitive(scenegraph, primitive, extension, options);
        } else {
            // 处理未压缩数据的不透明度
            processUncompressedOpacity(scenegraph, primitive);
        }

        // 3. 处理解量化（KHR_mesh_quantization）
        await dequantizePrimitive(scenegraph, primitive);

        // 4. 处理球谐系数
        if (extension.sphericalHarmonics) {
            processSphericalHarmonics(primitive, extension.sphericalHarmonics);
        }
    } catch (error) {
        throw error;
    }
}

function validateGaussianPrimitive(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive): void {
    const attributes = primitive.attributes;

    // 检查必要属性
    for (const attrName of Object.values(REQUIRED_ATTRIBUTES)) {
        if (attributes[attrName] === undefined) {
            throw new Error(`Missing required attribute for Gaussian splatting: ${attrName}`);
        }
    }

    // 验证属性类型
    validateAttributeType(attributes[REQUIRED_ATTRIBUTES.POSITION], "VEC3");
    validateAttributeType(attributes[REQUIRED_ATTRIBUTES.COLOR_0], "VEC4");
    validateAttributeType(attributes[REQUIRED_ATTRIBUTES.ROTATION], "VEC4");
    validateAttributeType(attributes[REQUIRED_ATTRIBUTES.SCALE], "VEC3");

    function validateAttributeType(accessorIndex: number, expectedType: string) {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor) {
            throw new Error(`Missing accessor for index ${accessorIndex}`);
        }
        if (accessor.type !== expectedType) {
            throw new Error(
                `Attribute type mismatch. Expected ${expectedType} for accessor ${accessorIndex}, found ${accessor.type}`
            );
        }
    }
}

async function dequantizePrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive
): Promise<void> {
    // 获取图元的量化扩展配置
    const quantizationExt = scenegraph.getObjectExtension<{
        POSITION?: number;
        NORMAL?: number;
        TANGENT?: number;
        TEXCOORD?: number;
        COLOR?: number;
        GENERIC?: number;
        JOINTS?: number;
        WEIGHTS?: number;
    }>(primitive, MESH_QUANTIZATION_EXT);

    if (!quantizationExt) {
        return; // 没有量化扩展，直接返回
    }

    // 处理所有属性
    for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes)) {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor || accessor.componentType === 5126) {
            // 5126 = FLOAT
            continue; // 跳过浮点类型
        }

        // 获取属性的量化位数
        const bits = getQuantizationBits(attributeName, quantizationExt);
        if (bits === 0) continue;

        // 执行反量化
        const newAccessorIndex = await dequantizeAccessor(scenegraph, accessor, bits);
        primitive.attributes[attributeName] = newAccessorIndex;
    }

    // 移除量化扩展
    scenegraph.removeObjectExtension(primitive, MESH_QUANTIZATION_EXT);
}

function getQuantizationBits(attributeName: string, ext: any): number {
    switch (true) {
        case attributeName.startsWith("POSITION"):
            return ext.POSITION ?? 12;
        case attributeName.startsWith("NORMAL"):
            return ext.NORMAL ?? 10;
        case attributeName.startsWith("TANGENT"):
            return ext.TANGENT ?? 10;
        case attributeName.startsWith("TEXCOORD"):
            return ext.TEXCOORD ?? 12;
        case attributeName.startsWith("COLOR"):
            return ext.COLOR ?? 8;
        case attributeName.startsWith("WEIGHTS"):
            return ext.WEIGHTS ?? 8;
        default:
            return ext.GENERIC ?? 8;
    }
}

async function dequantizeAccessor(
    scenegraph: GLTFScenegraph,
    accessor: any,
    bits: number
): Promise<number> {
    if (!accessor.min || !accessor.max || accessor.min.length !== accessor.max.length) {
        return accessor.index; // 无效的min/max，无法解量化
    }

    const componentCount = getComponentCount(accessor.type);
    if (componentCount === 0) return accessor.index;

    const bufferView = scenegraph.getBufferView(accessor.bufferView);
    if (!bufferView) return accessor.index;

    const bufferData = scenegraph.getTypedArrayForBufferView(bufferView);
    if (!bufferData) return accessor.index;

    // 计算数据范围和偏移
    const count = accessor.count;
    const start = (accessor.byteOffset || 0) + (bufferView.byteOffset || 0);
    const stride =
        bufferView.byteStride || componentCount * getComponentSize(accessor.componentType);

    // 创建独立数据副本
    const bufferCopy = new Uint8Array(
        bufferData.buffer.slice(
            bufferData.byteOffset,
            bufferData.byteOffset + bufferData.byteLength
        )
    );

    // 准备浮点数据存储
    const floatData = new Float32Array(count * componentCount);
    const maxIntegerValue = Math.pow(2, bits) - 1;

    // 解量化数据
    for (let i = 0; i < count; i++) {
        const elementOffset = start + i * stride;

        for (let c = 0; c < componentCount; c++) {
            const valueOffset = elementOffset + c * getComponentSize(accessor.componentType);
            const rawValue = readComponent(
                bufferCopy,
                valueOffset,
                accessor.componentType,
                accessor.normalized
            );

            // 应用解量化公式: value = min + (max - min) * (raw / maxInteger)
            const normalized = rawValue / maxIntegerValue;
            const floatValue = accessor.min[c] + (accessor.max[c] - accessor.min[c]) * normalized;

            floatData[i * componentCount + c] = floatValue;
        }
    }

    // 创建新缓冲区
    const newBuffer = new Uint8Array(floatData.buffer);
    const newBufferViewIndex = scenegraph.addBufferView(newBuffer);

    // 创建新访问器
    const newAccessor = {
        bufferView: newBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: count,
        type: accessor.type,
        min: accessor.min,
        max: accessor.max,
        normalized: false
    };

    return scenegraph.addAccessor(newBufferViewIndex, newAccessor);
}

function readComponent(
    data: TypedArray,
    offset: number,
    componentType: number,
    normalized: boolean
): number {
    const view = new DataView(data.buffer, data.byteOffset + offset);

    switch (componentType) {
        case 5120: // BYTE
            const int8 = view.getInt8(0);
            return normalized ? int8 / 127 : int8;
        case 5121: // UNSIGNED_BYTE
            const uint8 = view.getUint8(0);
            return normalized ? uint8 / 255 : uint8;
        case 5122: // SHORT
            const int16 = view.getInt16(0, true);
            return normalized ? int16 / 32767 : int16;
        case 5123: // UNSIGNED_SHORT
            const uint16 = view.getUint16(0, true);
            return normalized ? uint16 / 65535 : uint16;
        default:
            return 0;
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
    if (extension.bufferView === undefined || extension.bufferView === -1) {
        return;
    }

    const bufferView = scenegraph.getBufferView(extension.bufferView);
    if (!bufferView) {
        throw new Error(`Invalid bufferView index: ${extension.bufferView}`);
    }

    // 检查是否为meshopt压缩
    const meshoptExt = scenegraph.getObjectExtension(bufferView, MESHOPT_COMPRESSION_EXT);
    if (meshoptExt) {
        await decompressMeshopt(scenegraph, primitive, bufferView, meshoptExt);
        scenegraph.removeObjectExtension(bufferView, MESHOPT_COMPRESSION_EXT);
    } else {
        // 处理自定义压缩格式
        const buffer = scenegraph.getTypedArrayForBufferView(bufferView);
        if (!buffer) {
            throw new Error(`Failed to get buffer for bufferView ${extension.bufferView}`);
        }

        const bufferCopy = sliceArrayBuffer(buffer.buffer, buffer.byteOffset);
        const dataView = new DataView(bufferCopy);

        // 读取元数据头
        let offset = 0;
        const attributeCount = dataView.getUint32(offset, true);
        offset += 4;

        const attributes: Record<
            string,
            { value: TypedArray; size: number; normalized?: boolean }
        > = {};

        for (let i = 0; i < attributeCount; i++) {
            // 读取属性名称
            const nameLength = dataView.getUint16(offset, true);
            offset += 2;
            const name = String.fromCharCode(...new Uint8Array(bufferCopy, offset, nameLength));
            offset += nameLength;

            // 读取数据类型
            const dataType = dataView.getUint8(offset);
            offset += 1;

            // 读取元素数量
            const elementCount = dataView.getUint32(offset, true);
            offset += 4;

            // 读取组件大小
            const componentSize = dataView.getUint8(offset);
            offset += 1;

            // 读取归一化标志
            const normalized = Boolean(dataView.getUint8(offset));
            offset += 1;

            // 创建类型化数组
            let value: TypedArray;
            switch (dataType) {
                case 0: // Float32
                    value = new Float32Array(bufferCopy, offset, elementCount);
                    break;
                case 1: // Uint8
                    value = new Uint8Array(bufferCopy, offset, elementCount);
                    break;
                case 2: // Int8
                    value = new Int8Array(bufferCopy, offset, elementCount);
                    break;
                case 3: // Uint16
                    value = new Uint16Array(bufferCopy, offset, elementCount);
                    break;
                case 4: // Int16
                    value = new Int16Array(bufferCopy, offset, elementCount);
                    break;
                case 5: // Uint32
                    value = new Uint32Array(bufferCopy, offset, elementCount);
                    break;
                default:
                    throw new Error(`Unsupported data type: ${dataType}`);
            }

            offset += elementCount * value.BYTES_PER_ELEMENT;
            attributes[name] = { value, size: componentSize, normalized };
        }

        // 处理不透明度
        processOpacity(attributes);

        // 更新图元属性
        const decodedAttributes = getGLTFAccessors(attributes);
        for (const [attributeName, decodedAttribute] of Object.entries(decodedAttributes)) {
            if (primitive.attributes[attributeName]) {
                const originalAccessor = scenegraph.getAccessor(
                    primitive.attributes[attributeName]
                );
                if (originalAccessor?.min && originalAccessor?.max) {
                    decodedAttribute.min = originalAccessor.min;
                    decodedAttribute.max = originalAccessor.max;
                }
            }
        }

        // 更新属性
        primitive.attributes = decodedAttributes as any;
    }
}

// 处理未压缩数据的不透明度
function processUncompressedOpacity(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive) {
    const opacityAttrIndex = primitive.attributes[OPTIONAL_ATTRIBUTES.OPACITY];
    const colorAttrIndex = primitive.attributes[REQUIRED_ATTRIBUTES.COLOR_0];

    if (opacityAttrIndex === undefined || colorAttrIndex === undefined) {
        return;
    }

    const opacityAccessor = scenegraph.getAccessor(opacityAttrIndex);
    const colorAccessor = scenegraph.getAccessor(colorAttrIndex);

    if (!opacityAccessor || !colorAccessor) {
        return;
    }

    // 确保颜色是VEC4
    if (colorAccessor.type !== "VEC4") {
        return;
    }

    const opacityBufferView = scenegraph.getBufferView(opacityAccessor.bufferView!);
    const colorBufferView = scenegraph.getBufferView(colorAccessor.bufferView!);

    if (!opacityBufferView || !colorBufferView) {
        return;
    }

    const opacityData = scenegraph.getTypedArrayForBufferView(opacityBufferView);
    const colorData = scenegraph.getTypedArrayForBufferView(colorBufferView);

    if (!opacityData || !colorData) {
        return;
    }

    // 确保长度匹配
    if (opacityData.length !== colorData.length / 4) {
        return;
    }

    // 合并不透明度到COLOR_0的A通道
    if (colorData instanceof Uint8Array) {
        for (let i = 0; i < opacityData.length; i++) {
            colorData[i * 4 + 3] = Math.round(opacityData[i] * 255);
        }
    }

    // 移除不透明度属性
    delete primitive.attributes[OPTIONAL_ATTRIBUTES.OPACITY];
}

// 使用meshopt解压
async function decompressMeshopt(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    bufferView: any,
    meshoptExt: any
) {
    // 获取压缩数据
    const compressedData = scenegraph.getTypedArrayForBufferView(bufferView);
    if (!compressedData) {
        throw new Error("Failed to get compressed data for meshopt decompression");
    }

    // 验证数据长度
    if (compressedData.byteLength < meshoptExt.byteLength) {
        throw new Error("Compressed data length mismatch");
    }

    // 获取顶点数量并计算16字节对齐
    const vertexCount = scenegraph.getAccessor(primitive.attributes.POSITION)?.count || 0;
    const alignedVertexCount = Math.ceil(vertexCount / 4) * 4; // 16字节对齐

    // 计算步长（位置3 + 颜色4 + 缩放3 + 旋转4 = 14个float）
    const stride = 14 * Float32Array.BYTES_PER_ELEMENT;

    // 创建目标缓冲区
    const decompressedBuffer = new ArrayBuffer(alignedVertexCount * stride);

    try {
        // 使用meshopt解码器解压
        await meshoptDecodeGltfBuffer(
            new Uint8Array(decompressedBuffer),
            alignedVertexCount, // 使用对齐后的顶点数
            stride,
            new Uint8Array(compressedData.buffer, compressedData.byteOffset, meshoptExt.byteLength),
            "ATTRIBUTES"
        );

        // 将解压后的数据转换为Float32Array
        const floatData = new Float32Array(decompressedBuffer, 0, alignedVertexCount * 14);

        // 高效分割属性数据
        const positions = new Float32Array(vertexCount * 3);
        const colors = new Float32Array(vertexCount * 4);
        const scales = new Float32Array(vertexCount * 3);
        const rotations = new Float32Array(vertexCount * 4);

        positions.set(floatData.subarray(0, vertexCount * 3));
        colors.set(
            floatData.subarray(alignedVertexCount * 3, alignedVertexCount * 3 + vertexCount * 4)
        );
        scales.set(
            floatData.subarray(alignedVertexCount * 7, alignedVertexCount * 7 + vertexCount * 3)
        );
        rotations.set(
            floatData.subarray(alignedVertexCount * 10, alignedVertexCount * 10 + vertexCount * 4)
        );

        // 创建新的buffer view
        const bufferViewIndex = scenegraph.addBufferView(new Uint8Array(decompressedBuffer));

        // 计算各属性的字节偏移量（使用对齐后的顶点数）
        const POSITION_OFFSET = 0;
        const COLOR_OFFSET = alignedVertexCount * 3 * Float32Array.BYTES_PER_ELEMENT;
        const SCALE_OFFSET = COLOR_OFFSET + alignedVertexCount * 4 * Float32Array.BYTES_PER_ELEMENT;
        const ROTATION_OFFSET =
            SCALE_OFFSET + alignedVertexCount * 3 * Float32Array.BYTES_PER_ELEMENT;

        // 创建属性访问器
        const createAccessor = (
            byteOffset: number,
            type: string,
            components: number,
            data: Float32Array
        ) => {
            // 计算min/max
            const min = new Array(components).fill(Infinity);
            const max = new Array(components).fill(-Infinity);

            for (let i = 0; i < data.length; i += components) {
                for (let j = 0; j < components; j++) {
                    const val = data[i + j];
                    if (val < min[j]) min[j] = val;
                    if (val > max[j]) max[j] = val;
                }
            }

            return scenegraph.addAccessor(bufferViewIndex, {
                componentType: 5126, // FLOAT
                count: vertexCount,
                type,
                byteOffset,
                min,
                max
            });
        };

        // 更新图元属性
        primitive.attributes.POSITION = createAccessor(POSITION_OFFSET, "VEC3", 3, positions);
        primitive.attributes.COLOR_0 = createAccessor(COLOR_OFFSET, "VEC4", 4, colors);
        primitive.attributes._SCALE = createAccessor(SCALE_OFFSET, "VEC3", 3, scales);
        primitive.attributes._ROTATION = createAccessor(ROTATION_OFFSET, "VEC4", 4, rotations);
    } catch (error) {
        throw new Error(`Meshopt decompression failed: ${error.message}`);
    }
}

// 处理球谐系数
function processSphericalHarmonics(
    primitive: GLTFMeshPrimitive,
    sphericalHarmonics: { coefficients: number[] }
): void {
    // 存储到图元的extras中
    primitive.extras = primitive.extras || {};
    primitive.extras.sphericalHarmonics = { coefficients: sphericalHarmonics.coefficients };
}

function* makeMeshPrimitiveIterator(scenegraph: GLTFScenegraph): Generator<GLTFMeshPrimitive> {
    for (const mesh of scenegraph.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            yield primitive;
        }
    }
}

// 处理不透明度 - 合并到COLOR_0的A通道
function processOpacity(attributes: Record<string, any>) {
    // 检查是否存在不透明度属性
    if (attributes[OPTIONAL_ATTRIBUTES.OPACITY] && attributes[REQUIRED_ATTRIBUTES.COLOR_0]) {
        const opacityAttr = attributes[OPTIONAL_ATTRIBUTES.OPACITY];
        const colorAttr = attributes[REQUIRED_ATTRIBUTES.COLOR_0];

        // 确保颜色是VEC4
        if (colorAttr.size !== 4) {
            throw new Error(
                `Invalid COLOR_0 size for opacity merging: expected 4, got ${colorAttr.size}`
            );
        }

        // 确保长度匹配
        if (opacityAttr.value.length !== colorAttr.value.length / 4) {
            throw new Error(
                `Opacity length ${opacityAttr.value.length} doesn't match color length ${
                    colorAttr.value.length / 4
                }`
            );
        }

        // 合并不透明度到COLOR_0的A通道
        const colorData = colorAttr.value;
        const opacityData = opacityAttr.value;

        if (colorData instanceof Uint8Array || colorData instanceof Uint8ClampedArray) {
            for (let i = 0; i < opacityData.length; i++) {
                colorData[i * 4 + 3] = Math.round(opacityData[i] * 255);
            }
        } else if (colorData instanceof Float32Array) {
            for (let i = 0; i < opacityData.length; i++) {
                colorData[i * 4 + 3] = opacityData[i];
            }
        } else {
            throw new Error(`Unsupported COLOR_0 type: ${colorData.constructor.name}`);
        }

        // 移除不透明度属性
        delete attributes[OPTIONAL_ATTRIBUTES.OPACITY];
    }
}
