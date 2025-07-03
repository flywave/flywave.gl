import type { ParseGLBOptions } from "./gltf/parsers/parse-glb";
import { parseGLBSync } from "./gltf/parsers/parse-glb";
import type { GLB } from "./gltf/types/glb-types";
import { VERSION } from "./gltf/utils/version";

/** GLB loader options */
export interface GLBLoaderOptions {
    /** GLB Parser Options */
    glb?: ParseGLBOptions;
    /** GLB specific: byteOffset to start parsing from */
    byteOffset?: number;
}

/**
 * GLB Loader -
 * GLB is the binary container format for GLTF
 */
export const GLBLoader = {
    dataType: null as unknown as GLB,
    batchType: null as never,
    name: "GLB",
    id: "glb",
    module: "gltf",
    version: VERSION,
    extensions: ["glb"],
    mimeTypes: ["model/gltf-binary"],
    binary: true,
    parse,
    parseSync,
    options: {
        glb: {
            strict: false // Enables deprecated XVIZ support (illegal CHUNK formats)
        }
    }
} as const;

async function parse(arrayBuffer: ArrayBuffer, options?: GLBLoaderOptions): Promise<GLB> {
    return parseSync(arrayBuffer, options);
}

function parseSync(arrayBuffer: ArrayBuffer, options?: GLBLoaderOptions): GLB {
    const { byteOffset = 0 } = options || {};
    const glb: GLB = {} as GLB;
    parseGLBSync(glb, arrayBuffer, byteOffset, options?.glb);
    return glb;
}
