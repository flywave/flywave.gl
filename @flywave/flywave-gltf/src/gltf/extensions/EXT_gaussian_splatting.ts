/* Copyright (C) 2025 flywave.gl contributors */

import type { GLTFLoaderOptions } from "../../gltf-loader";
import { meshoptDecodeGltfBuffer } from "../../meshopt/meshopt-decoder";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type {
    GLTF,
    GLTF_KHR_gaussian_splatting,
    GLTFMeshPrimitive
} from "../types/gltf-json-schema";
// Import the SPZ compression module
import { decompressSPZ, EXT_SPZ_COMPRESSION, validateSPZExtension } from "./utils/spz-compression";

// Extension constants
const EXT_GAUSSIAN_SPLATTING = "KHR_gaussian_splatting";
const EXT_MESHOPT_COMPRESSION = "EXT_meshopt_compression";
const EXT_MESH_QUANTIZATION = "KHR_mesh_quantization";

export const name = EXT_GAUSSIAN_SPLATTING;

// Attribute constants
const REQUIRED_ATTRIBUTES = {
    POSITION: "POSITION",
    COLOR_0: "COLOR_0",
    SCALE: "_SCALE",
    ROTATION: "_ROTATION"
} as const;

const OPTIONAL_ATTRIBUTES = {
    OPACITY: "_OPACITY"
} as const;

// Main decode function
export async function decode(
    gltfData: { json: GLTF; buffers?: any[] },
    options: GLTFLoaderOptions
): Promise<void> {
    const scenegraph = new GLTFScenegraph(gltfData);

    // Remember the original state to detect whether repacking is needed
    const originalSourceBuffersCount = scenegraph.sourceBuffers.length;
    const originalByteLength = scenegraph.byteLength;

    await decodeExtGaussianSplatting(scenegraph, options);

    // Check whether new buffer data has been added
    const hasNewBufferData =
        scenegraph.sourceBuffers.length > originalSourceBuffersCount ||
        scenegraph.byteLength > originalByteLength;

    if (hasNewBufferData) {
        console.log(
            `Rebuilding binary chunk: added ${
                scenegraph.sourceBuffers.length - originalSourceBuffersCount
            } buffers`
        );
        scenegraph.createBinaryChunk();
        gltfData.buffers = scenegraph.gltf.buffers;
    }

    gltfData.json = scenegraph.json;
}

async function decodeExtGaussianSplatting(
    scenegraph: GLTFScenegraph,
    options: GLTFLoaderOptions
): Promise<void> {
    const promises: Array<Promise<void>> = [];

    for (const primitive of makeMeshPrimitiveIterator(scenegraph)) {
        // Use the unified extension detection function
        if (hasGaussianSplattingExtension(primitive, scenegraph)) {
            promises.push(processPrimitive(scenegraph, primitive, options));
        }
    }

    await Promise.all(promises);

    // Only remove it if the extension was actually processed
    if (promises.length > 0) {
        scenegraph.removeExtension(EXT_GAUSSIAN_SPLATTING);
    }
}

/**
 * Detect whether a primitive carries Gaussian splatting related extensions
 * (supports deeply nested ones)
 */
function hasGaussianSplattingExtension(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph
): boolean {
    const extensions = getGaussianSplattingExtension(primitive, scenegraph);
    return !!(extensions.main || extensions.spz);
}

/**
 * Get the unified Gaussian splatting extension data (supports deep nesting)
 */
function getGaussianSplattingExtension(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph
): { main?: any; spz?: any } {
    // 1. Get the main extension
    const main = scenegraph.getObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);

    // 2. Get the standalone SPZ extension
    const standaloneSpz = scenegraph.getObjectExtension(primitive, EXT_SPZ_COMPRESSION);

    // 3. Get the SPZ extension nested inside the main extension
    const nestedSpz = main?.extensions?.[EXT_SPZ_COMPRESSION];

    // 4. Get the deeply nested SPZ extension
    const deeplyNestedSpz =
        main?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION];

    return {
        main,
        spz: standaloneSpz || nestedSpz || deeplyNestedSpz
    };
}

/**
 * Log the extension detection result for debugging
 */
function logExtensionDetection(
    primitive: GLTFMeshPrimitive,
    extensions: { main?: any; spz?: any },
    scenegraph: GLTFScenegraph
): void {
    const main = scenegraph.getObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);
    const standaloneSpz = scenegraph.getObjectExtension(primitive, EXT_SPZ_COMPRESSION);
    const nestedSpz = main?.extensions?.[EXT_SPZ_COMPRESSION];
    const deeplyNestedSpz =
        main?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION];

    console.log("Gaussian splatting extension detection:", {
        hasMainExtension: !!extensions.main,
        hasSpzExtension: !!extensions.spz,
        mainExtension: main ? "found" : "not found",
        spzExtensionTypes: {
            standalone: !!standaloneSpz,
            nested: !!nestedSpz,
            deeplyNested: !!deeplyNestedSpz
        },
        spzSource: standaloneSpz
            ? "standalone"
            : nestedSpz
            ? "nested"
            : deeplyNestedSpz
            ? "deeplyNested"
            : "none"
    });
}

async function processPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    options: GLTFLoaderOptions
): Promise<void> {
    // Use the unified extension getter
    const extensions = getGaussianSplattingExtension(primitive, scenegraph);

    // Log the detection result for debugging
    logExtensionDetection(primitive, extensions, scenegraph);

    const { main: mainExtension, spz: spzExtension } = extensions;

    // Return early when no Gaussian splatting related extension is found
    if (!mainExtension && !spzExtension) {
        console.log("No Gaussian splatting extensions found, skipping primitive");
        return;
    }

    try {
        // 1. First clean up any stale extension attributes
        cleanupLegacyAttributes(primitive);

        // 2. Handle compressed data - SPZ compression takes priority
        if (spzExtension) {
            console.log("Processing SPZ compression extension");

            // Validate the SPZ extension data
            validateSPZExtension(spzExtension);

            // Use the SPZ decompression module
            await decompressSPZ(scenegraph, primitive, spzExtension, {
                mergeAlphaToColor: true,
                preserveSHData: true
            });

            // Clean up the SPZ extension
            await cleanupSPZExtension(primitive, scenegraph, mainExtension, spzExtension);
        } else if (mainExtension?.bufferView !== undefined && mainExtension.bufferView !== -1) {
            // Handle other compression formats
            await decompressPrimitive(scenegraph, primitive, mainExtension, options);
        } else {
            // Handle opacity of uncompressed data
            processUncompressedOpacity(scenegraph, primitive);
        }

        // 3. Clean up again to make sure no extension attributes are left behind
        cleanupLegacyAttributes(primitive);

        // 4. Validate the decompressed primitive attributes
        validateDecompressedPrimitive(scenegraph, primitive);

        // 5. Handle dequantization (KHR_mesh_quantization)
        await dequantizePrimitive(scenegraph, primitive);

        // 6. Handle spherical harmonics coefficients
        if (mainExtension?.sphericalHarmonics) {
            processSphericalHarmonics(primitive, mainExtension.sphericalHarmonics);
        }

        primitive.extras = primitive.extras || {};
        primitive.extras.isGaussianSplatting = true;

        primitive.extras.originalExtensions = {
            hadMainExtension: !!mainExtension,
            hadSpzExtension: !!spzExtension
        };
    } catch (error) {
        console.error(`Failed to process Gaussian splatting primitive:`, error);
        throw error;
    } finally {
        // Make sure all related extensions are removed at the end
        await cleanupAllGaussianExtensions(primitive, scenegraph);
    }
}

/**
 * Clean up the SPZ extension (handles all nesting cases)
 */
async function cleanupSPZExtension(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph,
    mainExtension: any,
    spzExtension: any
): Promise<void> {
    // Remove the standalone SPZ extension
    scenegraph.removeObjectExtension(primitive, EXT_SPZ_COMPRESSION);

    // Remove the SPZ extension nested inside the main extension
    if (mainExtension?.extensions?.[EXT_SPZ_COMPRESSION]) {
        delete mainExtension.extensions[EXT_SPZ_COMPRESSION];
        if (Object.keys(mainExtension.extensions).length === 0) {
            delete mainExtension.extensions;
        }
    }

    // Remove the deeply nested SPZ extension
    if (mainExtension?.extensions?.[EXT_GAUSSIAN_SPLATTING]?.extensions?.[EXT_SPZ_COMPRESSION]) {
        delete mainExtension.extensions[EXT_GAUSSIAN_SPLATTING].extensions[EXT_SPZ_COMPRESSION];
        if (Object.keys(mainExtension.extensions[EXT_GAUSSIAN_SPLATTING].extensions).length === 0) {
            delete mainExtension.extensions[EXT_GAUSSIAN_SPLATTING].extensions;
        }
        if (Object.keys(mainExtension.extensions[EXT_GAUSSIAN_SPLATTING]).length === 0) {
            delete mainExtension.extensions[EXT_GAUSSIAN_SPLATTING];
        }
    }
}

/**
 * Clean up all Gaussian splatting related extensions
 */
async function cleanupAllGaussianExtensions(
    primitive: GLTFMeshPrimitive,
    scenegraph: GLTFScenegraph
): Promise<void> {
    scenegraph.removeObjectExtension(primitive, EXT_GAUSSIAN_SPLATTING);
    scenegraph.removeObjectExtension(primitive, EXT_SPZ_COMPRESSION);
}

/**
 * Clean up leftover extension attributes
 */
function cleanupLegacyAttributes(primitive: GLTFMeshPrimitive): void {
    const attributes = primitive.attributes;
    const legacyAttributePatterns = [
        /^KHR_gaussian_splatting:/, // Attributes prefixed with the extension name
        /^SH_DEGREE_\d+_COEF_\d+$/, // Spherical harmonics coefficient attributes
        /^SH_COEFFS_\d+$/ // Other spherical harmonics formats
    ];

    let cleanedCount = 0;
    for (const attrName in attributes) {
        for (const pattern of legacyAttributePatterns) {
            if (pattern.test(attrName)) {
                delete attributes[attrName];
                cleanedCount++;
                break;
            }
        }
    }
}

// Validate the decompressed primitive attributes
function validateDecompressedPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive
): void {
    const attributes = primitive.attributes;
    // Validate the required attributes
    const requiredAttributes = ["POSITION", "COLOR_0", "_SCALE", "_ROTATION"];
    for (const attrName of requiredAttributes) {
        if (attributes[attrName] === undefined) {
            throw new Error(`Missing required attribute after decompression: ${attrName}`);
        }

        const accessor = scenegraph.getAccessor(attributes[attrName]);
        if (!accessor) {
            throw new Error(`Invalid accessor for attribute: ${attrName}`);
        }

        // Validate that the data is usable
        if (accessor.count === 0) {
            throw new Error(`Empty accessor for attribute: ${attrName}`);
        }
    }

    // Make sure no extension attributes are left behind
    for (const attrName in attributes) {
        if (attrName.startsWith("KHR_gaussian_splatting:")) {
            console.warn(`Found legacy extension attribute after cleanup: ${attrName}`);
            delete attributes[attrName];
        }
    }
}

function validateAttributeDataType(
    scenegraph: GLTFScenegraph,
    accessorIndex: number,
    expectedType: string
): void {
    if (accessorIndex === undefined) return;

    const accessor = scenegraph.getAccessor(accessorIndex);
    if (!accessor) {
        throw new Error(`Missing accessor for validation: ${accessorIndex}`);
    }

    if (accessor.type !== expectedType) {
        throw new Error(
            `Attribute type mismatch after decompression. Expected ${expectedType}, found ${accessor.type}`
        );
    }

    // Validate that the component type is FLOAT
    if (accessor.componentType !== 5126) {
        throw new Error(
            `Expected FLOAT component type for attribute, found: ${accessor.componentType}`
        );
    }
}

// Original validation function (used to validate before compression)
function validateGaussianPrimitive(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive): void {
    const attributes = primitive.attributes;

    // For compressed data only the basic attribute presence needs to be validated
    for (const [attrKey, attrName] of Object.entries(REQUIRED_ATTRIBUTES)) {
        // SCALE and ROTATION may be absent in compressed data; they are created by decompression
        if (attrKey === "SCALE" || attrKey === "ROTATION") {
            continue;
        }

        if (attributes[attrName] === undefined) {
            throw new Error(`Missing required attribute for Gaussian splatting: ${attrName}`);
        }
    }
}

async function dequantizePrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive
): Promise<void> {
    const quantizationExt = scenegraph.getObjectExtension(primitive, EXT_MESH_QUANTIZATION);
    if (!quantizationExt) return;

    console.log("Processing mesh quantization extension");

    for (const [attributeName, accessorIndex] of Object.entries(primitive.attributes)) {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor || accessor.componentType === 5126) continue;

        const bits = getQuantizationBits(attributeName, quantizationExt);
        if (bits === 0) continue;

        console.log(`Dequantizing attribute: ${attributeName} with ${bits} bits`);
        const newAccessorIndex = await dequantizeAccessor(scenegraph, accessor, bits);
        primitive.attributes[attributeName] = newAccessorIndex;
    }

    scenegraph.removeObjectExtension(primitive, EXT_MESH_QUANTIZATION);
}

function getQuantizationBits(attributeName: string, ext: any): number {
    // Simplified quantization bit depth lookup
    const quantizationMap: Record<string, number> = {
        POSITION: ext.POSITION ?? 14,
        POSITION_0: ext.POSITION ?? 14,
        NORMAL: ext.NORMAL ?? 10,
        NORMAL_0: ext.NORMAL ?? 10,
        TANGENT: ext.TANGENT ?? 10,
        TANGENT_0: ext.TANGENT ?? 10,
        TEXCOORD: ext.TEXCOORD ?? 12,
        TEXCOORD_0: ext.TEXCOORD ?? 12,
        TEXCOORD_1: ext.TEXCOORD ?? 12,
        COLOR: ext.COLOR ?? 8,
        COLOR_0: ext.COLOR ?? 8,
        COLOR_1: ext.COLOR ?? 8,
        WEIGHTS: ext.WEIGHTS ?? 8,
        WEIGHTS_0: ext.WEIGHTS ?? 8,
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

    // Create the dequantized floating point data
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

            // Dequantization computation
            const normalized = accessor.normalized ? rawValue : rawValue / maxIntegerValue;
            const floatValue = accessor.min[c] + (accessor.max[c] - accessor.min[c]) * normalized;

            floatData[i * componentCount + c] = floatValue;
        }
    }

    // Create a new buffer view and accessor
    const newBufferViewIndex = createAlignedBufferView(scenegraph, floatData);

    const newAccessor = {
        bufferView: newBufferViewIndex,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count,
        type: accessor.type,
        min: accessor.min,
        max: accessor.max,
        normalized: false
    };

    return scenegraph.addAccessor(newBufferViewIndex, newAccessor);
}

// Unified byte-aligned buffer view creation helper
function createAlignedBufferView(scenegraph: GLTFScenegraph, data: Float32Array): number {
    const sourceBuffer = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const alignedByteLength = Math.ceil(sourceBuffer.byteLength / 4) * 4;

    if (alignedByteLength > sourceBuffer.byteLength) {
        const alignedBuffer = new Uint8Array(alignedByteLength);
        alignedBuffer.set(sourceBuffer);
        // Pad the remaining bytes with 0
        for (let i = sourceBuffer.byteLength; i < alignedByteLength; i++) {
            alignedBuffer[i] = 0;
        }
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
        case 5120: // BYTE
            const int8 = view.getInt8(0);
            return normalized ? Math.max(int8 / 127, -1) : int8;
        case 5121: // UNSIGNED_BYTE
            const uint8 = view.getUint8(0);
            return normalized ? uint8 / 255 : uint8;
        case 5122: // SHORT
            const int16 = view.getInt16(0, true);
            return normalized ? Math.max(int16 / 32767, -1) : int16;
        case 5123: // UNSIGNED_SHORT
            const uint16 = view.getUint16(0, true);
            return normalized ? uint16 / 65535 : uint16;
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
        case 5120: // BYTE
        case 5121: // UNSIGNED_BYTE
            return 1;
        case 5122: // SHORT
        case 5123: // UNSIGNED_SHORT
            return 2;
        case 5125: // UNSIGNED_INT
        case 5126: // FLOAT
            return 4;
        default:
            return 0;
    }
}

async function decompressPrimitive(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    extension: GLTF_KHR_gaussian_splatting,
    options: GLTFLoaderOptions
): Promise<void> {
    // Check for meshopt compression
    if (extension.bufferView !== undefined && extension.bufferView !== -1) {
        const bufferView = scenegraph.getBufferView(extension.bufferView);
        if (!bufferView) throw new Error(`Invalid bufferView index: ${extension.bufferView}`);

        // Check for meshopt compression
        const meshoptExt = scenegraph.getObjectExtension(bufferView, EXT_MESHOPT_COMPRESSION);
        if (meshoptExt) {
            await decompressMeshopt(scenegraph, primitive, bufferView, meshoptExt);
            scenegraph.removeObjectExtension(bufferView, EXT_MESHOPT_COMPRESSION);
            return;
        }
    }

    // If there is a bufferView but no supported compression extension, throw an error
    if (extension.bufferView !== undefined && extension.bufferView !== -1) {
        throw new Error("Unsupported compression format for Gaussian splatting");
    }

    // If there is neither an SPZ extension nor a bufferView, the data is uncompressed;
    // in that case the attributes should already be present in primitive.attributes
}

function processUncompressedOpacity(scenegraph: GLTFScenegraph, primitive: GLTFMeshPrimitive) {
    // Keep the original implementation
    console.log("Processing uncompressed opacity data");
    // Logic for handling uncompressed opacity data can be added here
}

async function decompressMeshopt(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    bufferView: any,
    meshoptExt: any
) {
    console.log("Decompressing meshopt compressed data");
    // Keep the original implementation
    // The meshopt decompression logic should go here
}

function processSphericalHarmonics(
    primitive: GLTFMeshPrimitive,
    sphericalHarmonics: { coefficients: number[] }
): void {
    primitive.extras = primitive.extras || {};
    primitive.extras.sphericalHarmonics = { coefficients: sphericalHarmonics.coefficients };
    console.log("Processed spherical harmonics coefficients");
}

function* makeMeshPrimitiveIterator(scenegraph: GLTFScenegraph): Generator<GLTFMeshPrimitive> {
    for (const mesh of scenegraph.json.meshes || []) {
        for (const primitive of mesh.primitives) {
            yield primitive;
        }
    }
}
