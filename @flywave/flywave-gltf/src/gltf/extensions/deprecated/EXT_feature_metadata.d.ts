import { type GLTFLoaderOptions } from "../../../gltf-loader";
import type { GLTF } from "../../types/gltf-json-schema";
export declare const name = "EXT_feature_metadata";
export declare function decode(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): Promise<void>;
