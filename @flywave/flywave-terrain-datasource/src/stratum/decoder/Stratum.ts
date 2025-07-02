import { decodeExtensions, readString } from "./Extensions";
import {
  DecodeHeaderResult,
  DecodeOptions,
  DecodeResult,
  DecodeTriangleIndicesResult,
  DecodeVertexDataResult,
  Header,
  StratumLayer,
  StratumVoxel,
} from "./types";

const STRATUM_MESH_HEADER_SIZE = 88;
const STRATUM_COORDINATE_SIZE = 32767;

function decodeZigZag(value: number): number {
  return (value >> 1) ^ -(value & 1);
}

function octDecodeNormal(x: number, y: number): [number, number, number] {
  // 八面体解码实现
  const nx = x / STRATUM_COORDINATE_SIZE;
  const ny = y / STRATUM_COORDINATE_SIZE;
  const nz = 1 - Math.abs(nx) - Math.abs(ny);

  const t = Math.max(-nz, 0);
  const nxSign = nx >= 0 ? 1 : -1;
  const nySign = ny >= 0 ? 1 : -1;

  return [
    nx + t * nxSign,
    ny + t * nySign,
    nz
  ];
}


function decodeHeader(dataView: DataView): DecodeHeaderResult {
  let position = 0;
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

  // 读取U坐标
  const uArray = new Uint16Array(dataView.buffer, position, vertexCount);
  position += vertexCount * 2;

  // 读取V坐标
  const vArray = new Uint16Array(dataView.buffer, position, vertexCount);
  position += vertexCount * 2;

  // 读取高度
  const hArray = new Uint16Array(dataView.buffer, position, vertexCount);
  position += vertexCount * 2;

  // 解码顶点坐标
  const decodedU = new Float64Array(vertexCount);
  const decodedV = new Float64Array(vertexCount);
  const decodedH = new Float64Array(vertexCount);

  let u = 0, v = 0, h = 0;
  for (let i = 0; i < vertexCount; i++) {
    u += decodeZigZag(uArray[i]);
    v += decodeZigZag(vArray[i]);
    h += decodeZigZag(hArray[i]);

    decodedU[i] = u;
    decodedV[i] = v;
    decodedH[i] = h;
  }

  // 解码法线数据 (八面体编码 + 差分编码)
  const normalsArray = new Float32Array(vertexCount * 3);
  let prevNu = 0, prevNv = 0;
  for (let i = 0; i < vertexCount; i++) {
    const nx = decodeZigZag(dataView.getUint16(position + i * 4, true)) + prevNu;
    const ny = decodeZigZag(dataView.getUint16(position + i * 4 + 2, true)) + prevNv;
    prevNu = nx;
    prevNv = ny;

    const normal = octDecodeNormal(nx, ny);
    normalsArray[i * 3] = normal[0];
    normalsArray[i * 3 + 1] = normal[1];
    normalsArray[i * 3 + 2] = normal[2];
  }
  position += vertexCount * 4;

  // 解码UV数据 (差分编码)
  const uvsArray = new Float32Array(vertexCount * 2);
  let prevUVu = 0, prevUVv = 0;
  for (let i = 0; i < vertexCount; i++) {
    const u = decodeZigZag(dataView.getUint16(position + i * 4, true)) + prevUVu;
    const v = decodeZigZag(dataView.getUint16(position + i * 4 + 2, true)) + prevUVv;
    uvsArray[i * 2] = u / 32767; // 反量化到[0,1]范围
    uvsArray[i * 2 + 1] = v / 32767;
    prevUVu = u;
    prevUVv = v;
  }
  position += vertexCount * 4;

  // 处理对齐填充
  const alignment = vertexCount > 65535 ? 4 : 2;
  const padding = position % alignment;
  if (padding > 0) {
    position += alignment - padding;
  }

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
  const triangleIndices = bytesPerIndex === 4
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

function decodeStratumLayers(dataView: DataView, position: number): { layers: StratumLayer[], layersEndPosition: number } {
  // 读取地层组数量
  const layerCount = dataView.getInt32(position, true);
  position += Int32Array.BYTES_PER_ELEMENT;

  const layers: StratumLayer[] = [];

  for (let i = 0; i < layerCount; i++) {
    const layer: StratumLayer = {
      type: dataView.getInt8(position),
      id: '',
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
      const idBytes = new Uint8Array(dataView.buffer, dataView.byteOffset + position, idLength);
      const id = new TextDecoder().decode(idBytes);
      position += idLength;

      // 读取体素数据
      const start = dataView.getInt32(position, true);
      position += 4;
      const end = dataView.getInt32(position, true);
      position += 4;

      // 读取bbox数据
      const bboxMinX = dataView.getFloat32(position, true);
      position += 4;
      const bboxMinY = dataView.getFloat32(position, true);
      position += 4;
      const bboxMinZ = dataView.getFloat32(position, true);
      position += 4;
      const bboxMaxX = dataView.getFloat32(position, true);
      position += 4;
      const bboxMaxY = dataView.getFloat32(position, true);
      position += 4;
      const bboxMaxZ = dataView.getFloat32(position, true);
      position += 4;

      // 读取neighbors数据
      const neighbor1 = dataView.getInt32(position, true);
      position += 4;
      const neighbor2 = dataView.getInt32(position, true);
      position += 4;
      const neighbor3 = dataView.getInt32(position, true);
      position += 4;

      const voxel: StratumVoxel = {
        id,
        index,
        start,
        end,
        bbox: [
          [bboxMinX, bboxMinY, bboxMinZ],
          [bboxMaxX, bboxMaxY, bboxMaxZ]
        ],
        neighbors: [neighbor1, neighbor2, neighbor3],
      };
      layer.voxels.push(voxel);
    }
    layers.push(layer);
  }

  return { layers, layersEndPosition: position };
}

function decodeFaceTypes(dataView: DataView, position: number): { faceTypes: Uint8Array, faceTypesEndPosition: number } {
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
      triangleIndices,
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

  const { extensions } = decodeExtensions(
    dataView,
    faceTypesEndPosition
  );

  return {
    header,
    vertexData,
    layers,
    faceTypes,
    triangleIndices,
    extensions
  };
}