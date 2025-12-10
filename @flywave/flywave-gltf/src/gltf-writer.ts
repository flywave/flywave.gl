/* Copyright (C) 2025 flywave.gl contributors */

import { encodeExtensions } from "./gltf/api/gltf-extensions";
import { encodeGLTFSync } from "./gltf/encoders/encode-gltf";
import { type GLTFWithBuffers } from "./gltf/types/gltf-types";
import { VERSION } from "./gltf/utils/version";

export interface GLTFWriterOptions {
    gltf?: {};
    byteOffset?: number;
}

/**
 * GLTF exporter
 */
export const GLTFWriter = {
    dataType: null as unknown as any,
    batchType: null as never,

    name: "glTF",
    id: "gltf",
    module: "gltf",
    version: VERSION,

    extensions: ["glb"], // We only support encoding to binary GLB, not to JSON GLTF
    mimeTypes: ["model/gltf-binary"], // 'model/gltf+json',
    binary: true,
    options: {
        gltf: {}
    },

    encode: async (gltf: GLTFWithBuffers, options: GLTFWriterOptions = {}) =>
        encodeSync(gltf, options),
    encodeSync
};

function encodeSync(gltf: GLTFWithBuffers, options: GLTFWriterOptions = {}) {
    const { byteOffset = 0 } = options;
    const gltfToEncode = encodeExtensions(gltf);

    // Calculate length, then create arraybuffer and encode
    const byteLength = encodeGLTFSync(gltfToEncode, null, byteOffset, options);
    const arrayBuffer = new ArrayBuffer(byteLength);
    const dataView = new DataView(arrayBuffer);
    encodeGLTFSync(gltfToEncode, dataView, byteOffset, options);

    return arrayBuffer;
}
