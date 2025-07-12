import { estimateBytesUsed as _estimateBytesUsed } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";

// Returns the estimated number of bytes used by the object
export function estimateBytesUsed(object: THREE.Object3D): number {
    // NOTE: This is for backwards compatibility and should be removed later
    // deprecated: remove in next major release
    const { TextureUtils } = THREE;
    if (!TextureUtils) {
        return 0;
    }

    const dedupeSet = new Set<any>();

    let totalBytes = 0;
    object.traverse(c => {
        // get geometry bytes
        const mesh = c as THREE.Mesh;
        if (mesh.geometry && !dedupeSet.has(mesh.geometry)) {
            totalBytes += _estimateBytesUsed(mesh.geometry);
            dedupeSet.add(mesh.geometry);
        }

        // get material bytes
        if (mesh.material) {
            const material = mesh.material;
            for (const key in material) {
                const value = (material as any)[key];
                if (value?.isTexture && !dedupeSet.has(value)) {
                    const texture = value as THREE.Texture;
                    const { format, type, image } = texture;
                    const { width, height } = image;
                    const bytes = TextureUtils.getByteLength(width, height, format, type);
                    totalBytes += texture.generateMipmaps ? (bytes * 4) / 3 : bytes;

                    dedupeSet.add(value);
                }
            }
        }
    });

    return totalBytes;
}
