import { decodeExtensions } from "./Extensions";
import {
    DecodeHeaderResult,
    DecodeOptions,
    DecodeResult,
    DecodeTriangleIndicesResult,
    DecodeVertexDataResult,
    Header,
    StratumLayer,
    StratumVoxel
} from "./Types";

const STRATUM_MESH_HEADER_SIZE = 88;

function decodeZigZag(value: number): number {
    return (value >> 1) ^ -(value & 1);
}
function signNotZero(v: number): number {
    return v < 0.0 ? -1.0 : 1.0;
}

function fromSnorm(v: number): number {
    return (clamp(v, 0.0, 255.0) / 255.0) * 2.0 - 1.0;
}

function clamp(val: number, minVal: number, maxVal: number): number {
    return Math.min(Math.max(val, minVal), maxVal);
}

function octDecode(x: number, y: number): [number, number, number] {
    // 将输入的8位整数转换为归一化浮点数（范围[-1,1]）
    let fx = fromSnorm(x);
    let fy = fromSnorm(y);

    // 计算初始z分量（1 - |x| - |y|）
    const fz = 1.0 - (Math.abs(fx) + Math.abs(fy));

    // 如果z为负，说明在负半球，需调整x,y
    if (fz < 0.0) {
        const oldX = fx;
        fx = (1.0 - Math.abs(fy)) * signNotZero(oldX);
        fy = (1.0 - Math.abs(oldX)) * signNotZero(fy);
    }

    // 构造向量并归一化
    const vec = [fx, fy, fz];
    const length = Math.sqrt(vec[0] * vec[0] + vec[1] * vec[1] + vec[2] * vec[2]);

    if (length === 0) {
        return [0, 0, 0];
    }

    return [vec[0] / length, vec[1] / length, vec[2] / length];
}

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

function decodeVertexData(dataView: DataView, headerEndPosition: number): DecodeVertexDataResult {
    let position = headerEndPosition;
    const vertexCount = dataView.getUint32(position, true);
    position += 4;

    const readCoordData = (): Uint16Array => {
        const data = new Uint16Array(vertexCount);
        for (let i = 0; i < vertexCount; i++) {
            data[i] = dataView.getUint16(position, true);
            position += 2;
        }
        return data;
    };

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

// 优化的12位解包函数
function unpack12BitData(dataView: DataView, start: number, count: number): Uint16Array {
    const result = new Uint16Array(count);
    let byteIndex = start;
    let resultIndex = 0;

    // 成对处理值（每3字节包含2个12位值）
    const pairs = Math.floor(count / 2);
    for (let i = 0; i < pairs; i++) {
        const byte1 = dataView.getUint8(byteIndex++);
        const byte2 = dataView.getUint8(byteIndex++);
        const byte3 = dataView.getUint8(byteIndex++);

        // 第一个值：前两个字节的高12位
        result[resultIndex++] = (byte1 << 4) | (byte2 >> 4);
        // 第二个值：后两个字节的低12位
        result[resultIndex++] = ((byte2 & 0x0f) << 8) | byte3;
    }

    // 处理最后一个值（当count为奇数时）
    if (count % 2 !== 0) {
        const byte1 = dataView.getUint8(byteIndex++);
        const byte2 = dataView.getUint8(byteIndex++);
        result[resultIndex] = (byte1 << 4) | (byte2 >> 4);
    }

    return result;
}

function decodeTriangleIndices(
    dataView: DataView,
    vertexCount: number,
    vertexDataEndPosition: number
): DecodeTriangleIndicesResult {
    let position = vertexDataEndPosition;
    const bytesPerIndex = vertexCount > 65535 ? 4 : 2;

    const triangleCount = dataView.getUint32(position, true);
    position += 4;

    const indicesCount = triangleCount * 3;
    const triangleIndices =
        bytesPerIndex === 4
            ? new Uint32Array(dataView.buffer, position, indicesCount)
            : new Uint16Array(dataView.buffer, position, indicesCount);

    // 解码索引
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

function decodeStratumLayers(
    dataView: DataView,
    position: number
): { layers: StratumLayer[]; layersEndPosition: number } {
    // 读取地层组数量
    const layerCount = dataView.getInt32(position, true);
    position += Int32Array.BYTES_PER_ELEMENT;

    const layers: StratumLayer[] = [];

    for (let i = 0; i < layerCount; i++) {
        const layer: StratumLayer = {
            type: dataView.getInt8(position),
            id: "",
            voxels: []
        };
        position += Int8Array.BYTES_PER_ELEMENT;

        // 读取ID字符串
        const idLength = dataView.getUint32(position, true);
        position += Uint32Array.BYTES_PER_ELEMENT;
        const idChars = new Uint8Array(idLength);
        for (let j = 0; j < idLength; j++) {
            idChars[j] = dataView.getUint8(position + j);
        }
        layer.id = new TextDecoder().decode(idChars);
        position += idLength;

        // 读取体素数量
        const voxelCount = dataView.getInt32(position, true);
        position += Int32Array.BYTES_PER_ELEMENT;

        // 读取每个体素数据
        for (let j = 0; j < voxelCount; j++) {
            // 读取体素ID长度
            const idLength = dataView.getInt32(position, true);
            position += 4;

            // 读取体素索引
            const index = dataView.getInt32(position, true);
            position += 4;

            // 读取体素ID字符串
            const idBytes = new Uint8Array(
                dataView.buffer,
                dataView.byteOffset + position,
                idLength
            );
            const id = new TextDecoder().decode(idBytes);
            position += idLength;

            // 读取体素数据
            const start = dataView.getInt32(position, true);
            position += 4;
            const end = dataView.getInt32(position, true);
            position += 4;

            // 读取neighbors数据
            const neighbor1 = dataView.getInt32(position, true);
            position += 4;
            const neighbor2 = dataView.getInt32(position, true);
            position += 4;
            const neighbor3 = dataView.getInt32(position, true);
            position += 4;

            const material = dataView.getInt32(position, true);
            position += 4;

            const voxel: StratumVoxel = {
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

function decodeFaceTypes(
    dataView: DataView,
    position: number
): { faceTypes: Uint8Array; faceTypesEndPosition: number } {
    // 读取面类型数量
    const faceTypeCount = dataView.getUint32(position, true);
    position += Uint32Array.BYTES_PER_ELEMENT;

    // 读取面类型数据
    const faceTypes = new Uint8Array(faceTypeCount);
    for (let i = 0; i < faceTypeCount; i++) {
        faceTypes[i] = dataView.getUint8(position + i);
    }
    position += faceTypeCount;

    return { faceTypes, faceTypesEndPosition: position };
}

export const DECODING_STEPS: any = {
    header: 0,
    vertices: 1,
    triangleIndices: 2,
    edgeIndices: 3,
    extensions: 4
};

const DEFAULT_OPTIONS = {
    maxDecodingStep: DECODING_STEPS.extensions
};

export default function decode(
    data: ArrayBuffer,
    userOptions?: Partial<DecodeOptions>
): DecodeResult {
    const options = { ...DEFAULT_OPTIONS, ...userOptions };
    const dataView = new DataView(data);

    const { header, headerEndPosition } = decodeHeader(dataView);
    if (options.maxDecodingStep < DECODING_STEPS.vertices) {
        return { header };
    }

    const { vertexData, vertexDataEndPosition } = decodeVertexData(dataView, headerEndPosition);
    if (options.maxDecodingStep < DECODING_STEPS.triangleIndices) {
        return { header, vertexData };
    }

    // 3. 处理对齐填充
    const vertexCount = vertexData.u.length;
    const alignment = vertexCount > 65535 ? 4 : 2;
    let position = vertexDataEndPosition;
    const padding = position % alignment;
    if (padding > 0) {
        position += alignment - padding;
    }

    // 4. 读取三角形索引
    const { triangleIndices, triangleIndicesEndPosition } = decodeTriangleIndices(
        dataView,
        vertexCount,
        position
    );
    if (options.maxDecodingStep < DECODING_STEPS.edgeIndices) {
        return { header, vertexData, triangleIndices };
    }

    if (options.maxDecodingStep < DECODING_STEPS.extensions) {
        return {
            header,
            vertexData,
            triangleIndices
        };
    }

    const { layers, layersEndPosition } = decodeStratumLayers(dataView, triangleIndicesEndPosition);

    if (options.maxDecodingStep < DECODING_STEPS.extensions) {
        return {
            header,
            vertexData,
            triangleIndices,
            layers
        };
    }

    const { faceTypes, faceTypesEndPosition } = decodeFaceTypes(dataView, layersEndPosition);

    if (options.maxDecodingStep < DECODING_STEPS.extensions) {
        return {
            header,
            vertexData,
            triangleIndices,
            layers,
            faceTypes
        };
    }

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
