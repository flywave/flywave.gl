import { sliceArrayBuffer } from "@flywave/flywave-utils";
import { TypedArray } from "three";

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import { getGLTFAccessors } from "../gltf-utils/gltf-attribute-utils";
import type {
    GLTF,
    GLTF_KHR_gaussian_splatting,
    GLTFMeshPrimitive
} from "../types/gltf-json-schema";

const EXT_NAME = "KHR_gaussian_splatting";

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

export function encode(gltfData: { json: GLTF }, options: GLTFLoaderOptions): { json: GLTF } {
    const scenegraph = new GLTFScenegraph(gltfData);
    encodeGaussianSplatting(scenegraph, options);
    scenegraph.createBinaryChunk();
    return scenegraph.gltf;
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

function encodeGaussianSplatting(scenegraph: GLTFScenegraph, options: GLTFLoaderOptions): void {
    for (const mesh of scenegraph.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            if (isGaussianSplatPrimitive(primitive)) {
                // 获取球谐系数
                const sphericalHarmonics = getSphericalHarmonics(primitive);

                const extension: GLTF_KHR_gaussian_splatting = {
                    attributes: {
                        POSITION: primitive.attributes.POSITION,
                        COLOR_0: primitive.attributes.COLOR_0,
                        _SCALE: primitive.attributes._SCALE,
                        _ROTATION: primitive.attributes._ROTATION
                    },
                    sphericalHarmonics: sphericalHarmonics
                        ? { coefficients: sphericalHarmonics }
                        : undefined,
                    bufferView: -1
                };

                // 添加压缩信息
                if (options.splats?.compress) {
                    const bufferViewIndex = compressPrimitive(scenegraph, primitive, options);
                    if (bufferViewIndex !== -1) {
                        extension.bufferView = bufferViewIndex;
                    }
                }

                scenegraph.addObjectExtension(primitive, EXT_NAME, extension);
                scenegraph.addRequiredExtension(EXT_NAME);
            }
        }
    }
}

// 从图元中提取球谐系数
function getSphericalHarmonics(primitive: GLTFMeshPrimitive): number[] | null {
    // 检查extras中是否有球谐系数
    if (primitive.extras?.sphericalHarmonics?.coefficients) {
        return primitive.extras.sphericalHarmonics.coefficients;
    }

    // 检查扩展数据中是否有球谐系数
    const ext = primitive.extensions?.[EXT_NAME] as GLTF_KHR_gaussian_splatting | undefined;
    if (ext?.sphericalHarmonics?.coefficients) {
        return ext.sphericalHarmonics.coefficients;
    }

    return null;
}

function isGaussianSplatPrimitive(primitive: GLTFMeshPrimitive): boolean {
    // 必须是点图元
    if (primitive.mode !== undefined && primitive.mode !== 0) {
        return false;
    }

    // 检查必要属性
    for (const attr of Object.values(REQUIRED_ATTRIBUTES)) {
        if (primitive.attributes[attr] === undefined) {
            return false;
        }
    }

    return true;
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
        // 验证图元属性
        validateGaussianPrimitive(scenegraph, primitive);

        // 处理压缩数据
        if (extension.bufferView !== undefined) {
            await decompressPrimitive(scenegraph, primitive, extension, options);
        }

        // 处理球谐系数
        if (extension.sphericalHarmonics) {
            processSphericalHarmonics(primitive, extension.sphericalHarmonics);
        }

        // 清理扩展
        scenegraph.removeObjectExtension(primitive, EXT_NAME);
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

async function decompressPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    extension: GLTF_KHR_gaussian_splatting,
    options: GLTFLoaderOptions
): Promise<void> {
    if (extension.bufferView === undefined) {
        return;
    }

    const bufferView = scenegraph.getBufferView(extension.bufferView);
    if (!bufferView) {
        throw new Error(`Invalid bufferView index: ${extension.bufferView}`);
    }

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

    const attributes: Record<string, { value: TypedArray; size: number; normalized?: boolean }> =
        {};

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
            const originalAccessor = scenegraph.getAccessor(primitive.attributes[attributeName]);
            if (originalAccessor?.min && originalAccessor?.max) {
                decodedAttribute.min = originalAccessor.min;
                decodedAttribute.max = originalAccessor.max;
            }
        }
    }

    // 更新属性
    // @ts-ignore
    primitive.attributes = decodedAttributes;
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

// 压缩图元
function compressPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions
): number {
    try {
        // 收集属性数据
        const attributes: Record<string, { data: TypedArray; size: number; normalized?: boolean }> =
            {};

        for (const [attrName, accessorIndex] of Object.entries(primitive.attributes)) {
            const accessor = scenegraph.getAccessor(accessorIndex);
            if (!accessor) continue;

            const bufferView = scenegraph.getBufferView(accessor.bufferView!);
            if (!bufferView) continue;

            const data = scenegraph.getTypedArrayForBufferView(bufferView);
            attributes[attrName] = {
                data,
                size: getComponentCount(accessor.type),
                normalized: accessor.normalized
            };
        }

        // 处理不透明度
        processOpacityForCompression(attributes);

        // 计算总大小
        let totalSize = 4; // 属性数量
        for (const [name, attr] of Object.entries(attributes)) {
            totalSize += 2; // 名称长度
            totalSize += name.length; // 名称
            totalSize += 1; // 数据类型
            totalSize += 4; // 元素数量
            totalSize += 1; // 组件大小
            totalSize += 1; // 归一化标志
            totalSize += attr.data.byteLength; // 数据
        }

        // 创建缓冲区
        const buffer = new ArrayBuffer(totalSize);
        const dataView = new DataView(buffer);
        let offset = 0;

        // 写入属性数量
        dataView.setUint32(offset, Object.keys(attributes).length, true);
        offset += 4;

        for (const [name, attr] of Object.entries(attributes)) {
            // 写入名称长度和名称
            const nameBytes = new TextEncoder().encode(name);
            dataView.setUint16(offset, nameBytes.length, true);
            offset += 2;
            new Uint8Array(buffer, offset, nameBytes.length).set(nameBytes);
            offset += nameBytes.length;

            // 写入数据类型
            let dataType: number;
            if (attr.data instanceof Float32Array) dataType = 0;
            else if (attr.data instanceof Uint8Array) dataType = 1;
            else if (attr.data instanceof Int8Array) dataType = 2;
            else if (attr.data instanceof Uint16Array) dataType = 3;
            else if (attr.data instanceof Int16Array) dataType = 4;
            else if (attr.data instanceof Uint32Array) dataType = 5;
            else throw new Error(`Unsupported data type: ${attr.data.constructor.name}`);

            dataView.setUint8(offset, dataType);
            offset += 1;

            // 写入元素数量
            dataView.setUint32(offset, attr.data.length, true);
            offset += 4;

            // 写入组件大小
            dataView.setUint8(offset, attr.size);
            offset += 1;

            // 写入归一化标志
            dataView.setUint8(offset, attr.normalized ? 1 : 0);
            offset += 1;

            // 写入数据
            const dataBytes = new Uint8Array(
                attr.data.buffer,
                attr.data.byteOffset,
                attr.data.byteLength
            );
            new Uint8Array(buffer, offset, dataBytes.length).set(dataBytes);
            offset += dataBytes.length;
        }

        // 创建新的buffer view
        const bufferViewIndex = scenegraph.addBufferView(new Uint8Array(buffer));

        return bufferViewIndex;
    } catch (error) {
        return -1;
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

// 压缩时处理不透明度
function processOpacityForCompression(
    attributes: Record<string, { data: TypedArray; size: number; normalized?: boolean }>
) {
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
        if (opacityAttr.data.length !== colorAttr.data.length / 4) {
            throw new Error(
                `Opacity length ${opacityAttr.data.length} doesn't match color length ${
                    colorAttr.data.length / 4
                }`
            );
        }

        // 合并不透明度到COLOR_0的A通道
        const colorData = colorAttr.data;
        const opacityData = opacityAttr.data;

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

// 获取组件数量
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
            throw new Error(`Unknown accessor type: ${type}`);
    }
}
