import type { GLTF } from "../types/gltf-json-schema";
/** Extension name */
export declare const name = "KHR_binary_glTF";
export declare function preprocess(gltfData: {
    json: GLTF;
}): void;
