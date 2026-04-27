import type { ParseGLTFOptions } from "../parsers/parse-gltf";
import type { GLTFPostprocessed } from "../types/gltf-postprocessed-schema";
import type { GLTFWithBuffers } from "../types/gltf-types";
export declare function postProcessGLTF(gltf: GLTFWithBuffers, options?: ParseGLTFOptions): GLTFPostprocessed;
