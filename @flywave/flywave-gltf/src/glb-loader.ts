/* Copyright (C) 2025 flywave.gl contributors */

import type { ParseGLBOptions } from "./gltf/parsers/parse-glb";
import { parseGLBSync } from "./gltf/parsers/parse-glb";
import type { GLB } from "./gltf/types/glb-types";
import { VERSION } from "./gltf/utils/version";

/** GLB loader options */
export interface GLBLoaderOptions {
    headers?: Record<string, string>;
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

async function parse(
    arrayBuffer: ArrayBuffer,
    options?: GLBLoaderOptions,
    context?: any
): Promise<GLB> {
    return parseSync(arrayBuffer, options);
}

function parseSync(arrayBuffer: ArrayBuffer, options?: GLBLoaderOptions): GLB {
    const { byteOffset = 0 } = options || {};
    const glb: GLB = {} as GLB;
    parseGLBSync(glb, arrayBuffer, byteOffset, options?.glb);
    return glb;
}

export async function loadGLB(
    url: string,
    loader: typeof GLBLoader = GLBLoader,
    options?: GLBLoaderOptions,
    context?: any
): Promise<GLB> {
    const fetchFn = context?.fetch || globalThis.fetch;

    if (!fetchFn) {
        throw new Error("Fetch function is required to load subtree");
    }

    try {
        // 1. 获取子树文件
        const response = await fetchFn(url, {
            headers: options?.headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch subtree: ${response.status} ${response.statusText}`);
        }

        // 2. 读取二进制数据
        const arrayBuffer = await response.arrayBuffer();

        // 3. 使用加载器解析数据
        return await loader.parse(arrayBuffer, options, context);
    } catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
