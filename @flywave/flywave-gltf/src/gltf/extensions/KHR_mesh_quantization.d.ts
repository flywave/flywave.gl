import type { GLTFLoaderOptions } from "../../gltf-loader";
import type { GLTF } from "../types/gltf-json-schema";
export declare const name = "KHR_mesh_quantization";
export declare function decode(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): Promise<void>;
