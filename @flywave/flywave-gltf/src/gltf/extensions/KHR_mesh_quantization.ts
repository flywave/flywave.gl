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

// 缓存解量化结果，避免重复处理相同访问器
const dequantizationCache = new Map<string, number>();

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions) {
    const scenegraph = new GLTFScenegraph(gltfData);

    // 并行处理所有需要解量化的图元
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

    // 清除缓存
    dequantizationCache.clear();

    // 移除顶层扩展声明
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

                // 创建缓存键
                const cacheKey = `${accessorIndex}:${attributeName}`;

                // 检查缓存
                if (dequantizationCache.has(cacheKey)) {
                    primitive.attributes[attributeName] = dequantizationCache.get(cacheKey)!;
                    return;
                }

                // 创建新访问器避免污染原始数据
                const newAccessorIndex = await dequantizeAccessor(
                    scenegraph,
                    originalAccessor,
                    params,
                    attributeName,
                    options
                );

                // 更新图元属性索引到新访问器
                primitive.attributes[attributeName] = newAccessorIndex;

                // 存入缓存
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
    // 跳过浮点类型和不需要解量化的属性
    if (accessor.componentType === 5126) {
        return accessor.bufferView!; // 返回原始索引
    }

    // 确保有有效的缓冲视图
    if (accessor.bufferView === undefined) {
        throw new Error(`访问器 ${accessor.name || "unnamed"} 缺少缓冲视图引用`);
    }

    const bufferView = scenegraph.json.bufferViews?.[accessor.bufferView] as
        | GLTFBufferView
        | undefined;
    if (!bufferView) {
        throw new Error(`无法找到访问器 ${accessor.bufferView} 引用的缓冲视图`);
    }

    // 获取原始量化数据
    const bufferData = scenegraph.getTypedArrayForBufferView(accessor.bufferView);
    if (!bufferData) {
        throw new Error(`无法获取缓冲视图 ${accessor.bufferView} 的数据`);
    }

    // 计算组件属性
    const componentSize = getComponentSize(accessor.type);
    const componentByteSize = getComponentByteSize(accessor.componentType);
    const stride = bufferView.byteStride || componentSize * componentByteSize;

    // 获取量化位数（根据属性类型）
    const bits = getQuantizationBits(attributeName, params);

    // 验证min/max值
    if (!accessor.min || !accessor.max) {
        throw new Error(`访问器 ${accessor.name || "unnamed"} 缺少解量化所需的 min/max 值`);
    }

    const minValues = accessor.min as number[];
    const maxValues = accessor.max as number[];

    if (minValues.length < componentSize || maxValues.length < componentSize) {
        throw new Error(`访问器 ${accessor.name || "unnamed"} 的 min/max 数组长度不匹配组件大小`);
    }

    // 执行解量化
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

    // 添加新的缓冲视图（使用GLTFScenegraph的API）
    const newBufferViewIndex = scenegraph.addBufferView(dequantized);

    // 更新缓冲视图的元数据
    const newBufferView = scenegraph.json.bufferViews?.[newBufferViewIndex];
    if (newBufferView) {
        newBufferView.byteStride = componentSize * 4; // 解量化后每个组件4字节

        // 保留原始目标类型（如果存在）
        if (bufferView.target !== undefined) {
            newBufferView.target = bufferView.target;
        }

        // 保留名称（如果存在）
        if (bufferView.name) {
            newBufferView.name = `${bufferView.name}_dequantized`;
        }
    }

    // 创建新访问器（保留元数据）
    const newAccessor = { ...accessor };
    newAccessor.bufferView = newBufferViewIndex;
    newAccessor.componentType = 5126; // FLOAT
    newAccessor.normalized = false;

    // 保留原始名称（如果存在）
    if (accessor.name) {
        newAccessor.name = `${accessor.name}_dequantized`;
    }

    // 添加新访问器并返回索引
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
    // 计算量化范围
    const maxIntegerValue = Math.pow(2, bits) - 1;

    // 确定是否为无符号整型（根据GLTF组件类型）
    const isUnsigned =
        accessor.componentType === 5121 || // UNSIGNED_BYTE
        accessor.componentType === 5123 || // UNSIGNED_SHORT
        accessor.componentType === 5125; // UNSIGNED_INT

    // 根据规范计算量化偏移量（用于有符号整型）
    const quantizationOffset = isUnsigned ? 0 : Math.pow(2, bits - 1);

    const srcView = new DataView(data);
    const accessorOffset = accessor.byteOffset || 0;
    const totalOffset = baseByteOffset + accessorOffset;
    const dstArray = new Float32Array(accessor.count * components);

    // 计算每个分量的范围（优化性能）
    const ranges: number[] = [];
    for (let c = 0; c < components; c++) {
        ranges[c] = max[c] - min[c];
    }

    // 处理无步长情况
    if (stride === components * componentByteSize) {
        const startOffset = totalOffset;

        for (let i = 0; i < accessor.count; i++) {
            const elementOffset = startOffset + i * stride;

            for (let c = 0; c < components; c++) {
                const byteOffset = elementOffset + c * componentByteSize;
                const rawValue = readComponent(srcView, byteOffset, accessor.componentType);

                // 正确的解量化公式（符合规范）
                const normalized = isUnsigned
                    ? rawValue / maxIntegerValue
                    : rawValue / (maxIntegerValue / 2);

                const floatValue = min[c] + ranges[c] * normalized;
                dstArray[i * components + c] = floatValue;
            }
        }
    } else {
        // 处理带步长的情况（非连续数据）
        let dstIndex = 0;
        for (let i = 0; i < accessor.count; i++) {
            const elementOffset = totalOffset + i * stride;

            for (let c = 0; c < components; c++) {
                const byteOffset = elementOffset + c * componentByteSize;
                const rawValue = readComponent(srcView, byteOffset, accessor.componentType);

                // 使用量化偏移量进行解量化
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
            case 5125: // UNSIGNED_INT (非标准但可能)
                return view.getUint32(offset, true);
            case 5124: // INT (非标准但可能)
                return view.getInt32(offset, true);
            default:
                throw new Error(`不支持的组件类型: ${type}`);
        }
    } catch (error) {
        throw new Error(`在偏移量 ${offset} 读取组件失败: ${error.message}`);
    }
}

function getQuantizationBits(attributeName: string, params: QuantizationParams): number {
    // 根据属性语义获取对应位数
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
        case 5126: // FLOAT (虽然跳过但保留)
            return 4;
        default:
            throw new Error(`不支持的组件类型: ${componentType}`);
    }
}
