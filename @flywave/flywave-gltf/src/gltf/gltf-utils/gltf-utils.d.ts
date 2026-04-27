import type { GLTFPostprocessed } from "../types/gltf-postprocessed-schema";
export declare function getAccessorTypeFromSize(size: any): string;
export declare function getComponentTypeFromArray(typedArray: any): number;
export declare function getAccessorArrayTypeAndLength(accessor: any, bufferView: any): {
    ArrayType: any;
    length: number;
    byteLength: number;
    componentByteSize: any;
    numberOfComponentsInElement: any;
};
/**
 * Calculate the GPU memory used by a GLTF tile, for both buffer and texture memory
 * @param gltf - the gltf content of a GLTF tile
 * @returns - total memory usage in bytes
 */
export declare function getMemoryUsageGLTF(gltf: GLTFPostprocessed): number;
