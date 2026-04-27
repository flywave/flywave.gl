import { GLTFScenegraph } from "../../api/gltf-scenegraph";
import type { GLTFMeshPrimitive } from "../../types/gltf-json-schema";
export declare const EXT_SPZ_COMPRESSION = "KHR_gaussian_splatting_compression_spz_2";
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
export declare class SPZDecompressor {
    /**
     * 解压 SPZ 压缩的高斯泼溅数据
     */
    static decompress(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive, spzExtension: any, options?: SPZDecompressionOptions): Promise<SPZDecompressionResult>;
    /**
     * 验证创建的访问器类型
     */
    private static validateCreatedAccessors;
    /**
     * 验证 SPZ 扩展数据
     */
    private static validateExtension;
    /**
     * 验证解压后的数据
     */
    private static validateDecompressedData;
    /**
     * 计算顶点数
     */
    private static calculateVertexCount;
    /**
     * 获取压缩数据
     */
    private static getCompressedData;
    /**
     * 使用 @spz-loader/core 解码 SPZ 数据
     */
    private static decodeSPZ;
    /**
     * 创建解压后的属性
     */
    private static createDecompressedAttributes;
    /**
     * 准备颜色数据（处理透明度并使用钳制转换）
     */
    private static prepareColorData;
    /**
     * 创建颜色属性访问器（使用UNSIGNED_BYTE）
     */
    private static createColorAttribute;
    /**
     * 创建浮点属性访问器
     */
    private static createFloatAttribute;
    /**
     * 验证和修复访问器类型
     */
    private static validateAndFixAccessorType;
    /**
     * 创建字节对齐的 BufferView
     */
    private static createAlignedBufferView;
    /**
     * 计算最小最大值
     */
    private static calculateMinMax;
    /**
     * 处理球谐系数数据
     */
    private static handleSphericalHarmonics;
    /**
     * 清理 primitive 属性
     */
    static cleanPrimitiveAttributes(primitive: GLTFMeshPrimitive): void;
    /**
     * 验证最终属性设置
     */
    static validateFinalAttributes(primitive: GLTFMeshPrimitive): void;
}
export declare function decompressSPZ(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive, spzExtension: any, options?: SPZDecompressionOptions): Promise<void>;
export declare function validateSPZExtension(extension: any): void;
