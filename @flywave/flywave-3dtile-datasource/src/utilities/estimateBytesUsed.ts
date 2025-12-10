/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";
const {
    estimateBytesUsed: _estimateBytesUsed
} = require("three/examples/jsm/utils/BufferGeometryUtils.js");

/**
 * Estimates the total memory usage of a Three.js object and its children.
 *
 * This function calculates the approximate memory footprint of a 3D object,
 * including its geometries and textures. It traverses the entire object hierarchy
 * to account for all nested objects.
 *
 * @param object - The Three.js object to analyze
 * @returns The estimated memory usage in bytes
 */
export function estimateBytesUsed(object: THREE.Object3D): number {
    // NOTE: This is for backwards compatibility and should be removed later
    // deprecated: remove in next major release
    const { TextureUtils } = THREE;
    if (!TextureUtils) {
        return 0;
    }

    // Set to keep track of already processed geometries and textures to avoid double counting
    const dedupeSet = new Set<any>();

    let totalBytes = 0;

    // Traverse the entire object hierarchy
    object.traverse(c => {
        // Calculate geometry memory usage
        const mesh = c as THREE.Mesh;
        if (mesh.geometry && !dedupeSet.has(mesh.geometry)) {
            totalBytes += _estimateBytesUsed(mesh.geometry);
            dedupeSet.add(mesh.geometry);
        }

        // Calculate material memory usage (textures)
        if (mesh.material) {
            const material = mesh.material;
            for (const key in material) {
                const value = (material as any)[key];
                // Check if the property is a texture and hasn't been processed yet
                if (value?.isTexture && !dedupeSet.has(value)) {
                    const texture = value as THREE.Texture;
                    const { format, type, image } = texture;
                    const { width, height } = image;
                    // Calculate texture memory usage, accounting for mipmaps if enabled
                    const bytes = TextureUtils.getByteLength(width, height, format, type);
                    totalBytes += texture.generateMipmaps ? (bytes * 4) / 3 : bytes;

                    dedupeSet.add(value);
                }
            }
        }
    });

    return totalBytes;
}
