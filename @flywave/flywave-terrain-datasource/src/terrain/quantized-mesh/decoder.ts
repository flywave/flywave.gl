import { DecoderOptions } from "@flywave/flywave-datasource-protocol";
import { defined } from "@flywave/flywave-utils";
import { MathUtils, Matrix4, Vector2, Vector3 } from "three";

import TerrainQuantization from "./quantization";

// Reusable vectors to avoid allocations
const cartesian3Scratch = new Vector3();
const cartesian3DimScratch = new Vector3();
const cartesian2Scratch = new Vector2();

export interface TerrainEncoding {
    quantization: TerrainQuantization;
    minimumHeight: number;
    maximumHeight: number;
    center: Vector3;
    toScaledENU: Matrix4;
    fromScaledENU: Matrix4;
    matrix: Matrix4;
    hasVertexNormals: boolean;
    hasWebMercatorT: boolean;
}

export function createTerrainEncoding(
    axisAlignedBoundingBox: { minimum: Vector3; maximum: Vector3; center: Vector3 } | undefined,
    minimumHeight: number | undefined,
    maximumHeight: number | undefined,
    fromENU: Matrix4 | undefined,
    hasVertexNormals: boolean,
    hasWebMercatorT = false
): TerrainEncoding {
    let quantization = TerrainQuantization.NONE;
    let center: Vector3 | undefined;
    let toENU: Matrix4 | undefined;
    let matrix: Matrix4 | undefined;

    if (
        defined(axisAlignedBoundingBox) &&
        defined(minimumHeight) &&
        defined(maximumHeight) &&
        defined(fromENU)
    ) {
        const { minimum, maximum } = axisAlignedBoundingBox;
        center = axisAlignedBoundingBox.center;

        const dimensions = cartesian3DimScratch.subVectors(maximum, minimum);
        const hDim = maximumHeight - minimumHeight;
        const maxDim = Math.max(Math.max(dimensions.x, dimensions.y, dimensions.z), hDim);

        // 量化判断逻辑
        quantization =
            maxDim < Math.pow(2.0, 12.0) - 1.0
                ? TerrainQuantization.BITS12
                : TerrainQuantization.NONE;

        // 使用Three.js的Matrix4方法
        toENU = new Matrix4().copy(fromENU).invert();

        // Transform and scale to [0,1] range
        const translation = cartesian3Scratch.copy(minimum).negate();
        toENU.premultiply(
            new Matrix4().makeTranslation(translation.x, translation.y, translation.z)
        );

        const scale = cartesian3Scratch.set(
            1.0 / dimensions.x,
            1.0 / dimensions.y,
            1.0 / dimensions.z
        );
        toENU.premultiply(new Matrix4().makeScale(scale.x, scale.y, scale.z));

        matrix = new Matrix4().copy(fromENU);
        matrix.setPosition(0, 0, 0);
    }

    return {
        quantization,
        minimumHeight: minimumHeight || 0,
        maximumHeight: maximumHeight || 0,
        center: center || new Vector3(),
        toScaledENU: toENU || new Matrix4(),
        fromScaledENU: fromENU || new Matrix4(),
        matrix: matrix || new Matrix4(),
        hasVertexNormals,
        hasWebMercatorT
    };
}

export interface Header {
    centerX: number;
    centerY: number;
    centerZ: number;
    minHeight: number;
    maxHeight: number;
    boundingSphereCenterX: number;
    boundingSphereCenterY: number;
    boundingSphereCenterZ: number;
    boundingSphereRadius: number;
    horizonOcclusionPointX: number;
    horizonOcclusionPointY: number;
    horizonOcclusionPointZ: number;
}

export interface DecodeResult {
    header: Header;
    encoding: TerrainEncoding;
    vertexData?: Uint16Array;
    decodedPositions?: Float32Array; // Added for decoded positions
    decodedTextureCoords?: Float32Array; // Added for texture coordinates
    decodedHeights?: Float32Array; // Added for heights
    decodedNormals?: Uint8Array; // Added for normals
    triangleIndices?: Uint16Array | Uint32Array;
    westIndices?: Uint16Array | Uint32Array;
    southIndices?: Uint16Array | Uint32Array;
    eastIndices?: Uint16Array | Uint32Array;
    northIndices?: Uint16Array | Uint32Array;
    extensions?: {
        vertexNormals?: Uint8Array;
        waterMask?: ArrayBuffer;
        metadata?: any;
    };
}

export interface QuantizedMeshDecoderOptions extends DecoderOptions {
    maxDecodingStep?: number;
    quantization?: TerrainQuantization; // 添加量化选项
    hasVertexNormals?: boolean;
    hasWebMercatorT?: boolean;
}

const QUANTIZED_MESH_HEADER = new Map([
    ["centerX", Float64Array.BYTES_PER_ELEMENT],
    ["centerY", Float64Array.BYTES_PER_ELEMENT],
    ["centerZ", Float64Array.BYTES_PER_ELEMENT],

    ["minHeight", Float32Array.BYTES_PER_ELEMENT],
    ["maxHeight", Float32Array.BYTES_PER_ELEMENT],

    ["boundingSphereCenterX", Float64Array.BYTES_PER_ELEMENT],
    ["boundingSphereCenterY", Float64Array.BYTES_PER_ELEMENT],
    ["boundingSphereCenterZ", Float64Array.BYTES_PER_ELEMENT],
    ["boundingSphereRadius", Float64Array.BYTES_PER_ELEMENT],

    ["horizonOcclusionPointX", Float64Array.BYTES_PER_ELEMENT],
    ["horizonOcclusionPointY", Float64Array.BYTES_PER_ELEMENT],
    ["horizonOcclusionPointZ", Float64Array.BYTES_PER_ELEMENT]
]);

function decodeZigZag(value: number): number {
    return (value >> 1) ^ -(value & 1);
}

// 替换octDecode函数
export function octDecode(x: number, y: number, result: Vector3): Vector3 {
    result.set((x / 255) * 2 - 1, (y / 255) * 2 - 1, 0);
    const d = 1 - (Math.abs(result.x) + Math.abs(result.y));
    result.z = d > 0 ? d : 0;
    return result.normalize();
}

// 替换octEncode函数
export function octEncode(normal: Vector3, result: Vector2 | Vector3): Vector2 | Vector3 {
    // 归一化输入向量
    normal = normal.clone().normalize();

    // 计算L1范数
    const l1Norm = Math.abs(normal.x) + Math.abs(normal.y) + Math.abs(normal.z);

    // 八面体映射
    if (l1Norm > 0) {
        normal.divideScalar(l1Norm);
    }

    // 如果z为负，需要镜像映射
    if (normal.z < 0) {
        const x = normal.x;
        const y = normal.y;
        normal.set((1 - Math.abs(y)) * (x >= 0 ? 1 : -1), (1 - Math.abs(x)) * (y >= 0 ? 1 : -1), 0);
    }

    if ((result as any).isVector2) {
        (result as Vector2).set(
            Math.round((normal.x * 0.5 + 0.5) * 255),
            Math.round((normal.y * 0.5 + 0.5) * 255)
        );
    } else {
        (result as Vector3).set(
            Math.round((normal.x * 0.5 + 0.5) * 255),
            Math.round((normal.y * 0.5 + 0.5) * 255),
            0
        );
    }

    // 映射到[0,255]范围

    return result;
}

// 替换octEncodeFloat函数
export function octEncodeFloat(normal: Vector3): number {
    const temp = new Vector2();
    octEncode(normal, temp);
    return temp.x * 256 + temp.y;
}

function decodeHeader(dataView: DataView): { header: Header; headerEndPosition: number } {
    let position = 0;
    const header = {} as Header;

    for (const [key, bytesCount] of QUANTIZED_MESH_HEADER) {
        const getter = bytesCount === 8 ? dataView.getFloat64 : dataView.getFloat32;
        header[key as keyof Header] = getter.call(dataView, position, true);
        position += bytesCount;
    }

    return { header, headerEndPosition: position };
}

function decodeVertexData(
    dataView: DataView,
    headerEndPosition: number,
    quantization = TerrainQuantization.NONE
): { vertexData: Uint16Array; vertexDataEndPosition: number } {
    let position = headerEndPosition;
    const elementsPerVertex = 3;
    const vertexCount = dataView.getUint32(position, true);
    const vertexData = new Uint16Array(vertexCount * elementsPerVertex);

    position += Uint32Array.BYTES_PER_ELEMENT;

    if (quantization === TerrainQuantization.BITS12) {
        // 12位量化处理逻辑
        const bytesPerElement = 2; // 每个分量2字节
        const totalBytes = vertexCount * elementsPerVertex * bytesPerElement;

        // 读取压缩数据
        const compressedData = new Uint16Array(dataView.buffer, position, vertexCount * 3);
        position += totalBytes;

        // 解压缩12位数据
        for (let i = 0; i < vertexCount; i++) {
            // 解压u分量 (12位)
            const uCompressed = compressedData[i * 3];
            const u = uCompressed & 0xfff; // 取低12位

            // 解压v分量 (12位)
            const vCompressed = compressedData[i * 3 + 1];
            const v = vCompressed & 0xfff; // 取低12位

            // 解压高度分量 (12位)
            const hCompressed = compressedData[i * 3 + 2];
            const height = hCompressed & 0xfff; // 取低12位

            vertexData[i] = u;
            vertexData[i + vertexCount] = v;
            vertexData[i + vertexCount * 2] = height;
        }
    } else {
        // 原有非量化处理逻辑
        const bytesPerArrayElement = Uint16Array.BYTES_PER_ELEMENT;
        const elementArrayLength = vertexCount * bytesPerArrayElement;
        const uArrayStartPosition = position;
        const vArrayStartPosition = uArrayStartPosition + elementArrayLength;
        const heightArrayStartPosition = vArrayStartPosition + elementArrayLength;

        let u = 0;
        let v = 0;
        let height = 0;

        for (let i = 0; i < vertexCount; i++) {
            u += decodeZigZag(
                dataView.getUint16(uArrayStartPosition + bytesPerArrayElement * i, true)
            );
            v += decodeZigZag(
                dataView.getUint16(vArrayStartPosition + bytesPerArrayElement * i, true)
            );
            height += decodeZigZag(
                dataView.getUint16(heightArrayStartPosition + bytesPerArrayElement * i, true)
            );

            vertexData[i] = u;
            vertexData[i + vertexCount] = v;
            vertexData[i + vertexCount * 2] = height;
        }

        position += elementArrayLength * 3;
    }

    return { vertexData, vertexDataEndPosition: position };
}

function decodeIndex(
    buffer: ArrayBuffer,
    position: number,
    indicesCount: number,
    bytesPerIndex: number,
    encoded = true
): Uint16Array | Uint32Array {
    let indices: Uint16Array | Uint32Array;

    if (bytesPerIndex === 2) {
        indices = new Uint16Array(buffer, position, indicesCount);
    } else {
        indices = new Uint32Array(buffer, position, indicesCount);
    }

    if (!encoded) {
        return indices;
    }

    let highest = 0;

    for (let i = 0; i < indices.length; ++i) {
        const code = indices[i];

        indices[i] = highest - code;

        if (code === 0) {
            ++highest;
        }
    }

    return indices;
}

function decodeTriangleIndices(
    dataView: DataView,
    vertexData: Uint16Array,
    vertexDataEndPosition: number
): { triangleIndices: Uint16Array | Uint32Array; triangleIndicesEndPosition: number } {
    let position = vertexDataEndPosition;
    const elementsPerVertex = 3;
    const vertexCount = vertexData.length / elementsPerVertex;
    const bytesPerIndex =
        vertexCount > 65536 ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT;

    if (position % bytesPerIndex !== 0) {
        position += bytesPerIndex - (position % bytesPerIndex);
    }

    const triangleCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    const triangleIndicesCount = triangleCount * 3;
    const triangleIndices = decodeIndex(
        dataView.buffer,
        position,
        triangleIndicesCount,
        bytesPerIndex
    );
    position += triangleIndicesCount * bytesPerIndex;

    return {
        triangleIndicesEndPosition: position,
        triangleIndices
    };
}

function decodeEdgeIndices(
    dataView: DataView,
    vertexData: Uint16Array,
    triangleIndicesEndPosition: number
): {
    westIndices: Uint16Array | Uint32Array;
    southIndices: Uint16Array | Uint32Array;
    eastIndices: Uint16Array | Uint32Array;
    northIndices: Uint16Array | Uint32Array;
    edgeIndicesEndPosition: number;
} {
    let position = triangleIndicesEndPosition;
    const elementsPerVertex = 3;
    const vertexCount = vertexData.length / elementsPerVertex;
    const bytesPerIndex =
        vertexCount > 65536 ? Uint32Array.BYTES_PER_ELEMENT : Uint16Array.BYTES_PER_ELEMENT;

    const westVertexCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    const westIndices = decodeIndex(
        dataView.buffer,
        position,
        westVertexCount,
        bytesPerIndex,
        false
    );
    position += westVertexCount * bytesPerIndex;

    const southVertexCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    const southIndices = decodeIndex(
        dataView.buffer,
        position,
        southVertexCount,
        bytesPerIndex,
        false
    );
    position += southVertexCount * bytesPerIndex;

    const eastVertexCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    const eastIndices = decodeIndex(
        dataView.buffer,
        position,
        eastVertexCount,
        bytesPerIndex,
        false
    );
    position += eastVertexCount * bytesPerIndex;

    const northVertexCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    const northIndices = decodeIndex(
        dataView.buffer,
        position,
        northVertexCount,
        bytesPerIndex,
        false
    );
    position += northVertexCount * bytesPerIndex;

    return {
        edgeIndicesEndPosition: position,
        westIndices,
        southIndices,
        eastIndices,
        northIndices
    };
}

function decodeVertexNormalsExtension(extensionDataView: DataView): Uint8Array {
    return new Uint8Array(
        extensionDataView.buffer,
        extensionDataView.byteOffset,
        extensionDataView.byteLength
    );
}

function decodeWaterMaskExtension(extensionDataView: DataView): ArrayBuffer {
    return extensionDataView.buffer.slice(
        extensionDataView.byteOffset,
        extensionDataView.byteOffset + extensionDataView.byteLength
    );
}

function decodeMetadataExtension(extensionDataView: DataView): any {
    const jsonLength = extensionDataView.getUint32(0, true);

    let jsonString = "";
    for (let i = 0; i < jsonLength; ++i) {
        jsonString += String.fromCharCode(
            extensionDataView.getUint8(Uint32Array.BYTES_PER_ELEMENT + i)
        );
    }

    return JSON.parse(jsonString);
}

// Helper function to replace AttributeCompression.decompressTextureCoordinates
export function decompressTextureCoordinates(compressed: number, result: Vector2): Vector2 {
    const temp = compressed / 4096.0;
    const xZeroTo4095 = Math.floor(temp);
    result.x = xZeroTo4095 / 4095.0;
    result.y = (compressed - xZeroTo4095 * 4096) / 4095;
    return result;
}

// Helper functions for decoding
export function decodePosition(
    buffer: Uint16Array | Float32Array,
    index: number,
    encoding: TerrainEncoding,
    result?: Vector3
): Vector3 {
    if (!defined(result)) {
        result = new Vector3();
    }

    index *= getStride(encoding);

    if (encoding.quantization === TerrainQuantization.BITS12) {
        const xy = decompressTextureCoordinates(buffer[index], cartesian2Scratch);
        result.x = xy.x;
        result.y = xy.y;

        const zh = decompressTextureCoordinates(buffer[index + 1], cartesian2Scratch);
        result.z = zh.x;

        return result.applyMatrix4(encoding.fromScaledENU);
    }

    result.set(buffer[index], buffer[index + 1], buffer[index + 2]);
    return result.add(encoding.center);
}

export function decodeTextureCoordinates(
    buffer: Uint16Array | Float32Array,
    index: number,
    encoding: TerrainEncoding,
    result?: Vector2
): Vector2 {
    if (!defined(result)) {
        result = new Vector2();
    }

    index *= 4;

    if (encoding.quantization === TerrainQuantization.BITS12) {
        return decompressTextureCoordinates(buffer[index + 2], result);
    }

    return result.fromArray([buffer[index], buffer[index + 1]]);
}

export function decodeHeight(
    buffer: Uint16Array | Float32Array,
    index: number,
    encoding: TerrainEncoding
): number {
    index *= 3;

    if (encoding.quantization === TerrainQuantization.BITS12) {
        const zh = decompressTextureCoordinates(buffer[index + 1], cartesian2Scratch);
        return zh.y * (encoding.maximumHeight - encoding.minimumHeight) + encoding.minimumHeight;
    }

    return buffer[index + 3];
}

export function getOctEncodedNormal(
    buffer:
        | Uint8Array<ArrayBufferLike>
        | Uint16Array<ArrayBufferLike>
        | Float32Array<ArrayBufferLike>,
    index: number,
    encoding: TerrainEncoding,
    result?: Vector2 | Vector3
): Vector2 | Vector3 {
    if (!defined(result)) {
        result = new Vector2();
    }

    const stride = getStride(encoding);
    index = (index + 1) * stride - 1;

    const temp = buffer[index + 3] / 256.0;
    const x = Math.floor(temp);
    const y = (temp - x) * 256.0;

    return result.fromArray([x, y]);
}

export function getStride(encoding: TerrainEncoding): number {
    let vertexStride;

    switch (encoding.quantization) {
        case TerrainQuantization.BITS12:
            vertexStride = 3;
            break;
        default:
            vertexStride = 6;
    }

    if (encoding.hasWebMercatorT) {
        ++vertexStride;
    }

    if (encoding.hasVertexNormals) {
        ++vertexStride;
    }

    return vertexStride;
}

export interface Extensions {
    vertexNormals?: Uint8Array;
    waterMask?: ArrayBuffer;
    metadata?: any;
    [key: string]: any; // 其他可能的扩展
}

function decodeExtensions(
    dataView: DataView,
    indicesEndPosition: number
): { extensions: Record<string, any>; extensionsEndPosition: number } {
    const extensions: Extensions = {};

    if (dataView.byteLength <= indicesEndPosition) {
        return { extensions, extensionsEndPosition: indicesEndPosition };
    }

    let position = indicesEndPosition;

    while (position < dataView.byteLength) {
        const extensionId = dataView.getUint8(position);
        position += Uint8Array.BYTES_PER_ELEMENT;

        const extensionLength = dataView.getUint32(position, true);
        position += Uint32Array.BYTES_PER_ELEMENT;

        const extensionView = new DataView(dataView.buffer, position, extensionLength);

        switch (extensionId) {
            case 1: {
                extensions.vertexNormals = decodeVertexNormalsExtension(extensionView);

                break;
            }
            case 2: {
                extensions.waterMask = decodeWaterMaskExtension(extensionView);

                break;
            }
            case 4: {
                extensions.metadata = decodeMetadataExtension(extensionView);

                break;
            }
            default: {
            }
        }

        position += extensionLength;
    }

    return { extensions, extensionsEndPosition: position };
}

/**
 * 编码地形数据到顶点缓冲区
 * @param encoding 地形编码配置
 * @param vertexBuffer 顶点缓冲区
 * @param bufferIndex 缓冲区起始索引
 * @param position 位置坐标
 * @param uv 纹理坐标
 * @param height 高度值
 * @param normalToPack 法线向量
 * @param webMercatorT Web Mercator坐标(可选)
 * @returns 更新后的缓冲区索引
 */
export function encodeTerrainData(
    encoding: TerrainEncoding,
    vertexBuffer: Float32Array | Uint16Array,
    bufferIndex: number,
    position: Vector3,
    uv: Vector2,
    height: number,
    normalToPack: Vector3,
    webMercatorT?: number
): number {
    const u = uv.x;
    const v = uv.y;

    if (encoding.quantization === TerrainQuantization.BITS12) {
        // 转换到ENU坐标系并归一化到[0,1]范围
        position = position.clone().applyMatrix4(encoding.toScaledENU);
        position.x = MathUtils.clamp(position.x, 0.0, 1.0);
        position.y = MathUtils.clamp(position.y, 0.0, 1.0);
        position.z = MathUtils.clamp(position.z, 0.0, 1.0);

        // 归一化高度值
        const hDim = encoding.maximumHeight - encoding.minimumHeight;
        const h = MathUtils.clamp((height - encoding.minimumHeight) / hDim, 0.0, 1.0);

        // 压缩坐标数据
        vertexBuffer[bufferIndex++] = compressTextureCoordinates(
            new Vector2(position.x, position.y)
        );
        vertexBuffer[bufferIndex++] = compressTextureCoordinates(new Vector2(position.z, h));
        vertexBuffer[bufferIndex++] = compressTextureCoordinates(new Vector2(u, v));

        if (encoding.hasWebMercatorT && webMercatorT !== undefined) {
            vertexBuffer[bufferIndex++] = compressTextureCoordinates(
                new Vector2(webMercatorT, 0.0)
            );
        }
    } else {
        // 非量化模式直接存储原始数据
        const relativePos = position.clone().sub(encoding.center);

        vertexBuffer[bufferIndex++] = relativePos.x;
        vertexBuffer[bufferIndex++] = relativePos.y;
        vertexBuffer[bufferIndex++] = relativePos.z;
        vertexBuffer[bufferIndex++] = height;
        vertexBuffer[bufferIndex++] = u;
        vertexBuffer[bufferIndex++] = v;

        if (encoding.hasWebMercatorT && webMercatorT !== undefined) {
            vertexBuffer[bufferIndex++] = webMercatorT;
        }
    }

    // 编码法线数据
    if (encoding.hasVertexNormals) {
        vertexBuffer[bufferIndex++] = octEncodeFloat(normalToPack);
    }

    return bufferIndex;
}

/**
 * 压缩纹理坐标到16位整数
 * @param texCoord 纹理坐标
 * @returns 压缩后的16位整数
 */
function compressTextureCoordinates(texCoord: Vector2): number {
    const x = Math.round(texCoord.x * 4095); // 12位精度
    const y = Math.round(texCoord.y * 4095); // 12位精度
    return (x << 12) | y; // 高12位存储x，低12位存储y
}

export const DECODING_STEPS = {
    header: 0,
    vertices: 1,
    triangleIndices: 2,
    edgeIndices: 3,
    extensions: 4
};

const DEFAULT_OPTIONS: QuantizedMeshDecoderOptions = {
    maxDecodingStep: DECODING_STEPS.extensions,
    quantization: TerrainQuantization.NONE
};

export default function decode(
    data: ArrayBufferLike,
    userOptions?: QuantizedMeshDecoderOptions
): DecodeResult {
    const options = Object.assign({}, DEFAULT_OPTIONS, userOptions);
    const view = new DataView(data);
    const { header, headerEndPosition } = decodeHeader(view);

    // Create terrain encoding from header information
    const aabb = {
        minimum: new Vector3(header.centerX - 1, header.centerY - 1, header.minHeight),
        maximum: new Vector3(header.centerX + 1, header.centerY + 1, header.maxHeight),
        center: new Vector3(
            header.centerX,
            header.centerY,
            (header.minHeight + header.maxHeight) / 2
        )
    };

    const encoding = createTerrainEncoding(
        aabb,
        header.minHeight,
        header.maxHeight,
        new Matrix4(), // Assuming ENU is identity for this case
        options.hasVertexNormals || false,
        options.hasWebMercatorT || false
    );

    if (options.maxDecodingStep < DECODING_STEPS.vertices) {
        return { header, encoding };
    }

    const { vertexData, vertexDataEndPosition } = decodeVertexData(
        view,
        headerEndPosition,
        options.quantization
    );

    // Decode all positions, texture coordinates, heights, and normals
    const vertexCount =
        vertexData.length / (encoding.quantization === TerrainQuantization.BITS12 ? 3 : 6);
    const decodedPositions = new Float32Array(vertexCount * 3);
    const decodedTextureCoords = new Float32Array(vertexCount * 2);
    const decodedHeights = new Float32Array(vertexCount);
    const decodedNormals = encoding.hasVertexNormals ? new Uint8Array(vertexCount * 2) : undefined;

    for (let i = 0; i < vertexCount; i++) {
        // Decode position
        const position = decodePosition(vertexData, i, encoding);
        decodedPositions[i * 3] = position.x;
        decodedPositions[i * 3 + 1] = position.y;
        decodedPositions[i * 3 + 2] = position.z;

        // Decode texture coordinates
        const texCoord = decodeTextureCoordinates(vertexData, i, encoding);
        decodedTextureCoords[i * 2] = texCoord.x;
        decodedTextureCoords[i * 2 + 1] = texCoord.y;

        // Decode height
        decodedHeights[i] = decodeHeight(vertexData, i, encoding);

        // Decode normals if available
        if (decodedNormals && encoding.hasVertexNormals) {
            const normal = getOctEncodedNormal(vertexData, i, encoding);
            decodedNormals[i * 2] = normal.x;
            decodedNormals[i * 2 + 1] = normal.y;
        }
    }

    if (options.maxDecodingStep < DECODING_STEPS.triangleIndices) {
        return { header, encoding, vertexData };
    }

    const { triangleIndices, triangleIndicesEndPosition } = decodeTriangleIndices(
        view,
        vertexData,
        vertexDataEndPosition
    );

    if (options.maxDecodingStep < DECODING_STEPS.edgeIndices) {
        return {
            header,
            encoding,
            vertexData,
            decodedPositions,
            decodedTextureCoords,
            decodedHeights,
            decodedNormals
        };
    }

    const { westIndices, southIndices, eastIndices, northIndices, edgeIndicesEndPosition } =
        decodeEdgeIndices(view, vertexData, triangleIndicesEndPosition);

    if (options.maxDecodingStep < DECODING_STEPS.extensions) {
        return {
            header,
            encoding,
            vertexData,
            decodedPositions,
            decodedTextureCoords,
            decodedHeights,
            decodedNormals,
            triangleIndices,
            westIndices,
            northIndices,
            eastIndices,
            southIndices
        };
    }

    const { extensions } = decodeExtensions(view, edgeIndicesEndPosition);

    return {
        header,
        encoding,
        vertexData,
        decodedPositions,
        decodedTextureCoords,
        decodedHeights,
        decodedNormals,
        triangleIndices,
        westIndices,
        northIndices,
        eastIndices,
        southIndices,
        extensions
    };
}
