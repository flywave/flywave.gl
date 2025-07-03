import type { ParseGLTFOptions } from "./gltf/parsers/parse-gltf";
import { parseGLTF } from "./gltf/parsers/parse-gltf";
import type { GLTFWithBuffers } from "./gltf/types/gltf-types";
import { VERSION } from "./gltf/utils/version";

/**
 * GLTF loader options
 */
export interface GLTFLoaderOptions {
    /** Base URI for resolving external resources */
    uri?: string;
    /** GLTF-specific parsing options */
    gltf?: ParseGLTFOptions;
    /** Draco decompression options */
    draco?: {
        /** Enable Draco decompression */
        decompress?: boolean;
        /** Draco decompression options */
        [key: string]: any;
    };
    /** Logging function */
    log?: Console;
    /** Additional options */
    [key: string]: any;
}

/**
 * GLTF loader
 */
export const GLTFLoader = {
    name: "glTF",
    id: "gltf",
    module: "gltf",
    version: VERSION,
    extensions: ["gltf", "glb"],
    mimeTypes: ["model/gltf+json", "model/gltf-binary"],
    text: true,
    binary: true,
    tests: ["glTF"],
    parse,

    options: {
        gltf: {
            normalize: true, // Normalize glTF v1 to glTF v2 format
            loadBuffers: true, // Fetch any linked .BIN buffers, decode base64
            loadImages: true, // Create image objects
            decompressMeshes: true // Decompress Draco encoded meshes
        },
        log: console
    }
};

export async function parse(
    arrayBuffer: ArrayBuffer | string,
    options: GLTFLoaderOptions = {},
    context?: { fetch?: (url: string) => Promise<Response> }
): Promise<GLTFWithBuffers> {
    // Apply default options
    options = { ...GLTFLoader.options, ...options };
    options.gltf = { ...GLTFLoader.options.gltf, ...options.gltf };

    const { byteOffset = 0 } = options;
    const gltf = {} as GLTFWithBuffers;
    return await parseGLTF(gltf, arrayBuffer, byteOffset, options, context);
}
