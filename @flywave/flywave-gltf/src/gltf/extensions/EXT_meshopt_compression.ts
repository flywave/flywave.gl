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

    // 检查是否需要处理解压缩
    const shouldDecompress = options?.gltf?.decompressMeshes && options.gltf?.loadBuffers;
    if (!shouldDecompress) {
        return;
    }

    // 获取所有需要解压的缓冲视图
    const bufferViews = gltfData.json.bufferViews || [];
    const compressedBufferViews = bufferViews.filter(bufferView =>
        scenegraph.getObjectExtension<GLTF_EXT_meshopt_compression>(
            bufferView,
            EXT_MESHOPT_COMPRESSION
        )
    );

    // 如果没有需要处理的缓冲视图，提前退出
    if (compressedBufferViews.length === 0) {
        return;
    }

    // 并行解压缩所有压缩的缓冲视图
    const decodePromises = compressedBufferViews.map(bufferView =>
        decodeMeshoptBufferView(scenegraph, bufferView, options)
    );

    try {
        // 等待所有解压缩完成
        await Promise.all(decodePromises);

        // 移除顶级扩展声明
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

        // 提取解压缩参数
        const {
            byteOffset = 0,
            byteLength = 0,
            byteStride,
            count,
            mode,
            filter = "NONE",
            buffer: bufferIndex
        } = meshoptExtension;

        // 获取源缓冲区
        const sourceBuffer = scenegraph.gltf.buffers[bufferIndex];
        if (!sourceBuffer || !sourceBuffer.arrayBuffer) {
            throw new Error(`无法找到源缓冲区 ${bufferIndex}`);
        }

        // 计算源数据范围
        const sourceStart = sourceBuffer.byteOffset + byteOffset;
        const sourceEnd = sourceStart + byteLength;

        // 验证源数据范围
        if (sourceEnd > sourceBuffer.arrayBuffer.byteLength) {
            throw new Error(`源缓冲区 ${bufferIndex} 数据范围越界`);
        }

        // 创建源数据视图
        const source = new Uint8Array(sourceBuffer.arrayBuffer, sourceStart, byteLength);

        // 获取目标缓冲区
        const targetBuffer = scenegraph.gltf.buffers[bufferView.buffer];
        if (!targetBuffer || !targetBuffer.arrayBuffer) {
            throw new Error(`无法找到目标缓冲区 ${bufferView.buffer}`);
        }

        // 计算目标数据范围
        const targetStart = bufferView.byteOffset;
        const targetEnd = targetStart + bufferView.byteLength;

        // 验证目标数据范围
        if (targetEnd > targetBuffer.arrayBuffer.byteLength) {
            throw new Error(`目标缓冲区 ${bufferView.buffer} 数据范围越界`);
        }

        // 创建目标数据视图
        const result = new Uint8Array(targetBuffer.arrayBuffer, targetStart, bufferView.byteLength);

        // 执行解压缩
        await meshoptDecodeGltfBuffer(result, count, byteStride, source, mode, filter);

        // 移除缓冲视图上的扩展
        scenegraph.removeObjectExtension(bufferView, EXT_MESHOPT_COMPRESSION);
    } catch (error) {
        options.log?.error(
            `缓冲视图 ${bufferView.name || bufferView.buffer} 解压缩失败: ${error.message}`
        );
    }
}
