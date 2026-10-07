/* Copyright (C) 2025 flywave.gl contributors */

import { loadSpz } from "@spz-loader/core";
import { MathUtils } from "three/webgpu";

import { type GLTFScenegraph } from "../../api/gltf-scenegraph";
import type { GLTFMeshPrimitive } from "../../types/gltf-json-schema";

export const EXT_SPZ_COMPRESSION = "KHR_gaussian_splatting_compression_spz_2";

// SPZ data interface
export interface SPZData {
    positions: Float32Array;
    colors: Float32Array;
    scales: Float32Array;
    rotations: Float32Array;
    alphas?: Float32Array;
    sh?: Float32Array;
}

export interface SPZDecompressionOptions {
    mergeAlphaToColor?: boolean;
    preserveSHData?: boolean;
}

export interface SPZDecompressionResult {
    vertexCount: number;
    attributes: {
        POSITION: number;
        COLOR_0: number;
        _SCALE: number;
        _ROTATION: number;
    };
    sphericalHarmonics?: {
        accessor: number;
        coefficientCount: number;
        degree: number;
    };
}

// SPZ decompressor
export class SPZDecompressor {
    /**
     * Decompress SPZ-compressed Gaussian splatting data
     */
    static async decompress(
        scenegraph: GLTFScenegraph,
        primitive: GLTFMeshPrimitive,
        spzExtension: any,
        options: SPZDecompressionOptions = {}
    ): Promise<SPZDecompressionResult> {
        const { mergeAlphaToColor = true, preserveSHData = true } = options;

        console.log("Starting SPZ decompression...");

        // Validate the extension data
        this.validateExtension(spzExtension);

        // Get the compressed data
        const compressedData = this.getCompressedData(scenegraph, spzExtension.bufferView);

        // Decode with @spz-loader/core
        const spzData = await this.decodeSPZ(compressedData);

        // Validate the decompressed data
        this.validateDecompressedData(spzData);

        // Compute and validate the vertex count
        const vertexCount = this.calculateVertexCount(spzData);
        console.log(`SPZ decompression: ${vertexCount} vertices found`);

        // Create the decompressed attributes
        const attributes = await this.createDecompressedAttributes(
            scenegraph,
            spzData,
            vertexCount,
            { mergeAlphaToColor, preserveSHData }
        );

        // Validate the accessor types that were created
        await this.validateCreatedAccessors(scenegraph, attributes);

        // Handle spherical harmonics coefficients
        let sphericalHarmonics: SPZDecompressionResult["sphericalHarmonics"];
        if (spzData.sh && preserveSHData) {
            sphericalHarmonics = await this.handleSphericalHarmonics(
                scenegraph,
                spzData.sh,
                vertexCount
            );
        }

        console.log("SPZ decompression completed successfully");

        return {
            vertexCount,
            attributes,
            sphericalHarmonics
        };
    }

    /**
     * Validate the types of the created accessors
     */
    private static async validateCreatedAccessors(
        scenegraph: GLTFScenegraph,
        attributes: SPZDecompressionResult["attributes"]
    ): Promise<void> {
        const expectedTypes = {
            POSITION: "VEC3",
            COLOR_0: "VEC4",
            _SCALE: "VEC3",
            _ROTATION: "VEC4"
        };

        for (const [attrName, accessorIndex] of Object.entries(attributes)) {
            const accessor = scenegraph.getAccessor(accessorIndex);
            if (!accessor) {
                throw new Error(`Failed to get accessor for ${attrName} at index ${accessorIndex}`);
            }

            const expectedType = expectedTypes[attrName as keyof typeof expectedTypes];
            if (accessor.type !== expectedType) {
                console.error(`Accessor validation failed for ${attrName}:`, {
                    expected: expectedType,
                    actual: accessor.type
                });
                throw new Error(
                    `Attribute type mismatch for ${attrName}. Expected ${expectedType}, found ${accessor.type}`
                );
            }
        }
    }

    /**
     * Validate the SPZ extension data
     */
    private static validateExtension(extension: any): void {
        if (typeof extension.bufferView !== "number") {
            throw new Error("SPZ extension must have a valid bufferView index");
        }

        if (extension.bufferView < 0) {
            throw new Error("SPZ extension bufferView index cannot be negative");
        }
    }

    /**
     * Validate the decompressed data
     */
    private static validateDecompressedData(spzData: SPZData): void {
        // Validate that the required data is present
        if (!spzData.positions || !spzData.colors || !spzData.scales || !spzData.rotations) {
            throw new Error("SPZ data missing required fields");
        }

        // Validate that the data lengths are consistent
        const positionCount = spzData.positions.length;
        const colorCount = spzData.colors.length;
        const scaleCount = spzData.scales.length;
        const rotationCount = spzData.rotations.length;

        if (positionCount % 3 !== 0) {
            throw new Error(
                `Invalid positions data length: ${positionCount} (must be multiple of 3)`
            );
        }
        if (colorCount % 3 !== 0) {
            throw new Error(`Invalid colors data length: ${colorCount} (must be multiple of 3)`);
        }
        if (scaleCount % 3 !== 0) {
            throw new Error(`Invalid scales data length: ${scaleCount} (must be multiple of 3)`);
        }
        if (rotationCount % 4 !== 0) {
            throw new Error(
                `Invalid rotations data length: ${rotationCount} (must be multiple of 4)`
            );
        }

        const vertexCountFromPositions = positionCount / 3;
        const vertexCountFromColors = colorCount / 3;
        const vertexCountFromScales = scaleCount / 3;
        const vertexCountFromRotations = rotationCount / 4;

        // Validate that the vertex counts are consistent
        if (vertexCountFromColors !== vertexCountFromPositions) {
            throw new Error(
                `Vertex count mismatch: positions=${vertexCountFromPositions}, colors=${vertexCountFromColors}`
            );
        }
        if (vertexCountFromScales !== vertexCountFromPositions) {
            throw new Error(
                `Vertex count mismatch: positions=${vertexCountFromPositions}, scales=${vertexCountFromScales}`
            );
        }
        if (vertexCountFromRotations !== vertexCountFromPositions) {
            throw new Error(
                `Vertex count mismatch: positions=${vertexCountFromPositions}, rotations=${vertexCountFromRotations}`
            );
        }

        // Validate the alpha data (if present)
        if (spzData.alphas && spzData.alphas.length !== vertexCountFromPositions) {
            throw new Error(
                `Alpha data length mismatch: ${spzData.alphas.length} != ${vertexCountFromPositions}`
            );
        }

        // Validate the spherical harmonics data (if present)
        if (spzData.sh && spzData.sh.length % vertexCountFromPositions !== 0) {
            throw new Error(
                `Spherical harmonics data length invalid: ${spzData.sh.length} for ${vertexCountFromPositions} vertices`
            );
        }
    }

    /**
     * Compute the vertex count
     */
    private static calculateVertexCount(spzData: SPZData): number {
        const vertexCount = spzData.positions.length / 3;

        if (!Number.isInteger(vertexCount) || vertexCount <= 0) {
            throw new Error(`Invalid vertex count calculated: ${vertexCount}`);
        }

        return vertexCount;
    }

    /**
     * Get the compressed data
     */
    private static getCompressedData(
        scenegraph: GLTFScenegraph,
        bufferViewIndex: number
    ): Uint8Array {
        const bufferView = scenegraph.getBufferView(bufferViewIndex);
        if (!bufferView) {
            throw new Error(`Invalid bufferView index: ${bufferViewIndex}`);
        }

        const compressedData = scenegraph.getTypedArrayForBufferView(bufferView);
        if (!compressedData) {
            throw new Error("Failed to get SPZ compressed data from bufferView");
        }

        // Validate the bufferView data size
        if (compressedData.byteLength === 0) {
            throw new Error("SPZ compressed data is empty");
        }

        console.log(`SPZ compressed data size: ${compressedData.byteLength} bytes`);

        return compressedData;
    }

    /**
     * Decode SPZ data with @spz-loader/core
     */
    private static async decodeSPZ(compressedData: Uint8Array): Promise<SPZData> {
        try {
            const arrayBuffer = compressedData.buffer.slice(
                compressedData.byteOffset,
                compressedData.byteOffset + compressedData.byteLength
            );

            // Decode with @spz-loader/core
            const gaussianCloud = await loadSpz(arrayBuffer);

            // Validate the decoding result
            if (
                !gaussianCloud.positions ||
                !gaussianCloud.colors ||
                !gaussianCloud.scales ||
                !gaussianCloud.rotations
            ) {
                throw new Error("Invalid SPZ decoding result: missing required fields");
            }

            return {
                positions: gaussianCloud.positions,
                colors: gaussianCloud.colors,
                scales: gaussianCloud.scales,
                rotations: gaussianCloud.rotations,
                alphas: gaussianCloud.alphas,
                sh: gaussianCloud.sh
            };
        } catch (error) {
            console.error("SPZ decoding failed:", error);
            throw new Error(`SPZ decoding failed: ${error.message}`);
        }
    }

    /**
     * Create the decompressed attributes
     */
    private static async createDecompressedAttributes(
        scenegraph: GLTFScenegraph,
        spzData: SPZData,
        vertexCount: number,
        options: SPZDecompressionOptions
    ): Promise<SPZDecompressionResult["attributes"]> {
        // Handle the color data (may contain alpha)
        const colorData = await this.prepareColorData(
            spzData,
            vertexCount,
            options.mergeAlphaToColor
        );

        // Create all required attributes - using standard attribute names
        const attributes = {
            POSITION: this.createFloatAttribute(
                scenegraph,
                spzData.positions,
                "VEC3",
                3,
                vertexCount
            ),
            COLOR_0: this.createColorAttribute(scenegraph, colorData, vertexCount),
            _SCALE: this.createFloatAttribute(scenegraph, spzData.scales, "VEC3", 3, vertexCount),
            _ROTATION: this.createFloatAttribute(
                scenegraph,
                spzData.rotations,
                "VEC4",
                4,
                vertexCount
            )
        };

        return attributes;
    }

    /**
     * Prepare the color data (handling alpha and clamped conversion)
     */
    private static async prepareColorData(
        spzData: SPZData,
        vertexCount: number,
        mergeAlphaToColor: boolean
    ): Promise<Uint8Array> {
        const colorsWithAlpha = new Uint8Array(vertexCount * 4);

        if (spzData.alphas && mergeAlphaToColor) {
            // Create color data with alpha using clamped conversion
            for (let i = 0; i < vertexCount; i++) {
                colorsWithAlpha[i * 4] = MathUtils.clamp(spzData.colors[i * 3], 0, 1) * 255; // R
                colorsWithAlpha[i * 4 + 1] = MathUtils.clamp(spzData.colors[i * 3 + 1], 0, 1) * 255; // G
                colorsWithAlpha[i * 4 + 2] = MathUtils.clamp(spzData.colors[i * 3 + 2], 0, 1) * 255; // B
                colorsWithAlpha[i * 4 + 3] = MathUtils.clamp(spzData.alphas[i], 0, 1) * 255; // A
            }
        } else {
            // If there is no alpha or merging is not needed, convert RGB to RGBA
            for (let i = 0; i < vertexCount; i++) {
                colorsWithAlpha[i * 4] = MathUtils.clamp(spzData.colors[i * 3], 0, 1) * 255; // R
                colorsWithAlpha[i * 4 + 1] = MathUtils.clamp(spzData.colors[i * 3 + 1], 0, 1) * 255; // G
                colorsWithAlpha[i * 4 + 2] = MathUtils.clamp(spzData.colors[i * 3 + 2], 0, 1) * 255; // B
                colorsWithAlpha[i * 4 + 3] = 255; // Default opacity is 1 (255)
            }
        }

        return colorsWithAlpha;
    }

    /**
     * Create the color attribute accessor (using UNSIGNED_BYTE)
     */
    private static createColorAttribute(
        scenegraph: GLTFScenegraph,
        data: Uint8Array,
        vertexCount: number
    ): number {
        const components = 4; // RGBA
        const actualCount = data.length / components;

        if (actualCount !== vertexCount) {
            throw new Error(
                `Color data count mismatch: expected ${vertexCount}, got ${actualCount}`
            );
        }

        const bufferViewIndex = scenegraph.addBufferView(data);

        const accessorData = {
            bufferView: bufferViewIndex,
            size: components,
            componentType: 5121, // UNSIGNED_BYTE
            count: vertexCount,
            type: "VEC4",
            min: [0, 0, 0, 0],
            max: [255, 255, 255, 255]
        };

        const accessorIndex = scenegraph.addAccessor(bufferViewIndex, accessorData);
        return this.validateAndFixAccessorType(scenegraph, accessorIndex, "VEC4");
    }

    /**
     * Create a floating point attribute accessor
     */
    private static createFloatAttribute(
        scenegraph: GLTFScenegraph,
        data: Float32Array,
        type: string,
        components: number,
        expectedCount: number
    ): number {
        // Validate the data length
        const actualCount = data.length / components;
        if (!Number.isInteger(actualCount) || actualCount !== expectedCount) {
            throw new Error(
                `Data count mismatch for ${type}: expected ${expectedCount}, got ${actualCount}`
            );
        }

        if (data.length % components !== 0) {
            throw new Error(
                `Data length ${data.length} is not a multiple of components ${components}`
            );
        }

        const bufferViewIndex = this.createAlignedBufferView(scenegraph, data);
        const count = data.length / components;
        const { min, max } = this.calculateMinMax(data, components);

        const accessorData = {
            bufferView: bufferViewIndex,
            size: components,
            componentType: 5126, // FLOAT
            count,
            type,
            min,
            max
        };

        const accessorIndex = scenegraph.addAccessor(bufferViewIndex, accessorData);
        return this.validateAndFixAccessorType(scenegraph, accessorIndex, type);
    }

    /**
     * Validate and fix the accessor type
     */
    private static validateAndFixAccessorType(
        scenegraph: GLTFScenegraph,
        accessorIndex: number,
        expectedType: string
    ): number {
        const accessor = scenegraph.getAccessor(accessorIndex);
        if (!accessor) {
            throw new Error(`Failed to get accessor at index ${accessorIndex}`);
        }

        if (accessor.type !== expectedType) {
            // Patch the accessor type directly in the JSON
            if (scenegraph.json.accessors && scenegraph.json.accessors[accessorIndex]) {
                scenegraph.json.accessors[accessorIndex].type = expectedType;
            } else {
                throw new Error(
                    `Cannot fix accessor type: accessor not found at index ${accessorIndex}`
                );
            }
        }

        return accessorIndex;
    }

    /**
     * Create a byte-aligned BufferView
     */
    private static createAlignedBufferView(scenegraph: GLTFScenegraph, data: Float32Array): number {
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

    /**
     * Compute the min/max values
     */
    private static calculateMinMax(
        data: Float32Array,
        components: number
    ): { min: number[]; max: number[] } {
        const min = new Array(components).fill(Infinity);
        const max = new Array(components).fill(-Infinity);

        for (let i = 0; i < data.length; i += components) {
            for (let j = 0; j < components; j++) {
                const value = data[i + j];
                if (!isNaN(value) && isFinite(value)) {
                    min[j] = Math.min(min[j], value);
                    max[j] = Math.max(max[j], value);
                }
            }
        }

        // Validate the min/max values
        for (let j = 0; j < components; j++) {
            if (!isFinite(min[j]) || !isFinite(max[j])) {
                throw new Error(`Invalid min/max values calculated for component ${j}`);
            }
        }

        return { min, max };
    }

    /**
     * Handle the spherical harmonics coefficient data
     */
    private static async handleSphericalHarmonics(
        scenegraph: GLTFScenegraph,
        shData: Float32Array,
        vertexCount: number
    ): Promise<SPZDecompressionResult["sphericalHarmonics"]> {
        const shComponents = 3; // The three RGB channels each store spherical harmonics coefficients
        const coefficientsPerVertex = shData.length / vertexCount;

        if (coefficientsPerVertex % shComponents !== 0) {
            throw new Error(
                `Invalid spherical harmonics data: ${coefficientsPerVertex} coefficients per vertex`
            );
        }

        const shAccessorIndex = this.createFloatAttribute(
            scenegraph,
            shData,
            "VEC3",
            shComponents,
            vertexCount * (coefficientsPerVertex / shComponents)
        );

        return {
            accessor: shAccessorIndex,
            coefficientCount: coefficientsPerVertex,
            degree: Math.sqrt(coefficientsPerVertex / shComponents) - 1
        };
    }

    /**
     * Clean up primitive attributes
     */
    static cleanPrimitiveAttributes(primitive: GLTFMeshPrimitive): void {
        const attributesToRemove = [];

        for (const attrName in primitive.attributes) {
            // Remove all extension-related attributes
            if (
                attrName.startsWith("KHR_gaussian_splatting:") ||
                attrName.startsWith("SH_DEGREE_") ||
                attrName.startsWith("SH_COEFFS_")
            ) {
                attributesToRemove.push(attrName);
            }
        }

        for (const attrName of attributesToRemove) {
            delete primitive.attributes[attrName];
        }
    }

    /**
     * Validate the final attribute setup
     */
    static validateFinalAttributes(primitive: GLTFMeshPrimitive): void {
        const validAttributes = [];
        const invalidAttributes = [];

        for (const attrName in primitive.attributes) {
            const accessorIndex = primitive.attributes[attrName];
            if (typeof accessorIndex === "number" && accessorIndex >= 0) {
                validAttributes.push(attrName);
            } else {
                invalidAttributes.push(attrName);
            }
        }

        if (invalidAttributes.length > 0) {
            console.warn(`Invalid attributes found:`, invalidAttributes);
        }
    }
}

// Convenience function
export async function decompressSPZ(
    scenegraph: GLTFScenegraph,
    primitive: GLTFMeshPrimitive,
    spzExtension: any,
    options?: SPZDecompressionOptions
): Promise<void> {
    try {
        // First clean up the primitive's existing attributes to avoid duplicates
        SPZDecompressor.cleanPrimitiveAttributes(primitive);

        const result = await SPZDecompressor.decompress(
            scenegraph,
            primitive,
            spzExtension,
            options
        );

        // Set only the standard attributes, avoiding extension prefixes
        Object.assign(primitive.attributes, result.attributes);

        // Store the spherical harmonics info in primitive extras (if present)
        if (result.sphericalHarmonics) {
            primitive.extras = primitive.extras || {};
            primitive.extras.sphericalHarmonics = result.sphericalHarmonics;
        }

        console.log(`SPZ decompression completed: ${result.vertexCount} vertices processed`);

        // Validate the final attribute setup
        SPZDecompressor.validateFinalAttributes(primitive);
    } catch (error) {
        console.error("SPZ decompression failed:", error);
        throw error;
    }
}

export function validateSPZExtension(extension: any): void {
    if (typeof extension.bufferView !== "number") {
        throw new Error("SPZ extension must have a valid bufferView index");
    }

    if (extension.bufferView < 0) {
        throw new Error("SPZ extension bufferView index cannot be negative");
    }
}
