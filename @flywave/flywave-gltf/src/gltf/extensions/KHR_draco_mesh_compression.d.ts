import type { GLTFLoaderOptions } from "../../gltf-loader";
import type { GLTF } from "../types/gltf-json-schema";
/** Extension name */
export declare const name = "KHR_draco_mesh_compression";
export declare function preprocess(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): void;
export declare function decode(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): Promise<void>;
export declare function encode(gltfData: any, options?: GLTFLoaderOptions): void;
