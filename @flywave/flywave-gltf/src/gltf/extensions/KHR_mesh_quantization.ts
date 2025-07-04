import type { GLTFLoaderOptions } from "../../gltf-loader";
import { GLTFScenegraph } from "../api/gltf-scenegraph";
import type { GLTF, GLTFBufferView, GLTFAccessor, GLTFMeshPrimitive } from "../types/gltf-json-schema";

const EXT_NAME = "KHR_mesh_quantization";

type QuantizationParams = {
  POSITION?: number;
  NORMAL?: number;
  TANGENT?: number;
  TEXCOORD?: number;
  COLOR?: number;
  GENERIC?: number;
  JOINTS?: number;
  WEIGHTS?: number;
};

export const name = EXT_NAME;

export async function decode(gltfData: { json: GLTF }, options: GLTFLoaderOptions) {
  const scenegraph = new GLTFScenegraph(gltfData);
  
  for (const mesh of gltfData.json.meshes || []) {
    for (const primitive of mesh.primitives) {
      const ext = scenegraph.getObjectExtension<QuantizationParams>(primitive, EXT_NAME);
      if (ext) {
        await processPrimitive(scenegraph, primitive, ext);
        scenegraph.removeObjectExtension(primitive, EXT_NAME);
      }
    }
  }
}

async function processPrimitive(
  scenegraph: GLTFScenegraph,
  primitive: GLTFMeshPrimitive,
  params: QuantizationParams
) {
  const attributePromises = Object.entries(primitive.attributes).map(
    async ([attributeName, accessorIndex]) => {
      const accessor = scenegraph.gltf.accessors[accessorIndex];
      return dequantizeAccessor(scenegraph, accessor, params, attributeName);
    }
  );

  await Promise.all(attributePromises);
}

async function dequantizeAccessor(
  scenegraph: GLTFScenegraph,
  accessor: GLTFAccessor,
  params: QuantizationParams,
  attributeName: string
) {
  // 跳过浮点类型和不需要解量化的属性
  if (accessor.componentType === 5126 || attributeName.startsWith('JOINTS_')) return;
  
  const bufferData = scenegraph.getTypedArrayForBufferView(accessor.bufferView);
  
  const componentSize = getComponentSize(accessor.type);
  const componentByteSize = getComponentByteSize(accessor.componentType);
  const stride = bufferView.byteStride || componentSize * componentByteSize;
  
  // 获取量化位数（根据属性类型）
  const bits = getQuantizationBits(attributeName, params);
  
  const dequantized = dequantizeData(
    bufferData,
    accessor,
    componentSize,
    componentByteSize,
    stride,
    bits
  );
  
  // 创建新缓冲区
  const newBufferIndex = scenegraph.addBuffer(dequantized);
  const newBufferView = scenegraph.addBufferView({
    buffer: newBufferIndex,
    byteLength: dequantized.byteLength,
    byteStride: componentSize * 4, // 解量化后每个组件4字节
    target: bufferView.target // 保留原始目标类型
  });
  
  // 更新访问器
  accessor.bufferView = newBufferView;
  accessor.componentType = 5126; // FLOAT
  accessor.normalized = false;
}

function dequantizeData(
  data: ArrayBuffer,
  accessor: GLTFAccessor,
  components: number,
  componentByteSize: number,
  stride: number,
  bits: number
): Float32Array {
  if (!accessor.min || !accessor.max) {
    throw new Error(`Accessor must have min and max for dequantization`);
  }

  const min = accessor.min as number[];
  const max = accessor.max as number[];
  const maxInteger = Math.pow(2, bits) - 1;

  const srcView = new DataView(data);
  const dstArray = new Float32Array(accessor.count * components);
  
  let dstIndex = 0;
  for (let i = 0; i < accessor.count; i++) {
    const offset = i * stride;
    
    for (let c = 0; c < components; c++) {
      const byteOffset = offset + c * componentByteSize;
      const rawValue = readComponent(srcView, byteOffset, accessor.componentType);
      
      // 使用访问器的min/max进行精确解量化
      const normalized = rawValue / maxInteger;
      const floatValue = min[c] + (max[c] - min[c]) * normalized;
      
      dstArray[dstIndex++] = floatValue;
    }
  }
  
  return dstArray;
}

function readComponent(view: DataView, offset: number, type: number): number {
  switch (type) {
    case 5120: // BYTE
      return view.getInt8(offset);
    case 5121: // UNSIGNED_BYTE
      return view.getUint8(offset);
    case 5122: // SHORT
      return view.getInt16(offset, true);
    case 5123: // UNSIGNED_SHORT
      return view.getUint16(offset, true);
    default:
      throw new Error(`Unsupported component type for quantization: ${type}`);
  }
}

function getQuantizationBits(attributeName: string, params: QuantizationParams): number {
  // 根据属性语义获取对应位数
  if (attributeName.startsWith('POSITION')) return params.POSITION || 12;
  if (attributeName.startsWith('NORMAL')) return params.NORMAL || 10;
  if (attributeName.startsWith('TANGENT')) return params.TANGENT || 10;
  if (attributeName.startsWith('TEXCOORD')) return params.TEXCOORD || 12;
  if (attributeName.startsWith('COLOR')) return params.COLOR || 8;
  if (attributeName.startsWith('WEIGHTS')) return params.WEIGHTS || 8;
  return params.GENERIC || 8;
}

function getComponentSize(type: string): number {
  const componentMap: Record<string, number> = {
    SCALAR: 1,
    VEC2: 2,
    VEC3: 3,
    VEC4: 4,
    MAT2: 4,
    MAT3: 9,
    MAT4: 16
  };
  return componentMap[type] || 1;
}

function getComponentByteSize(componentType: number): number {
  switch (componentType) {
    case 5120: // BYTE
    case 5121: // UNSIGNED_BYTE
      return 1;
    case 5122: // SHORT
    case 5123: // UNSIGNED_SHORT
      return 2;
    default:
      throw new Error(`Unsupported component type: ${componentType}`);
  }
}