/* Copyright (C) 2025 flywave.gl contributors */

export function zigZagDecode(value: number): number {
    return (value >> 1) ^ -(value & 1);
}

// 类型定义
interface QuantizedMeshHeader {
    center: [number, number, number];
    minHeight: number;
    maxHeight: number;
    sphereCenter: [number, number, number];
    sphereRadius: number;
    horizonOcclusionPoint: [number, number, number];
}

interface VertexData {
    u: Float32Array;
    v: Float32Array;
    height: Float32Array;
}

interface EdgeIndices {
    westIndices: Uint16Array | Uint32Array;
    southIndices: Uint16Array | Uint32Array;
    eastIndices: Uint16Array | Uint32Array;
    northIndices: Uint16Array | Uint32Array;
}

interface OctVertexNormalsExtension {
    extensionId: number;
    normals: Float32Array;
}

interface WaterMaskExtension {
    extensionId: number;
    mask: Uint8Array;
    size: number;
}

interface MetadataExtension {
    extensionId: number;
    json: Record<string, unknown>;
}

type QuantizedMeshExtension = OctVertexNormalsExtension | WaterMaskExtension | MetadataExtension;

export interface QuantizedMeshData {
    header: QuantizedMeshHeader;
    indices: Uint16Array | Uint32Array;
    vertexData: VertexData;
    edgeIndices: EdgeIndices;
    extensions: Record<string, QuantizedMeshExtension>;
}

export class QuantizedMeshLoaderBase {
    protected decode(buffer: ArrayBuffer): QuantizedMeshData {
        let pointer = 0;
        const view = new DataView(buffer);

        const readFloat64 = (): number => {
            const result = view.getFloat64(pointer, true);
            pointer += 8;
            return result;
        };

        const readFloat32 = (): number => {
            const result = view.getFloat32(pointer, true);
            pointer += 4;
            return result;
        };

        const readInt = (): number => {
            const result = view.getUint32(pointer, true);
            pointer += 4;
            return result;
        };

        const readByte = (): number => {
            const result = view.getUint8(pointer);
            pointer += 1;
            return result;
        };

        const readBuffer = <T extends ArrayBufferView>(
            count: number,
            type: new (buffer: ArrayBuffer, byteOffset: number, length: number) => T
        ): T => {
            const result = new type(buffer, pointer, count);
            pointer +=
                count * (result as unknown as { BYTES_PER_ELEMENT: number }).BYTES_PER_ELEMENT;
            return result;
        };

        // extract header
        const header: QuantizedMeshHeader = {
            center: [readFloat64(), readFloat64(), readFloat64()],
            minHeight: readFloat32(),
            maxHeight: readFloat32(),
            sphereCenter: [readFloat64(), readFloat64(), readFloat64()],
            sphereRadius: readFloat64(),
            horizonOcclusionPoint: [readFloat64(), readFloat64(), readFloat64()]
        };

        // extract vertex data
        const vertexCount = readInt();
        const uBuffer = readBuffer<Uint16Array>(vertexCount, Uint16Array);
        const vBuffer = readBuffer<Uint16Array>(vertexCount, Uint16Array);
        const hBuffer = readBuffer<Uint16Array>(vertexCount, Uint16Array);

        const uResult = new Float32Array(vertexCount);
        const vResult = new Float32Array(vertexCount);
        const hResult = new Float32Array(vertexCount);

        // decode vertex data
        let u = 0;
        let v = 0;
        let h = 0;
        const MAX_VALUE = 32767;
        for (let i = 0; i < vertexCount; ++i) {
            u += zigZagDecode(uBuffer[i]);
            v += zigZagDecode(vBuffer[i]);
            h += zigZagDecode(hBuffer[i]);

            uResult[i] = u / MAX_VALUE;
            vResult[i] = v / MAX_VALUE;
            hResult[i] = h / MAX_VALUE;
        }

        // align pointer for index data
        const is32 = vertexCount > 65536;
        const bufferType = is32 ? Uint32Array : Uint16Array;
        if (is32) {
            pointer = Math.ceil(pointer / 4) * 4;
        } else {
            pointer = Math.ceil(pointer / 2) * 2;
        }

        // extract index data
        const triangleCount = readInt();
        const indices = readBuffer<Uint16Array | Uint32Array>(triangleCount * 3, bufferType);

        // decode the index data
        let highest = 0;
        for (let i = 0; i < indices.length; ++i) {
            const code = indices[i];
            indices[i] = highest - code;
            if (code === 0) {
                ++highest;
            }
        }

        // sort functions for the edges since they are not pre-sorted
        const vSort = (a: number, b: number): number => vResult[b] - vResult[a];
        const vSortReverse = (a: number, b: number): number => -vSort(a, b);

        const uSort = (a: number, b: number): number => uResult[a] - uResult[b];
        const uSortReverse = (a: number, b: number): number => -uSort(a, b);

        // get edge indices
        const westVertexCount = readInt();
        const westIndices = readBuffer<InstanceType<typeof bufferType>>(
            westVertexCount,
            bufferType
        );
        westIndices.sort(vSort);

        const southVertexCount = readInt();
        const southIndices = readBuffer<InstanceType<typeof bufferType>>(
            southVertexCount,
            bufferType
        );
        southIndices.sort(uSort);

        const eastVertexCount = readInt();
        const eastIndices = readBuffer<InstanceType<typeof bufferType>>(
            eastVertexCount,
            bufferType
        );
        eastIndices.sort(vSortReverse);

        const northVertexCount = readInt();
        const northIndices = readBuffer<InstanceType<typeof bufferType>>(
            northVertexCount,
            bufferType
        );
        northIndices.sort(uSortReverse);

        const edgeIndices: EdgeIndices = {
            westIndices,
            southIndices,
            eastIndices,
            northIndices
        };

        // parse extensions
        const extensions: Record<string, QuantizedMeshExtension> = {};
        while (pointer < view.byteLength) {
            const extensionId = readByte();
            const extensionLength = readInt();

            if (extensionId === 1) {
                // oct encoded normals
                const xy = readBuffer<Uint8Array>(vertexCount * 2, Uint8Array);
                const normals = new Float32Array(vertexCount * 3);

                // https://github.com/CesiumGS/cesium/blob/baaabaa49058067c855ad050be73a9cdfe9b6ac7/packages/engine/Source/Core/AttributeCompression.js#L119-L140
                for (let i = 0; i < vertexCount; i++) {
                    let x = (xy[2 * i + 0] / 255) * 2 - 1;
                    let y = (xy[2 * i + 1] / 255) * 2 - 1;
                    const z = 1.0 - (Math.abs(x) + Math.abs(y));

                    if (z < 0.0) {
                        const oldVX = x;
                        x = (1.0 - Math.abs(y)) * signNotZero(oldVX);
                        y = (1.0 - Math.abs(oldVX)) * signNotZero(y);
                    }

                    const len = Math.sqrt(x * x + y * y + z * z);
                    normals[3 * i + 0] = x / len;
                    normals[3 * i + 1] = y / len;
                    normals[3 * i + 2] = z / len;
                }

                extensions["octvertexnormals"] = {
                    extensionId,
                    normals
                } as OctVertexNormalsExtension;
            } else if (extensionId === 2) {
                // water mask
                const size = extensionLength === 1 ? 1 : 256;
                const mask = readBuffer<Uint8Array>(size * size, Uint8Array);
                extensions["watermask"] = {
                    extensionId,
                    mask,
                    size
                } as WaterMaskExtension;
            } else if (extensionId === 4) {
                // metadata
                const jsonLength = readInt();
                const jsonBuffer = readBuffer<Uint8Array>(jsonLength, Uint8Array);
                const json = new TextDecoder().decode(jsonBuffer);
                extensions["metadata"] = {
                    extensionId,
                    json: JSON.parse(json)
                } as MetadataExtension;
            }
        }

        return {
            header,
            indices,
            vertexData: {
                u: uResult,
                v: vResult,
                height: hResult
            },
            edgeIndices,
            extensions
        };
    }
}

function signNotZero(v: number): number {
    return v < 0.0 ? -1.0 : 1.0;
}
