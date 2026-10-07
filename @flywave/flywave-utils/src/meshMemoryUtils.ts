/* Copyright (C) 2025 flywave.gl contributors */

// meshMemoryUtils.ts
import { type BufferGeometry, type Material, type Mesh, DataTexture, Texture } from "three/webgpu";

/**
 * Estimate the amount of memory occupied by a Mesh
 * @param mesh the Mesh object to estimate
 * @returns the memory size (bytes)
 */
export function estimateMeshMemory(mesh: Mesh): number {
    if (!mesh) return 0;

    let totalSize = 0;

    // Estimate geometry memory
    if (mesh.geometry) {
        totalSize += estimateGeometryMemory(mesh.geometry);
    }

    // Estimate material memory
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
 * Estimate the amount of memory occupied by a BufferGeometry
 * @param geometry the BufferGeometry object
 * @returns the memory size (bytes)
 */
export function estimateGeometryMemory(geometry: BufferGeometry): number {
    if (!geometry) return 0;

    let size = 0;

    // Estimate vertex attribute memory
    const attributes = geometry.attributes;
    for (const attributeName in attributes) {
        const attribute = attributes[attributeName];
        if (attribute && attribute.array) {
            size += attribute.array.byteLength;
        }
    }

    // Estimate index buffer memory
    if (geometry.index) {
        size += geometry.index.array.byteLength;
    }

    return size;
}

/**
 * Estimate the amount of memory occupied by a Material
 * @param material the Material object
 * @returns the memory size (bytes)
 */
export function estimateMaterialMemory(material: Material): number {
    if (!material) return 0;

    let size = 0;

    // Gather all textures used by the material
    const textures = getMaterialTextures(material);
    textures.forEach(texture => {
        size += estimateTextureMemory(texture);
    });

    return size;
}

/**
 * Gather all textures used by the material
 * @param material the Material object
 * @returns the array of textures
 */
function getMaterialTextures(material: Material): Texture[] {
    const textures: Texture[] = [];

    // Check the common texture properties
    const textureProperties = [
        "map", // base map
        "alphaMap", // alpha map
        "aoMap", // ambient occlusion map
        "bumpMap", // bump map
        "displacementMap", // displacement map
        "emissiveMap", // emissive map
        "envMap", // environment map
        "lightMap", // light map
        "metalnessMap", // metalness map
        "normalMap", // normal map
        "roughnessMap", // roughness map
        "specularMap", // specular map
        "gradientMap", // gradient map
        "alphaMap" // alpha map
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
 * Estimate the amount of memory occupied by a Texture
 * @param texture the Texture object
 * @returns the memory size (bytes)
 */
export function estimateTextureMemory(texture: Texture): number {
    if (!texture || !texture.image) {
        return 0;
    }

    // Special handling for DataTexture
    if (texture instanceof DataTexture) {
        const data = texture.image.data;
        if (data) {
            return data.byteLength;
        }
    }

    // Handle regular textures (Image/Canvas elements)
    const image = texture.image;
    if (
        typeof image !== "object" ||
        image === null ||
        !("width" in image) ||
        !("height" in image)
    ) {
        return 0;
    }

    const imgWidth = (image as { width: number }).width;
    const imgHeight = (image as { height: number }).height;
    if (!imgWidth || !imgHeight) {
        return 0;
    }

    // Estimate the number of channels
    let channels = 4; // RGBA by default

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

    // Estimate the number of bytes per pixel
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

    return imgWidth * imgHeight * channels * bytesPerPixel;
}

/**
 * Format a memory size for display
 * @param bytes the number of bytes
 * @param decimals the number of decimal places
 * @returns the formatted memory size string
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
 * Estimate the total memory occupied by multiple Meshes
 * @param meshes an array of Meshes
 * @returns the total memory size (bytes)
 */
export function estimateMeshesTotalMemory(meshes: Mesh[]): number {
    return meshes.reduce((total, mesh) => total + estimateMeshMemory(mesh), 0);
}
