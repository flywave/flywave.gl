/* Copyright (C) 2025 flywave.gl contributors */

import { loadSpz } from '@spz-loader/core';
import { GLTFScenegraph } from "../../api/gltf-scenegraph";
import type { GLTFMeshPrimitive } from "../../types/gltf-json-schema";
import { MathUtils } from 'three';

export const EXT_SPZ_COMPRESSION = "KHR_gaussian_splatting_compression_spz_2";

// SPZ 数据接口
export interface SPZData {
    positions: Float32Array;
    colors: Float32Array;
    scales: Float32Array;
    rotations: Float32Array;
    alphas?: Float32Array;
    sh?: Float32Array;
}

export interface SPZDecompressionOptions {
    mergeAlphaToColor?: boolean;
    preserveSHData?: boolean;
}

export interface SPZDecompressionResult {
    vertexCount: number;
    attributes: {
        POSITION: number;
        COLOR_0: number;
        _SCALE: number;
        _ROTATION: number;
    };
    sphericalHarmonics?: {
        accessor: number;
        coefficientCount: number;
        degree: number;
    };
}
 
// SPZ 解压器
export class SPZDecompressor {
    /**
     * 解压 SPZ 压缩的高斯泼溅数据
     */
    static async decompress(
        scenegraph: GLTFScenegraph,
        primitive: GLTFMeshPrimitive,
        spzExtension: any,
        options: SPZDecompressionOptions = {}
    ): Promise<SPZDecompressionResult> {
        const { mergeAlphaToColor = true, preserveSHData = true } = options;

        console.log('Starting SPZ decompression...');

        // 验证扩展数据
        this.validateExtension(spzExtension);

        // 获取压缩数据
        const compressedData = this.getCompressedData(scenegraph, spzExtension.bufferView);

        // 使用 @spz-loader/core 解码
        const spzData = await this.decodeSPZ(compressedData);

        // 验证解压后的数据
        this.validateDecompressedData(spzData);

        // 计算顶点数并验证
        const vertexCount = this.calculateVertexCount(spzData);
        console.log(`SPZ decompression: ${vertexCount} vertices found`);

        // 创建解压后的属性
        const attributes = await this.createDecompressedAttributes(
            scenegraph,
            spzData,
            vertexCount,
            { mergeAlphaToColor, preserveSHData }
        );

        // 验证创建的访问器类型
        await this.validateCreatedAccessors(scenegraph, attributes);

        // 处理球谐系数
        let sphericalHarmonics: SPZDecompressionResult['sphericalHarmonics'] = undefined;
        if (spzData.sh && preserveSHData) {
            sphericalHarmonics = await this.handleSphericalHarmonics(
                scenegraph,
                spzData.sh,
                vertexCount
            );
        }

        console.log('SPZ decompression completed successfully');

        return {
            vertexCount,
            attributes,
            sphericalHarmonics
        };
    }

    /**
     * 验证创建的访问器类型
     */
    private static async validateCreatedAccessors(
        scenegraph: GLTFScenegraph,
        attributes: SPZDecompressionResult['attributes']
    ): Promise<void> {
        const expectedTypes = {
            POSITION: "VEC3",
            COLOR_0: "VEC4",
            _SCALE: "VEC3",
            _ROTATION: "VEC4"
        };

        for (const [attrName, accessorIndex] of Object.entries(attributes)) {
            const accessor = scenegraph.getAccessor(accessorIndex);
            if (!accessor) {
                throw new Error(`Failed to get accessor for ${attrName} at index ${accessorIndex}`);
            }

            const expectedType = expectedTypes[attrName as keyof typeof expectedTypes];
            if (accessor.type !== expectedType) {
                console.error(`Accessor validation failed for ${attrName}:`, {
                    expected: expectedType,
                    actual: accessor.type
                });
                throw new Error(`Attribute type mismatch for ${attrName}. Expected ${expectedType}, found ${accessor.type}`);
            }
        }
    }

    /**
     * 验证 SPZ 扩展数据
     */
    private static validateExtension(extension: any): void {
        if (typeof extension.bufferView !== 'number') {
            throw new Error('SPZ extension must have a valid bufferView index');
        }

        if (extension.bufferView < 0) {
            throw new Error('SPZ extension bufferView index cannot be negative');
        }
    }

    /**
     * 验证解压后的数据
     */
    private static validateDecompressedData(spzData: SPZData): void {
        // 验证必需数据存在
        if (!spzData.positions || !spzData.colors || !spzData.scales || !spzData.rotations) {
            throw new Error('SPZ data missing required fields');
        }

        // 验证数据长度一致性
        const positionCount = spzData.positions.length;
        const colorCount = spzData.colors.length;
        const scaleCount = spzData.scales.length;
        const rotationCount = spzData.rotations.length;

        if (positionCount % 3 !== 0) {
            throw new Error(`Invalid positions data length: ${positionCount} (must be multiple of 3)`);
        }
        if (colorCount % 3 !== 0) {
            throw new Error(`Invalid colors data length: ${colorCount} (must be multiple of 3)`);
        }
        if (scaleCount % 3 !== 0) {
            throw new Error(`Invalid scales data length: ${scaleCount} (must be multiple of 3)`);
        }
        if (rotationCount % 4 !== 0) {
            throw new Error(`Invalid rotations data length: ${rotationCount} (must be multiple of 4)`);
        }

        const vertexCountFromPositions = positionCount / 3;
        const vertexCountFromColors = colorCount / 3;
        const vertexCountFromScales = scaleCount / 3;
        const vertexCountFromRotations = rotationCount / 4;

        // 验证顶点数一致性
        if (vertexCountFromColors !== vertexCountFromPositions) {
            throw new Error(`Vertex count mismatch: positions=${vertexCountFromPositions}, colors=${vertexCountFromColors}`);
        }
        if (vertexCountFromScales !== vertexCountFromPositions) {
            throw new Error(`Vertex count mismatch: positions=${vertexCountFromPositions}, scales=${vertexCountFromScales}`);
        }
        if (vertexCountFromRotations !== vertexCountFromPositions) {
            throw new Error(`Vertex count mismatch: positions=${vertexCountFromPositions}, rotations=${vertexCountFromRotations}`);
        }

        // 验证透明度数据（如果存在）
        if (spzData.alphas && spzData.alphas.length !== vertexCountFromPositions) {
            throw new Error(`Alpha data length mismatch: ${spzData.alphas.length} != ${vertexCountFromPositions}`);
        }

        // 验证球谐系数数据（如果存在）
        if (spzData.sh && spzData.sh.length % vertexCountFromPositions !== 0) {
            throw new Error(`Spherical harmonics data length invalid: ${spzData.sh.length} for ${vertexCountFromPositions} vertices`);
        }
    }

    /**
     * 计算顶点数
     */
    private static calculateVertexCount(spzData: SPZData): number {
        const vertexCount = spzData.positions.length / 3;

        if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
            throw new Error(`Invalid vertex count calculated: ${vertexCount}`);
        }

        return vertexCount;
    }

    /**
     * 获取压缩数据
     */
    private static getCompressedData(scenegraph: GLTFScenegraph, bufferViewIndex: number): Uint8Array {
        const bufferView = scenegraph.getBufferView(bufferViewIndex);
        if (!bufferView) {
            throw new Error(`Invalid bufferView index: ${bufferViewIndex}`);
        }

        const compressedData = scenegraph.getTypedArrayForBufferView(bufferView);
        if (!compressedData) {
            throw new Error("Failed to get SPZ compressed data from bufferView");
        }

        // 验证 bufferView 数据大小
        if (compressedData.byteLength === 0) {
            throw new Error("SPZ compressed data is empty");
        }

        console.log(`SPZ compressed data size: ${compressedData.byteLength} bytes`);

        return compressedData;
    }

    /**
     * 使用 @spz-loader/core 解码 SPZ 数据
     */
    private static async decodeSPZ(compressedData: Uint8Array): Promise<SPZData> {
        try {
            const arrayBuffer = compressedData.buffer.slice(
                compressedData.byteOffset,
                compressedData.byteOffset + compressedData.byteLength
            );

            // 使用 @spz-loader/core 解码
            const gaussianCloud = await loadSpz(arrayBuffer);

            // 验证解码结果
            if (!gaussianCloud.positions || !gaussianCloud.colors || !gaussianCloud.scales || !gaussianCloud.rotations) {
                throw new Error('Invalid SPZ decoding result: missing required fields');
            }

            return {
                positions: gaussianCloud.positions,
                colors: gaussianCloud.colors,
                scales: gaussianCloud.scales,
                rotations: gaussianCloud.rotations,
                alphas: gaussianCloud.alphas,
                sh: gaussianCloud.sh
            };
        } catch (error) {
            console.error('SPZ decoding failed:', error);
            throw new Error(`SPZ decoding failed: ${error.message}`);
        }
    }

    /**
     * 创建解压后的属性
     */
    private static async createDecompressedAttributes(
        scenegraph: GLTFScenegraph,
        spzData: SPZData,
        vertexCount: number,
        options: SPZDecompressionOptions
    ): Promise<SPZDecompressionResult['attributes']> {
        // 处理颜色数据（可能包含透明度）
        const colorData = await this.prepareColorData(spzData, vertexCount, options.mergeAlphaToColor);

        // 创建所有必需的属性 - 使用标准的属性名称
        const attributes = {
            POSITION: this.createFloatAttribute(scenegraph, spzData.positions, "VEC3", 3, vertexCount),
            COLOR_0: this.createColorAttribute(scenegraph, colorData, vertexCount),
            _SCALE: this.createFloatAttribute(scenegraph, spzData.scales, "VEC3", 3, vertexCount),
            _ROTATION: this.createFloatAttribute(scenegraph, spzData.rotations, "VEC4", 4, vertexCount)
        };

        return attributes;
    }

    /**
     * 准备颜色数据（处理透明度并使用钳制转换）
     */
    private static async prepareColorData(
        spzData: SPZData,
        vertexCount: number,
        mergeAlphaToColor: boolean
    ): Promise<Uint8Array> {
        const colorsWithAlpha = new Uint8Array(vertexCount * 4);

        if (spzData.alphas && mergeAlphaToColor) {
            // 创建带透明度的颜色数据，使用钳制转换
            for (let i = 0; i < vertexCount; i++) {
                colorsWithAlpha[i * 4] = MathUtils.clamp(spzData.colors[i * 3], 0, 1) * 255;          // R
                colorsWithAlpha[i * 4 + 1] = MathUtils.clamp(spzData.colors[i * 3 + 1], 0, 1) * 255;  // G
                colorsWithAlpha[i * 4 + 2] = MathUtils.clamp(spzData.colors[i * 3 + 2], 0, 1) * 255;  // B
                colorsWithAlpha[i * 4 + 3] = MathUtils.clamp(spzData.alphas[i], 0, 1) * 255;          // A
            }
        } else {
            // 如果没有透明度或不需要合并，将 RGB 转换为 RGBA
            for (let i = 0; i < vertexCount; i++) {
                colorsWithAlpha[i * 4] = MathUtils.clamp(spzData.colors[i * 3], 0, 1) * 255;          // R
                colorsWithAlpha[i * 4 + 1] = MathUtils.clamp(spzData.colors[i * 3 + 1], 0, 1) * 255;  // G
                colorsWithAlpha[i * 4 + 2] = MathUtils.clamp(spzData.colors[i * 3 + 2], 0, 1) * 255;  // B
                colorsWithAlpha[i * 4 + 3] = 255; // 默认不透明度为 1 (255)
            }
        }

        return colorsWithAlpha;
    }

    /**
     * 创建颜色属性访问器（使用UNSIGNED_BYTE）
     */
    private static createColorAttribute(
        scenegraph: GLTFScenegraph,
        data: Uint8Array,
        vertexCount: number
    ): number {
        const components = 4; // RGBA
        const actualCount = data.length / components;
        
        if (actualCount !== vertexCount) {
            throw new Error(`Color data count mismatch: expected ${vertexCount}, got ${actualCount}`);
        }

        const bufferViewIndex = scenegraph.addBufferView(data);
        
        const accessorData = {
            bufferView: bufferViewIndex,
            size: components,
            componentType: 5121, // UNSIGNED_BYTE
            count: vertexCount,
            type: "VEC4",
            min: [0, 0, 0, 0],
            max: [255, 255, 255, 255]
        };

        const accessorIndex = scenegraph.addAccessor(bufferViewIndex, accessorData);
        return this.validateAndFixAccessorType(scenegraph, accessorIndex, "VEC4");
    }

    /**
     * 创建浮点属性访问器
     */
    private static createFloatAttribute(
        scenegraph: GLTFScenegraph,
        data: Float32Array,
        type: string,
        components: number,
        expectedCount: number
    ): number {
        // 验证数据长度
        const actualCount = data.length / components;
        if (!Number.isInteger(actualCount) || actualCount !== expectedCount) {
            throw new Error(`Data count mismatch for ${type}: expected ${expectedCount}, got ${actualCount}`);
        }

        if (data.length % components !== 0) {
            throw new Error(`Data length ${data.length} is not a multiple of components ${components}`);
        }

        const bufferViewIndex = this.createAlignedBufferView(scenegraph, data);
        const count = data.length / components;
        const { min, max } = this.calculateMinMax(data, components);

        const accessorData = {
            bufferView: bufferViewIndex,
            size: components,
            componentType: 5126, // FLOAT
            count: count,
            type: type,
            min: min,
            max: max
        };

        const accessorIndex = scenegraph.addAccessor(bufferViewIndex, accessorData);
        return this.validateAndFixAccessorType(scenegraph, accessorIndex, type);
    }

    /**
     * 验证和修复访问器类型
     */
    private static validateAndFixAccessorType(
        scenegraph: GLTFScenegraph,
        accessorIndex: number,
        expectedType: string
    ): number {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor) {
            throw new Error(`Failed to get accessor at index ${accessorIndex}`);
        }

        if (accessor.type !== expectedType) {
            // 直接修改 JSON 中的访问器类型
            if (scenegraph.json.accessors && scenegraph.json.accessors[accessorIndex]) {
                scenegraph.json.accessors[accessorIndex].type = expectedType;
            } else {
                throw new Error(`Cannot fix accessor type: accessor not found at index ${accessorIndex}`);
            }
        }

        return accessorIndex;
    }

    /**
     * 创建字节对齐的 BufferView
     */
    private static createAlignedBufferView(scenegraph: GLTFScenegraph, data: Float32Array): number {
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

    /**
     * 计算最小最大值
     */
    private static calculateMinMax(data: Float32Array, components: number): { min: number[]; max: number[] } {
        const min = new Array(components).fill(Infinity);
        const max = new Array(components).fill(-Infinity);

        for (let i = 0; i < data.length; i += components) {
            for (let j = 0; j < components; j++) {
                const value = data[i + j];
                if (!isNaN(value) && isFinite(value)) {
                    min[j] = Math.min(min[j], value);
                    max[j] = Math.max(max[j], value);
                }
            }
        }

        // 验证 min/max 值
        for (let j = 0; j < components; j++) {
            if (!isFinite(min[j]) || !isFinite(max[j])) {
                throw new Error(`Invalid min/max values calculated for component ${j}`);
            }
        }

        return { min, max };
    }

    /**
     * 处理球谐系数数据
     */
    private static async handleSphericalHarmonics(
        scenegraph: GLTFScenegraph,
        shData: Float32Array,
        vertexCount: number
    ): Promise<SPZDecompressionResult['sphericalHarmonics']> {
        const shComponents = 3; // RGB 三个通道分别存储球谐系数
        const coefficientsPerVertex = shData.length / vertexCount;

        if (coefficientsPerVertex % shComponents !== 0) {
            throw new Error(`Invalid spherical harmonics data: ${coefficientsPerVertex} coefficients per vertex`);
        }

        const shAccessorIndex = this.createFloatAttribute(scenegraph, shData, "VEC3", shComponents, vertexCount * (coefficientsPerVertex / shComponents));

        return {
            accessor: shAccessorIndex,
            coefficientCount: coefficientsPerVertex,
            degree: Math.sqrt(coefficientsPerVertex / shComponents) - 1
        };
    }

    /**
     * 清理 primitive 属性
     */
    static cleanPrimitiveAttributes(primitive: GLTFMeshPrimitive): void {
        const attributesToRemove = [];

        for (const attrName in primitive.attributes) {
            // 移除所有扩展相关的属性
            if (attrName.startsWith('KHR_gaussian_splatting:') ||
                attrName.startsWith('SH_DEGREE_') ||
                attrName.startsWith('SH_COEFFS_')) {
                attributesToRemove.push(attrName);
            }
        }

        for (const attrName of attributesToRemove) {
            delete primitive.attributes[attrName];
        }
    }

    /**
     * 验证最终属性设置
     */
    static validateFinalAttributes(primitive: GLTFMeshPrimitive): void {
        const validAttributes = [];
        const invalidAttributes = [];

        for (const attrName in primitive.attributes) {
            const accessorIndex = primitive.attributes[attrName];
            if (typeof accessorIndex === 'number' && accessorIndex >= 0) {
                validAttributes.push(attrName);
            } else {
                invalidAttributes.push(attrName);
            }
        }

        if (invalidAttributes.length > 0) {
            console.warn(`Invalid attributes found:`, invalidAttributes);
        }
    }
}

// 便捷函数
export async function decompressSPZ(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    spzExtension: any,
    options?: SPZDecompressionOptions
): Promise<void> {
    try {
        // 首先清理 primitive 的现有属性，避免重复
        SPZDecompressor.cleanPrimitiveAttributes(primitive);

        const result = await SPZDecompressor.decompress(scenegraph, primitive, spzExtension, options);

        // 只设置标准的属性，避免扩展前缀
        Object.assign(primitive.attributes, result.attributes);

        // 存储球谐系数信息到 primitive extras（如果存在）
        if (result.sphericalHarmonics) {
            primitive.extras = primitive.extras || {};
            primitive.extras.sphericalHarmonics = result.sphericalHarmonics;
        }

        console.log(`SPZ decompression completed: ${result.vertexCount} vertices processed`);

        // 验证最终属性设置
        SPZDecompressor.validateFinalAttributes(primitive);
    } catch (error) {
        console.error('SPZ decompression failed:', error);
        throw error;
    }
}

export function validateSPZExtension(extension: any): void {
    if (typeof extension.bufferView !== 'number') {
        throw new Error('SPZ extension must have a valid bufferView index');
    }

    if (extension.bufferView < 0) {
        throw new Error('SPZ extension bufferView index cannot be negative');
    }
}