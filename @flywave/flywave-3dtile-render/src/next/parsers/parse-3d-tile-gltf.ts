import {
    _getMemoryUsageGLTF,
    GLTFLoader,
    GLTFWithBuffers,
    postProcessGLTF
} from "@flywave/flywave-gltf";

import type { Tiles3DLoaderOptions } from "../Loader";
import { Tiles3DTileContent } from "../types";

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

// 实现缺失的parseFromContext函数
async function parseFromContext(
    data: ArrayBuffer,
    loader: typeof GLTFLoader,
    options: any,
    context: any
): Promise<GLTFWithBuffers> {
    // 如果有context，则使用context的解析能力
    if (context && context.parse) {
        return context.parse(data, loader, options);
    }
    // 否则直接使用loader解析
    return await loader.parse(data, options);
}
