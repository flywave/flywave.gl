import type { GLTF } from "../../types/gltf-json-schema";
export declare const name = "KHR_techniques_webgl";
export declare function decode(gltfData: {
    json: GLTF;
}): Promise<void>;
export declare function encode(gltfData: any, options: any): Promise<void>;
