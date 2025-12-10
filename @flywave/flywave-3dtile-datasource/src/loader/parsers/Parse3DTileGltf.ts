/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GLTFWithBuffers,
    _getMemoryUsageGLTF,
    GLTFLoader,
    postProcessGLTF
} from "@flywave/flywave-gltf";

import type { Tiles3DLoaderOptions } from "../Loader";
import { type Tiles3DTileContent } from "../types";

export async function parseGltf3DTile(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<number> {
    // Set flags
    // glTF models need to be rotated from Y to Z up
    // https://github.com/AnalyticalGraphicsInc/3d-tiles/tree/master/specification#y-up-to-z-up
    tile.rotateYtoZ = true;
    // Save gltf up axis
    tile.gltfUpAxis = options?.["3d-tiles"]?.assetGltfUpAxis
        ? options["3d-tiles"].assetGltfUpAxis
        : "Y";

    if (options?.["3d-tiles"]?.loadGLTF) {
        if (!context) {
            return arrayBuffer.byteLength;
        }
        const gltfWithBuffers = await parseFromContext(arrayBuffer, GLTFLoader, options, context);
        tile.gltf = postProcessGLTF(gltfWithBuffers);
        tile.gpuMemoryUsageInBytes = _getMemoryUsageGLTF(tile.gltf);
    } else {
        tile.gltfArrayBuffer = arrayBuffer;
    }
    return arrayBuffer.byteLength;
}

// Implement missing parseFromContext function
async function parseFromContext(
    data: ArrayBuffer,
    loader: typeof GLTFLoader,
    options: any,
    context: any
): Promise<GLTFWithBuffers> {
    // If there is context, use the parsing capability of the context
    if (context && context.parse) {
        return context.parse(data, loader, options);
    }
    // Otherwise, directly use the loader to parse
    return await loader.parse(data, options,context);
}
