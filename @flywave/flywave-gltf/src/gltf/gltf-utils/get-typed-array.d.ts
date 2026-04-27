import type { TypedArray } from "@flywave/flywave-utils";
import type { GLTF, GLTFAccessor, GLTFExternalBuffer } from "../types/gltf-types";
export declare function getTypedArrayForBufferView(json: any, buffers: any, bufferViewIndex: any): Uint8Array<any>;
export declare function getTypedArrayForImageData(json: any, buffers: any, imageIndex: any): Uint8Array<any>;
/**
 * Gets data pointed by the accessor.
 * @param json - json part of gltf content of a GLTF tile.
 * @param buffers - Array containing buffers of data.
 * @param accessor - accepts accessor index or accessor object.
 * @returns {TypedArray} Typed array with type matching the type of data poited by the accessor.
 */
export declare function getTypedArrayForAccessor(json: GLTF, buffers: GLTFExternalBuffer[], accessor: GLTFAccessor | number): TypedArray;
