import type { GLTFLoaderOptions } from "../../gltf-loader";
import type { GLTFWithBuffers } from "../types/gltf-types";
export declare const name = "KHR_texture_transform";
/**
 * The extension entry to process the transformation
 * @param gltfData gltf buffers and json
 * @param options GLTFLoader options
 */
export declare function decode(gltfData: GLTFWithBuffers, options: GLTFLoaderOptions): Promise<void>;
