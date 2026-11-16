/* Copyright (C) 2025 flywave.gl contributors */

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF, GLTFMeshPrimitive } from "../types/gltf-json-schema";

const EXT_GAUSSIAN_SPLATTING = "KHR_gaussian_splatting";
const EXT_SPZ_COMPRESSION = "KHR_gaussian_splatting_compression_spz_2";
const EXT_MESH_QUANTIZATION = "KHR_mesh_quantization";

export const name = EXT_GAUSSIAN_SPLATTING;

/**
 * Decoded Gaussian splat source attached to the primitive extras. The actual splat mesh is
 * created by the three.js conversion layer (gaussian-splat-lite), which needs either the
 * original SPZ payload or the raw glTF attributes.
 */
export interface GaussianSplatSpzSource {
    kind: "spz";
    bytes: Uint8Array;
    sphericalHarmonics?: { coefficients: number[] };
}

export interface GaussianSplatRawSource {
    kind: "raw";
    sphericalHarmonics?: { coefficients: number[] };
}

export type GaussianSplatSource = GaussianSplatSpzSource | GaussianSplatRawSource;

/** Decodes KHR_gaussian_splatting primitives into lite-compatible sources. */
export async function decode(
    gltfData: { json: GLTF; buffers?: any[] },
    options: GLTFLoaderOptions
): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);

    for (const primitive of makeMeshPrimitiveIterator(scenegraph)) {
        const extensions = getGaussianSplattingExtension(primitive, scenegraph);
        if (!extensions.main && !extensions.spz) {
            continue;
        }

        await processPrimitive(scenegraph, primitive, options, extensions);
    }

    scenegraph.removeExtension(EXT_GAUSSIAN_SPLATTING);
    gltfData.json = scenegraph.json;
}

function getGaussianSplattingExtension(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph
): { main?: any; spz?: any } {
    const main = scenegraph.getObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);
    const standaloneSpz = scenegraph.getObjectExtension(primitive, EXT_SPZ_COMPRESSION);
    const nestedSpz = main?.extensions?.[EXT_SPZ_COMPRESSION];
    const deeplyNestedSpz =
        main?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION];

    return {
        main,
        spz: standaloneSpz || nestedSpz || deeplyNestedSpz
    };
}

function attributeIndex(primitive: GLTFMeshPrimitive, name: string): number | undefined {
    const attributes = primitive.attributes as Record<string, number>;
    return (
        attributes[name] ??
        attributes[`${EXT_GAUSSIAN_SPLATTING}:${name}`] ??
        attributes[`_${name}`]
    );
}

async function processPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions,
    extensions: { main?: any; spz?: any }
): Promise<void> {
    const { main: mainExtension, spz: spzExtension } = extensions;
    const sphericalHarmonics = mainExtension?.sphericalHarmonics;

    try {
        if (spzExtension) {
            // Keep the compressed SPZ payload untouched: gaussian-splat-lite decodes SPZ
            // directly, including the scale/opacity conventions of the format.
            const bytes = extractSpzBytes(scenegraph, spzExtension);
            primitive.extras = {
                ...(primitive.extras || {}),
                isGaussianSplatting: true,
                gaussianSplatSource: {
                    kind: "spz",
                    bytes,
                    sphericalHarmonics
                } satisfies GaussianSplatSpzSource
            };
            return;
        }

        if (mainExtension?.bufferView !== undefined && mainExtension.bufferView !== -1) {
            throw new Error(
                "Gaussian splatting: only SPZ compression and uncompressed attributes are supported"
            );
        }

        validateRawPrimitive(primitive);
        await dequantizePrimitive(scenegraph, primitive, options);

        primitive.extras = {
            ...(primitive.extras || {}),
            isGaussianSplatting: true,
            gaussianSplatSource: {
                kind: "raw",
                sphericalHarmonics
            } satisfies GaussianSplatRawSource
        };
    } finally {
        scenegraph.removeObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);
        scenegraph.removeObjectExtension(primitive, EXT_SPZ_COMPRESSION);
        scenegraph.removeObjectExtension(primitive, EXT_MESH_QUANTIZATION);
    }
}

function extractSpzBytes(scenegraph: GLTFScenegraph, spzExtension: any): Uint8Array {
    const bufferViewIndex = spzExtension?.bufferView;
    if (!Number.isInteger(bufferViewIndex) || bufferViewIndex < 0) {
        throw new Error("Gaussian splatting: SPZ extension is missing a valid bufferView");
    }

    const bufferView = scenegraph.getBufferView(bufferViewIndex);
    if (!bufferView) {
        throw new Error(`Gaussian splatting: invalid SPZ bufferView ${bufferViewIndex}`);
    }

    const view = scenegraph.getTypedArrayForBufferView(bufferView);
    if (!view) {
        throw new Error("Gaussian splatting: failed to read SPZ bufferView data");
    }

    // Copy: the underlying GLB buffer may be reused or detached.
    return view.slice();
}

function validateRawPrimitive(primitive: GLTFMeshPrimitive): void {
    if (attributeIndex(primitive, "POSITION") === undefined) {
        throw new Error("Gaussian splatting: missing POSITION attribute");
    }
    if (attributeIndex(primitive, "SCALE") === undefined) {
        throw new Error("Gaussian splatting: missing SCALE attribute");
    }
    if (attributeIndex(primitive, "ROTATION") === undefined) {
        throw new Error("Gaussian splatting: missing ROTATION attribute");
    }
    if (
        attributeIndex(primitive, "OPACITY") === undefined &&
        attributeIndex(primitive, "COLOR_0") === undefined
    ) {
        throw new Error("Gaussian splatting: missing OPACITY or COLOR_0 attribute");
    }
}

async function dequantizePrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions
): Promise<void> {
    const quantizationExt = scenegraph.getObjectExtension(primitive, EXT_MESH_QUANTIZATION);
    if (!quantizationExt) return;

    for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes)) {
        const accessor = scenegraph.getAccessor(accessorIndex as number);
        if (!accessor || accessor.componentType === 5126) continue;

        const bits = getQuantizationBits(attributeName, quantizationExt);
        if (bits === 0) continue;

        const newAccessorIndex = await dequantizeAccessor(scenegraph, accessor, bits);
        (primitive.attributes as Record<string, number>)[attributeName] = newAccessorIndex;
    }
}

function getQuantizationBits(attributeName: string, ext: any): number {
    const quantizationMap: Record<string, number> = {
        POSITION: ext.POSITION ?? 14,
        NORMAL: ext.NORMAL ?? 10,
        TANGENT: ext.TANGENT ?? 10,
        TEXCOORD: ext.TEXCOORD ?? 12,
        TEXCOORD_0: ext.TEXCOORD ?? 12,
        TEXCOORD_1: ext.TEXCOORD ?? 12,
        COLOR: ext.COLOR ?? 8,
        COLOR_0: ext.COLOR ?? 8,
        _SCALE: ext.GENERIC ?? 12,
        _ROTATION: ext.GENERIC ?? 12
    };

    return quantizationMap[attributeName] ?? ext.GENERIC ?? 8;
}

async function dequantizeAccessor(
    scenegraph: GLTFScenegraph,
    accessor: any,
    bits: number
): Promise<number> {
    if (!accessor.min || !accessor.max || accessor.min.length !== accessor.max.length) {
        return accessor.index;
    }

    const componentCount = getComponentCount(accessor.type);
    if (componentCount === 0) {
        return accessor.index;
    }

    const bufferView = scenegraph.getBufferView(accessor.bufferView);
    if (!bufferView) {
        return accessor.index;
    }

    const bufferData = scenegraph.getTypedArrayForBufferView(bufferView);
    if (!bufferData) {
        return accessor.index;
    }

    const count = accessor.count;
    const byteOffset = (accessor.byteOffset || 0) + (bufferView.byteOffset || 0);
    const stride =
        bufferView.byteStride || componentCount * getComponentSize(accessor.componentType);

    const floatData = new Float32Array(count * componentCount);
    const maxIntegerValue = Math.pow(2, bits) - 1;

    for (let i = 0; i < count; i++) {
        const elementOffset = byteOffset + i * stride;

        for (let c = 0; c < componentCount; c++) {
            const valueOffset = elementOffset + c * getComponentSize(accessor.componentType);
            const rawValue = readComponent(
                bufferData,
                valueOffset,
                accessor.componentType,
                accessor.normalized
            );

            const normalized = accessor.normalized ? rawValue : rawValue / maxIntegerValue;
            floatData[i * componentCount + c] =
                accessor.min[c] + (accessor.max[c] - accessor.min[c]) * normalized;
        }
    }

    const newBufferViewIndex = createAlignedBufferView(scenegraph, floatData);
    const newAccessor = {
        bufferView: newBufferViewIndex,
        byteOffset: 0,
        componentType: 5126,
        count,
        type: accessor.type,
        min: accessor.min,
        max: accessor.max,
        normalized: false
    };

    return scenegraph.addAccessor(newBufferViewIndex, newAccessor);
}

function createAlignedBufferView(scenegraph: GLTFScenegraph, data: Float32Array): number {
    const sourceBuffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const alignedByteLength = Math.ceil(sourceBuffer.byteLength / 4) * 4;

    if (alignedByteLength > sourceBuffer.byteLength) {
        const alignedBuffer = new Uint8Array(alignedByteLength);
        alignedBuffer.set(sourceBuffer);
        return scenegraph.addBufferView(alignedBuffer);
    }

    return scenegraph.addBufferView(sourceBuffer);
}

function readComponent(
    data: Uint8Array,
    offset: number,
    componentType: number,
    normalized: boolean
): number {
    if (offset >= data.length) {
        throw new Error(`Read component offset out of bounds: ${offset} >= ${data.length}`);
    }

    const view = new DataView(data.buffer, data.byteOffset + offset);

    switch (componentType) {
        case 5120: {
            const int8 = view.getInt8(0);
            return normalized ? Math.max(int8 / 127, -1) : int8;
        }
        case 5121: {
            const uint8 = view.getUint8(0);
            return normalized ? uint8 / 255 : uint8;
        }
        case 5122: {
            const int16 = view.getInt16(0, true);
            return normalized ? Math.max(int16 / 32767, -1) : int16;
        }
        case 5123: {
            const uint16 = view.getUint16(0, true);
            return normalized ? uint16 / 65535 : uint16;
        }
        default:
            throw new Error(`Unsupported component type for dequantization: ${componentType}`);
    }
}

function getComponentCount(type: string): number {
    switch (type) {
        case "SCALAR":
            return 1;
        case "VEC2":
            return 2;
        case "VEC3":
            return 3;
        case "VEC4":
            return 4;
        case "MAT2":
            return 4;
        case "MAT3":
            return 9;
        case "MAT4":
            return 16;
        default:
            return 0;
    }
}

function getComponentSize(componentType: number): number {
    switch (componentType) {
        case 5120:
        case 5121:
            return 1;
        case 5122:
        case 5123:
            return 2;
        case 5125:
        case 5126:
            return 4;
        default:
            return 0;
    }
}

function* makeMeshPrimitiveIterator(scenegraph: GLTFScenegraph): Generator<GLTFMeshPrimitive> {
    for (const mesh of scenegraph.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            yield primitive;
        }
    }
}
