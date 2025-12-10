/* Copyright (C) 2025 flywave.gl contributors */

import { decodeExtensions } from "./Extensions";
import {
    type DecodeHeaderResult,
    type DecodeOptions,
    type DecodeResult,
    type DecodeTriangleIndicesResult,
    type DecodeVertexDataResult,
    type Header,
    type StratumLayerData,
    type StratumVoxelData
} from "./types";

// Constants
const STRATUM_MESH_HEADER_SIZE = 88;

/**
 * Decoding steps enumeration for progressive loading
 */
export const DECODING_STEPS = {
    header: 0,
    vertices: 1,
    triangleIndices: 2,
    edgeIndices: 3,
    extensions: 4
};

const DEFAULT_OPTIONS = {
    maxDecodingStep: DECODING_STEPS.extensions
};

// Utility Functions

/**
 * Decodes a ZigZag encoded value
 * @param value - ZigZag encoded value
 * @returns Decoded signed integer
 */
function decodeZigZag(value: number): number {
    return (value >> 1) ^ -(value & 1);
}

/**
 * Returns -1 for negative numbers, 1 otherwise
 * @param v - Input value
 * @returns Sign value (-1 or 1)
 */
function signNotZero(v: number): number {
    return v < 0.0 ? -1.0 : 1.0;
}

/**
 * Converts SNORM value to [-1, 1] range
 * @param v - Input value [0, 255]
 * @returns Normalized value [-1, 1]
 */
function fromSnorm(v: number): number {
    return (clamp(v, 0.0, 255.0) / 255.0) * 2.0 - 1.0;
}

/**
 * Clamps a value between min and max
 * @param val - Value to clamp
 * @param minVal - Minimum value
 * @param maxVal - Maximum value
 * @returns Clamped value
 */
function clamp(val: number, minVal: number, maxVal: number): number {
    return Math.min(Math.max(val, minVal), maxVal);
}

/**
 * Decodes oct-encoded normal vectors
 * @param x - First octant coordinate
 * @param y - Second octant coordinate
 * @returns Normalized [x, y, z] vector
 */
function octDecode(x: number, y: number): [number, number, number] {
    let fx = fromSnorm(x);
    let fy = fromSnorm(y);
    const fz = 1.0 - (Math.abs(fx) + Math.abs(fy));

    if (fz < 0.0) {
        const oldX = fx;
        fx = (1.0 - Math.abs(fy)) * signNotZero(oldX);
        fy = (1.0 - Math.abs(oldX)) * signNotZero(fy);
    }

    const vec = [fx, fy, fz];
    const length = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);

    return length === 0 ? [0, 0, 0] : [vec[0] / length, vec[1] / length, vec[2] / length];
}

// Decoding Functions

/**
 * Decodes the mesh header information
 * @param dataView - Data view of the buffer
 * @returns Header information and end position
 */
function decodeHeader(dataView: DataView): DecodeHeaderResult {
    const position = 0;
    const header: Header = {
        centerX: dataView.getFloat64(position, true),
        centerY: dataView.getFloat64(position + 8, true),
        centerZ: dataView.getFloat64(position + 16, true),
        minHeight: dataView.getFloat32(position + 24, true),
        maxHeight: dataView.getFloat32(position + 28, true),
        boundingSphereCenterX: dataView.getFloat64(position + 32, true),
        boundingSphereCenterY: dataView.getFloat64(position + 40, true),
        boundingSphereCenterZ: dataView.getFloat64(position + 48, true),
        boundingSphereRadius: dataView.getFloat64(position + 56, true),
        horizonOcclusionPointX: dataView.getFloat64(position + 64, true),
        horizonOcclusionPointY: dataView.getFloat64(position + 72, true),
        horizonOcclusionPointZ: dataView.getFloat64(position + 80, true)
    };

    return {
        header,
        headerEndPosition: STRATUM_MESH_HEADER_SIZE
    };
}

/**
 * Optimized 12-bit data unpacking function
 * @param dataView - Data view of the buffer
 * @param start - Starting position
 * @param count - Number of values to unpack
 * @returns Array of unpacked 16-bit values
 */
function unpack12BitData(dataView: DataView, start: number, count: number): Uint16Array {
    const result = new Uint16Array(count);
    let byteIndex = start;
    let resultIndex = 0;

    const pairs = Math.floor(count / 2);
    for (let i = 0; i < pairs; i++) {
        const byte1 = dataView.getUint8(byteIndex++);
        const byte2 = dataView.getUint8(byteIndex++);
        const byte3 = dataView.getUint8(byteIndex++);

        result[resultIndex++] = (byte1 << 4) | (byte2 >> 4);
        result[resultIndex++] = ((byte2 & 0x0f) << 8) | byte3;
    }

    if (count % 2 !== 0) {
        const byte1 = dataView.getUint8(byteIndex++);
        const byte2 = dataView.getUint8(byteIndex++);
        result[resultIndex] = (byte1 << 4) | (byte2 >> 4);
    }

    return result;
}

/**
 * Decodes vertex data including positions, normals and UVs
 * @param dataView - Data view of the buffer
 * @param headerEndPosition - Position after header
 * @returns Vertex data and end position
 */
function decodeVertexData(dataView: DataView, headerEndPosition: number): DecodeVertexDataResult {
    let position = headerEndPosition;
    const vertexCount = dataView.getUint32(position, true);
    position += 4;

    // Helper to read coordinate data
    const readCoordData = (): Uint16Array => {
        const data = new Uint16Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            data[i] = dataView.getUint16(position, true);
            position += 2;
        }
        return data;
    };

    // Read and decode position data
    const uArray = readCoordData();
    const vArray = readCoordData();
    const hArray = readCoordData();

    const decodedU = new Float64Array(vertexCount);
    const decodedV = new Float64Array(vertexCount);
    const decodedH = new Float64Array(vertexCount);

    let u = 0;
    let v = 0;
    let h = 0;
    for (let i = 0; i < vertexCount; i++) {
        u += decodeZigZag(uArray[i]);
        v += decodeZigZag(vArray[i]);
        h += decodeZigZag(hArray[i]);

        decodedU[i] = u;
        decodedV[i] = v;
        decodedH[i] = h;
    }

    // Decode normals
    const normalsArray = new Float32Array(vertexCount * 3);
    let prevNu = 0;
    let prevNv = 0;

    for (let i = 0; i < vertexCount; i++) {
        const deltaNu = decodeZigZag(dataView.getUint16(position, true)) + prevNu;
        position += 2;
        const deltaNv = decodeZigZag(dataView.getUint16(position, true)) + prevNv;
        position += 2;

        const nx = prevNu + deltaNu;
        const ny = prevNv + deltaNv;

        prevNu = nx;
        prevNv = ny;

        const normal = octDecode(nx, ny);
        normalsArray[i * 3] = normal[0];
        normalsArray[i * 3 + 1] = normal[1];
        normalsArray[i * 3 + 2] = normal[2];
    }

    // Decode UVs
    const uvByteSize = Math.ceil((vertexCount * 2 * 12) / 8);
    const uvUnpacked = unpack12BitData(dataView, position, vertexCount * 2);
    position += uvByteSize;

    const uvsArray = new Float32Array(vertexCount * 2);
    let prevUVu = 0;
    let prevUVv = 0;
    for (let i = 0; i < vertexCount; i++) {
        const u = decodeZigZag(uvUnpacked[i * 2]) + prevUVu;
        const v = decodeZigZag(uvUnpacked[i * 2 + 1]) + prevUVv;

        prevUVu = u;
        prevUVv = v;

        uvsArray[i * 2] = u / 0xfff;
        uvsArray[i * 2 + 1] = v / 0xfff;
    }

    // Handle alignment padding
    const alignment = vertexCount > 65535 ? 4 : 2;
    const padding = (alignment - (position % alignment)) % alignment;
    position += padding;

    return {
        vertexData: {
            u: decodedU,
            v: decodedV,
            h: decodedH,
            normals: normalsArray,
            uvs: uvsArray
        },
        vertexDataEndPosition: position
    };
}

/**
 * Decodes triangle indices with high-watermark decoding
 * @param dataView - Data view of the buffer
 * @param vertexCount - Number of vertices
 * @param vertexDataEndPosition - Position after vertex data
 * @returns Triangle indices and end position
 */
function decodeTriangleIndices(
    dataView: DataView,
    vertexCount: number,
    vertexDataEndPosition: number
): DecodeTriangleIndicesResult {
    let position = vertexDataEndPosition;
    const bytesPerIndex = vertexCount > 65535 ? 4 : 2;

    // Read triangle count
    const triangleCount = dataView.getUint32(position, true);
    position += 4;

    const indicesCount = triangleCount * 3;
    const triangleIndices =
        bytesPerIndex === 4
            ? new Uint32Array(dataView.buffer, position, indicesCount)
            : new Uint16Array(dataView.buffer, position, indicesCount);

    // High-watermark decoding
    let highest = 0;
    for (let i = 0; i < indicesCount; i++) {
        const code = triangleIndices[i];
        triangleIndices[i] = highest - code;
        if (code === 0) {
            highest++;
        }
    }

    position += indicesCount * bytesPerIndex;
    return {
        triangleIndices,
        triangleIndicesEndPosition: position
    };
}

/**
 * Decodes stratum layer information
 * @param dataView - Data view of the buffer
 * @param position - Starting position
 * @returns Layer data and end position
 */
function decodeStratumLayers(
    dataView: DataView,
    position: number
): { layers: StratumLayerData[]; layersEndPosition: number } {
    const layerCount = dataView.getInt32(position, true);
    position += Int32Array.BYTES_PER_ELEMENT;

    const layers: StratumLayerData[] = [];

    for (let i = 0; i < layerCount; i++) {
        const layer: StratumLayerData = {
            type: dataView.getInt8(position),
            id: "",
            voxels: []
        };
        position += Int8Array.BYTES_PER_ELEMENT;

        // Read layer ID
        const idLength = dataView.getUint32(position, true);
        position += Uint32Array.BYTES_PER_ELEMENT;
        const idChars = new Uint8Array(idLength);
        for (let j = 0; j < idLength; j++) {
            idChars[j] = dataView.getUint8(position + j);
        }
        layer.id = new TextDecoder().decode(idChars);
        position += idLength;

        // Read voxels
        const voxelCount = dataView.getInt32(position, true);
        position += Int32Array.BYTES_PER_ELEMENT;

        for (let j = 0; j < voxelCount; j++) {
            const idLength = dataView.getInt32(position, true);
            position += 4;

            const idBytes = new Uint8Array(
                dataView.buffer,
                dataView.byteOffset + position,
                idLength
            );
            const id = new TextDecoder().decode(idBytes);
            position += idLength;

            const index = dataView.getInt32(position, true);
            position += 4;

            const start = dataView.getInt32(position, true);
            position += 4;
            const end = dataView.getInt32(position, true);
            position += 4;

            const neighbor1 = dataView.getInt32(position, true);
            position += 4;
            const neighbor2 = dataView.getInt32(position, true);
            position += 4;
            const neighbor3 = dataView.getInt32(position, true);
            position += 4;

            const material = dataView.getInt32(position, true);
            position += 4;

            const voxel: StratumVoxelData = {
                id,
                index,
                start,
                end,
                neighbors: [neighbor1, neighbor2, neighbor3],
                material
            };
            layer.voxels.push(voxel);
        }
        layers.push(layer);
    }

    return { layers, layersEndPosition: position };
}

/**
 * Decodes face type information
 * @param dataView - Data view of the buffer
 * @param position - Starting position
 * @returns Face types and end position
 */
function decodeFaceTypes(
    dataView: DataView,
    position: number
): { faceTypes: Uint8Array; faceTypesEndPosition: number } {
    const faceTypeCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    const faceTypes = new Uint8Array(faceTypeCount);
    for (let i = 0; i < faceTypeCount; i++) {
        faceTypes[i] = dataView.getUint8(position + i);
    }
    position += faceTypeCount;

    return { faceTypes, faceTypesEndPosition: position };
}

/**
 * Main decoding function for stratum mesh data
 * @param data - Input ArrayBuffer containing mesh data
 * @param userOptions - Decoding options
 * @returns Decoded mesh data structure
 */
export function decode(data: ArrayBuffer, userOptions?: Partial<DecodeOptions>): DecodeResult {
    const options = { ...DEFAULT_OPTIONS, ...userOptions };
    const dataView = new DataView(data);

    // Progressive decoding based on requested steps
    const { header, headerEndPosition } = decodeHeader(dataView);
    if (options.maxDecodingStep < DECODING_STEPS.vertices) {
        return { header };
    }

    const { vertexData, vertexDataEndPosition } = decodeVertexData(dataView, headerEndPosition);
    if (options.maxDecodingStep < DECODING_STEPS.triangleIndices) {
        return { header, vertexData };
    }

    // Handle alignment
    const vertexCount = vertexData.u.length;
    const alignment = vertexCount > 65535 ? 4 : 2;
    let position = vertexDataEndPosition;
    const padding = position % alignment;
    if (padding > 0) {
        position += alignment - padding;
    }

    const { triangleIndices, triangleIndicesEndPosition } = decodeTriangleIndices(
        dataView,
        vertexCount,
        position
    );
    if (options.maxDecodingStep < DECODING_STEPS.edgeIndices) {
        return { header, vertexData, triangleIndices };
    }

    if (options.maxDecodingStep < DECODING_STEPS.extensions) {
        return { header, vertexData, triangleIndices };
    }

    const { layers, layersEndPosition } = decodeStratumLayers(dataView, triangleIndicesEndPosition);
    const { faceTypes, faceTypesEndPosition } = decodeFaceTypes(dataView, layersEndPosition);
    const { extensions } = decodeExtensions(dataView, faceTypesEndPosition);

    return {
        header,
        vertexData,
        layers,
        faceTypes,
        triangleIndices,
        extensions
    };
}
