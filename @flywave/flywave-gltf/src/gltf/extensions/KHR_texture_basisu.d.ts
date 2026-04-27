import type { GLTFLoaderOptions } from "../../gltf-loader";
import type { GLTF } from "../types/gltf-json-schema";
/** Extension name */
export declare const name = "KHR_texture_basisu";
/**
 * Replaces a texture source reference with the extension texture
 * Done in preprocess() to prevent load of default image
 */
export declare function preprocess(gltfData: {
    json: GLTF;
}, options: GLTFLoaderOptions): void;
