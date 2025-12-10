/* Copyright (C) 2025 flywave.gl contributors */

// meshMemoryUtils.ts
import { type BufferGeometry, type Material, type Mesh, DataTexture, Texture } from "three";

/**
 * 估计 Mesh 占用的内存大小
 * @param mesh 要估计的 Mesh 对象
 * @returns 内存大小（字节）
 */
export function estimateMeshMemory(mesh: Mesh): number {
    if (!mesh) return 0;

    let totalSize = 0;

    // 估计几何体内存
    if (mesh.geometry) {
        totalSize += estimateGeometryMemory(mesh.geometry);
    }

    // 估计材质内存
    if (Array.isArray(mesh.material)) {
        mesh.material.forEach(material => {
            totalSize += estimateMaterialMemory(material);
        });
    } else if (mesh.material) {
        totalSize += estimateMaterialMemory(mesh.material);
    }

    return totalSize;
}

/**
 * 估计 BufferGeometry 占用的内存大小
 * @param geometry BufferGeometry 对象
 * @returns 内存大小（字节）
 */
export function estimateGeometryMemory(geometry: BufferGeometry): number {
    if (!geometry) return 0;

    let size = 0;

    // 估计顶点属性内存
    const attributes = geometry.attributes;
    for (const attributeName in attributes) {
        const attribute = attributes[attributeName];
        if (attribute && attribute.array) {
            size += attribute.array.byteLength;
        }
    }

    // 估计索引缓冲区内存
    if (geometry.index) {
        size += geometry.index.array.byteLength;
    }

    return size;
}

/**
 * 估计 Material 占用的内存大小
 * @param material Material 对象
 * @returns 内存大小（字节）
 */
export function estimateMaterialMemory(material: Material): number {
    if (!material) return 0;

    let size = 0;

    // 获取材质中使用的所有纹理
    const textures = getMaterialTextures(material);
    textures.forEach(texture => {
        size += estimateTextureMemory(texture);
    });

    return size;
}

/**
 * 获取材质中使用的所有纹理
 * @param material Material 对象
 * @returns 纹理数组
 */
function getMaterialTextures(material: Material): Texture[] {
    const textures: Texture[] = [];

    // 检查常见的纹理属性
    const textureProperties = [
        "map", // 基础贴图
        "alphaMap", // 透明度贴图
        "aoMap", // 环境光遮蔽贴图
        "bumpMap", // 凹凸贴图
        "displacementMap", // 位移贴图
        "emissiveMap", // 自发光贴图
        "envMap", // 环境贴图
        "lightMap", // 光照贴图
        "metalnessMap", // 金属度贴图
        "normalMap", // 法线贴图
        "roughnessMap", // 粗糙度贴图
        "specularMap", // 镜面贴图
        "gradientMap", // 渐变贴图
        "alphaMap" // alpha贴图
    ];

    textureProperties.forEach(prop => {
        const texture = (material as any)[prop];
        if (texture instanceof Texture) {
            textures.push(texture);
        }
    });

    return textures;
}

/**
 * 估计 Texture 占用的内存大小
 * @param texture Texture 对象
 * @returns 内存大小（字节）
 */
export function estimateTextureMemory(texture: Texture): number {
    if (!texture || !texture.image) {
        return 0;
    }

    const image = texture.image;

    // DataTexture 特殊处理
    if (texture instanceof DataTexture && image.data) {
        return image.data.byteLength;
    }

    // 处理普通纹理（Image/Canvas 元素）
    if (image.width && image.height) {
        // 估计通道数
        let channels = 4; // 默认 RGBA

        // 根据 WebGL 常量估计通道数（简化处理）
        const format = (texture as any).format;
        switch (format) {
            case 6407: // RGBFormat (RGB)
                channels = 3;
                break;
            case 6403: // RedFormat (RED)
                channels = 1;
                break;
            case 6408: // RGBAFormat (RGBA)
            default:
                channels = 4;
                break;
        }

        // 估计每个像素的字节数
        let bytesPerPixel = 1;
        const type = (texture as any).type;
        switch (type) {
            case 5121: // UnsignedByteType
                bytesPerPixel = 1;
                break;
            case 5123: // UnsignedShortType
            case 5122: // ShortType
                bytesPerPixel = 2;
                break;
            case 5126: // FloatType
                bytesPerPixel = 4;
                break;
            default:
                bytesPerPixel = 1;
                break;
        }

        return image.width * image.height * channels * bytesPerPixel;
    }

    // 如果无法确定尺寸，返回估算值
    return 0;
}

/**
 * 格式化内存大小显示
 * @param bytes 字节数
 * @param decimals 小数位数
 * @returns 格式化的内存大小字符串
 */
export function formatMemorySize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * 估计多个 Mesh 的总内存大小
 * @param meshes Mesh 数组
 * @returns 总内存大小（字节）
 */
export function estimateMeshesTotalMemory(meshes: Mesh[]): number {
    return meshes.reduce((total, mesh) => total + estimateMeshMemory(mesh), 0);
}
