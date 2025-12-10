/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable camelcase */

import { type ImageType } from "@flywave/flywave-utils";

import type { GLTF } from "./gltf-json-schema";

/** GLTFLoader removes processed extensions from `extensionsUsed` and `extensionsUsed`
 * `processedExtensions` is used to track those extensions
 */
export interface GLTFWithBuffers {
    json: GLTF;
    binary?: ArrayBuffer;
    buffers: GLTFExternalBuffer[];
    images?: GLTFExternalImage[];
}

export interface GLTFExternalBuffer {
    arrayBuffer: ArrayBuffer;
    byteOffset: number;
    byteLength: number;
}

type GLTFExternalImage =
    | ImageType
    | {
          compressed: true;
          mipmaps: false;
          width: number;
          height: number;
          data: Uint8Array;
      };

export type FeatureTableJson = Record<string, any[]>;

export type {
    GLTF,
    GLTFAccessor,
    GLTFBuffer,
    GLTFBufferView,
    // GLTFCamera,
    GLTFMeshPrimitive,
    GLTFMesh,
    GLTFNode,
    GLTFMaterial,
    GLTFSampler,
    GLTFScene,
    GLTFSkin,
    GLTFTexture,
    GLTFImage,
    GLTF_KHR_binary_glTF,
    GLTF_KHR_draco_mesh_compression,
    GLTF_KHR_texture_basisu,
    GLTF_EXT_meshopt_compression,
    GLTF_EXT_texture_webp
} from "./gltf-json-schema";

export type {
    GLTFPostprocessed,
    GLTFAccessorPostprocessed,
    GLTFImagePostprocessed,
    GLTFNodePostprocessed,
    GLTFMeshPostprocessed,
    GLTFMeshPrimitivePostprocessed,
    GLTFMaterialPostprocessed,
    GLTFTexturePostprocessed
} from "./gltf-postprocessed-schema";
