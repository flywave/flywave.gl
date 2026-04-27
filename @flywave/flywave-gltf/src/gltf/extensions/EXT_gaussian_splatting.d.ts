import type { GLTFLoaderOptions } from "../../gltf-loader";
import type { GLTF } from "../types/gltf-json-schema";
export declare const name = "KHR_gaussian_splatting";
export declare function decode(gltfData: {
    json: GLTF;
    buffers?: any[];
}, options: GLTFLoaderOptions): Promise<void>;
