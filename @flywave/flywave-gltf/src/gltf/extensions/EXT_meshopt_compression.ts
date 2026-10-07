/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable camelcase */
import type { GLTFLoaderOptions } from "../../gltf-loader";
import { meshoptDecodeGltfBuffer } from "../../meshopt/meshopt-decoder";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF, GLTF_EXT_meshopt_compression, GLTFBufferView } from "../types/gltf-json-schema";

// @ts-ignore
// eslint-disable-next-line
const DEFAULT_MESHOPT_OPTIONS = {
    byteOffset: 0,
    filter: "NONE"
};

/** Extension name */
const EXT_MESHOPT_COMPRESSION = "EXT_meshopt_compression";

export const name = EXT_MESHOPT_COMPRESSION;

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions) {
    const scenegraph = new GLTFScenegraph(gltfData);

    // Check whether decompression needs to be performed
    const shouldDecompress = options?.gltf?.decompressMeshes && options.gltf?.loadBuffers;
    if (!shouldDecompress) {
        return;
    }

    // Get all buffer views that need to be decompressed
    const bufferViews = gltfData.json.bufferViews || [];
    const compressedBufferViews = bufferViews.filter(bufferView =>
        scenegraph.getObjectExtension<GLTF_EXT_meshopt_compression>(
            bufferView,
            EXT_MESHOPT_COMPRESSION
        )
    );

    // Exit early when there are no buffer views to process
    if (compressedBufferViews.length === 0) {
        return;
    }

    // Decompress all compressed buffer views in parallel
    const decodePromises = compressedBufferViews.map(bufferView =>
        decodeMeshoptBufferView(scenegraph, bufferView, options)
    );

    try {
        // Wait for all decompression to complete
        await Promise.all(decodePromises);

        // Remove the top-level extension declaration
        scenegraph.removeExtension(EXT_MESHOPT_COMPRESSION);
    } catch (error) {
        options.log?.error(`EXT_meshopt_compression 解压缩失败: ${error.message}`);
    }
}

/** Decode one meshopt buffer view */
async function decodeMeshoptBufferView(
    scenegraph: GLTFScenegraph,
    bufferView: GLTFBufferView,
    options: GLTFLoaderOptions
): Promise<void> {
    try {
        const meshoptExtension = scenegraph.getObjectExtension<GLTF_EXT_meshopt_compression>(
            bufferView,
            EXT_MESHOPT_COMPRESSION
        );

        if (!meshoptExtension) return;

        // Extract the decompression parameters
        const {
            byteOffset = 0,
            byteLength = 0,
            byteStride,
            count,
            mode,
            filter = "NONE",
            buffer: bufferIndex
        } = meshoptExtension;

        // Get the source buffer
        const sourceBuffer = scenegraph.gltf.buffers[bufferIndex];
        if (!sourceBuffer || !sourceBuffer.arrayBuffer) {
            throw new Error(`无法找到源缓冲区 ${bufferIndex}`);
        }

        // Compute the source data range
        const sourceStart = sourceBuffer.byteOffset + byteOffset;
        const sourceEnd = sourceStart + byteLength;

        // Validate the source data range
        if (sourceEnd > sourceBuffer.arrayBuffer.byteLength) {
            throw new Error(`源缓冲区 ${bufferIndex} 数据范围越界`);
        }

        // Create the source data view
        const source = new Uint8Array(sourceBuffer.arrayBuffer, sourceStart, byteLength);

        // Get the target buffer
        const targetBuffer = scenegraph.gltf.buffers[bufferView.buffer];
        if (!targetBuffer || !targetBuffer.arrayBuffer) {
            throw new Error(`无法找到目标缓冲区 ${bufferView.buffer}`);
        }

        // Compute the target data range
        const targetStart = bufferView.byteOffset;
        const targetEnd = targetStart + bufferView.byteLength;

        // Validate the target data range
        if (targetEnd > targetBuffer.arrayBuffer.byteLength) {
            throw new Error(`目标缓冲区 ${bufferView.buffer} 数据范围越界`);
        }

        // Create the target data view
        const result = new Uint8Array(targetBuffer.arrayBuffer, targetStart, bufferView.byteLength);

        // Run the decompression
        await meshoptDecodeGltfBuffer(result, count, byteStride, source, mode, filter);

        // Remove the extension from the buffer view
        scenegraph.removeObjectExtension(bufferView, EXT_MESHOPT_COMPRESSION);
    } catch (error) {
        options.log?.error(
            `缓冲视图 ${bufferView.name || bufferView.buffer} 解压缩失败: ${error.message}`
        );
    }
}
