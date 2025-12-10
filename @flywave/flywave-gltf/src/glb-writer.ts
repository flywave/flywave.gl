/* Copyright (C) 2025 flywave.gl contributors */

import type { GLBEncodeOptions } from "./gltf/encoders/encode-glb";
import { encodeGLBSync } from "./gltf/encoders/encode-glb";
import { VERSION } from "./gltf/utils/version";

export interface GLBWriterOptions {
    glb?: GLBEncodeOptions;
}

/**
 * GLB exporter
 * GLB is the binary container format for GLTF
 */
export const GLBWriter = {
    name: "GLB",
    id: "glb",
    module: "gltf",
    version: VERSION,

    extensions: ["glb"],
    mimeTypes: ["model/gltf-binary"],
    binary: true,
    options: {
        glb: {}
    },

    encode: async (glb, options: GLBWriterOptions = {}) => encodeSync(glb, options),
    encodeSync
} as const;

function encodeSync(glb, options) {
    const { byteOffset = 0 } = options ?? {};

    // Calculate length and allocate buffer
    const byteLength = encodeGLBSync(glb, null, byteOffset, options);
    const arrayBuffer = new ArrayBuffer(byteLength);

    // Encode into buffer
    const dataView = new DataView(arrayBuffer);
    encodeGLBSync(glb, dataView, byteOffset, options);

    return arrayBuffer;
}
