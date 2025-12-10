/* Copyright (C) 2025 flywave.gl contributors */

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
    context?: any
): Promise<GLTFWithBuffers> {
    // Apply default options
    options = { ...GLTFLoader.options, ...options,uri:context?.url };
    options.gltf = { ...GLTFLoader.options.gltf, ...options.gltf };

    const { byteOffset = 0 } = options;
    const gltf = {} as GLTFWithBuffers;
    return await parseGLTF(gltf, arrayBuffer, byteOffset, options);
}

export async function loadGLTF(
    url: string,
    loader: typeof GLTFLoader,
    options?: GLTFLoaderOptions,
    context?: any
): Promise<GLTFWithBuffers> {
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
