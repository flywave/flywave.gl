/* Copyright (C) 2025 flywave.gl contributors */

// https://github.com/KhronosGroup/glTF/tree/master/extensions/2.0/Khronos/KHR_draco_mesh_compression
// Only TRIANGLES: 0x0004 and TRIANGLE_STRIP: 0x0005 are supported
/* eslint-disable camelcase */

import { DracoLoader } from "@flywave/flywave-draco";
import { sliceArrayBuffer } from "@flywave/flywave-utils";

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import { getGLTFAccessor, getGLTFAccessors } from "../gltf-utils/gltf-attribute-utils";
import type {
    GLTF,
    GLTF_KHR_draco_mesh_compression,
    GLTFAccessor,
    GLTFMeshPrimitive
} from "../types/gltf-json-schema";

const KHR_DRACO_MESH_COMPRESSION = "KHR_draco_mesh_compression";

/** Extension name */
export const name = KHR_DRACO_MESH_COMPRESSION;

export function preprocess(gltfData: { json: GLTF }, options: GLTFLoaderOptions): void {
    const scenegraph = new GLTFScenegraph(gltfData);
    for (const primitive of makeMeshPrimitiveIterator(scenegraph)) {
        if (scenegraph.getObjectExtension(primitive, KHR_DRACO_MESH_COMPRESSION)) {
            // TODO - Remove fallback accessors to make sure we don't load unnecessary buffers
        }
    }
}

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions): Promise<void> {
    if (!options?.gltf?.decompressMeshes) {
        return;
    }

    const scenegraph = new GLTFScenegraph(gltfData);
    const promises: Array<Promise<void>> = [];
    for (const primitive of makeMeshPrimitiveIterator(scenegraph)) {
        if (scenegraph.getObjectExtension(primitive, KHR_DRACO_MESH_COMPRESSION)) {
            promises.push(decompressPrimitive(scenegraph, primitive, options));
        }
    }

    // Decompress meshes in parallel
    await Promise.all(promises);

    // We have now decompressed all primitives, so remove the top-level extension
    scenegraph.removeExtension(KHR_DRACO_MESH_COMPRESSION);
}

export function encode(gltfData, options: GLTFLoaderOptions = {}): void {
    const scenegraph = new GLTFScenegraph(gltfData);

    for (const mesh of scenegraph.json.meshes || []) {
        // eslint-disable-next-line camelcase
        // @ts-ignore
        compressMesh(mesh, options);
        // NOTE: Only add the extension if something was actually compressed
        scenegraph.addRequiredExtension(KHR_DRACO_MESH_COMPRESSION);
    }
}

// DECODE

async function decompressPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions
): Promise<void> {
    const dracoExtension = scenegraph.getObjectExtension<GLTF_KHR_draco_mesh_compression>(
        primitive,
        KHR_DRACO_MESH_COMPRESSION
    );
    if (!dracoExtension) {
        return;
    }

    const buffer = scenegraph.getTypedArrayForBufferView(dracoExtension.bufferView);
    const bufferCopy = sliceArrayBuffer(buffer.buffer as ArrayBuffer, buffer.byteOffset);

    // Simplified Draco options type
    const dracoOptions: any = {
        decompress: true,
        ...DracoLoader.options,
        ...options
    };

    // Remove tileset data if present
    delete dracoOptions["3d-tiles"];

    // Use DracoLoader directly instead of parseFromContext
    const decodedData = await DracoLoader.parse(
        bufferCopy,
        {
            ...dracoOptions,
            draco: {
                libraryPath: options.draco?.libraryPath,
                extraAttributes: primitive.extensions[KHR_DRACO_MESH_COMPRESSION].attributes
            }
        },
        options.draco
    );

    const decodedAttributes: Record<string, GLTFAccessor> = getGLTFAccessors(
        decodedData.schema.attributes // 改为从 schema 获取属性
    );

    // Restore min/max values
    for (const [attributeName, decodedAttribute] of Object.entries(decodedAttributes)) {
        if (attributeName in primitive.attributes) {
            const accessorIndex: number = primitive.attributes[attributeName];
            const accessor = scenegraph.getAccessor(accessorIndex);
            if (accessor?.min && accessor?.max) {
                decodedAttribute.min = accessor.min;
                decodedAttribute.max = accessor.max;
            }
        }
    }

    // @ts-ignore
    primitive.attributes = decodedAttributes;
    if (decodedData.schema.index) {
        // @ts-ignore
        primitive.indices = getGLTFAccessor({
            value: decodedData.schema.index.array,
            size: 1 // 索引的 size 固定为 1
        });
    }
    // Extension has been processed, delete it
    scenegraph.removeObjectExtension(primitive, KHR_DRACO_MESH_COMPRESSION);

    checkPrimitive(primitive);
}

// UTILS

function checkPrimitive(primitive: GLTFMeshPrimitive) {
    if (!primitive.attributes && Object.keys(primitive.attributes).length > 0) {
        throw new Error("glTF: Empty primitive detected: Draco decompression failure?");
    }
}

function* makeMeshPrimitiveIterator(scenegraph) {
    for (const mesh of scenegraph.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            yield primitive;
        }
    }
}
