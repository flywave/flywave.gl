export interface ParseStratumMeshOptions {
    bounds?: [number, number, number, number];
}

export interface Header {
    centerX?: number;
    centerY?: number;
    centerZ?: number;
    minHeight?: number;
    maxHeight?: number;
    boundingSphereCenterX?: number;
    boundingSphereCenterY?: number;
    boundingSphereCenterZ?: number;
    boundingSphereRadius?: number;
    horizonOcclusionPointX?: number;
    horizonOcclusionPointY?: number;
    horizonOcclusionPointZ?: number;
}

export interface DecodeHeaderResult {
    header: Header;
    headerEndPosition: number;
}

export interface VertexData {
    u: Float64Array<ArrayBuffer>;
    v: Float64Array<ArrayBuffer>;
    h: Float64Array<ArrayBuffer>;
    normals: Float32Array<ArrayBuffer>;
    uvs: Float32Array<ArrayBuffer>;
}

export interface DecodeVertexDataResult {
    vertexData: VertexData;
    vertexDataEndPosition: number;
}

export interface DecodeTriangleIndicesResult {
    triangleIndices: Uint16Array | Uint32Array;
    triangleIndicesEndPosition: number;
}

export interface DecodeExtensionsResult {
    extensions: Extensions;
    extensionsEndPosition: number;
}

export interface DecodeOptions {
    maxDecodingStep?: number;
}

export interface DecodeResult {
    header: Header;
    vertexData?: VertexData;
    triangleIndices?: Uint16Array | Uint32Array;
    extensions?: Extensions;
    layers?: StratumLayer[];
    faceTypes?: Uint8Array;
}

// 扩展头
export interface ExtensionHeader {
    extensionId: number;
    extensionLength: number;
}

// 元数据
export interface Metadata {
    jsonLength: number;
    json: any; // 可以使用更具体的类型替代 any
}

// 地层体素
export interface StratumVoxel {
    id: string;
    index: number;
    start: number;
    end: number;
    neighbors: [number, number, number];
    material: number;
}

// 材质映射
export interface Material {
    color: ColorRGBA;
    texture: [number, number, number, number];
}

// RGBA 颜色
export interface ColorRGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

// 断层点
export interface FaultPoint {
    x: number;
    y: number;
    z: number;
}

// 断层剖面
export interface FaultProfile {
    id: string;
    name: string;
    type: string;
    strike: number;
    dip: number;
    throw: number;
    points: FaultPoint[];
}

// 轨迹点
export interface TrajectoryPoint {
    depth: number;
    x: number;
    y: number;
    z: number;
    azimuth: number;
    inclination: number;
}

// 钻孔地层
export interface BoreholeStratum {
    id: string;
    lithology: string;
    top: number;
    base: number;
}

// 钻孔
export interface Borehole {
    id: string;
    location: [number, number, number];
    depth: number;
    azimuth: number;
    inclination: number;
    trajectory: TrajectoryPoint[];
    stratums: BoreholeStratum[];
}

export enum LayerType {
    Voxel = 0,
    Borehole = 1,
    Fault = 2,
    Collapse = 3,
    Section = 4
}

// 地层组
export interface StratumLayer {
    type: LayerType;
    id: string;
    voxels: StratumVoxel[];
}

// 陷落柱
export interface CollapsePillar {
    id: string;
    name: string;
    topCenter: [number, number, number];
    baseCenter: [number, number, number];
    topRadius: number;
    baseRadius: number;
    height: number;
    stratumId: string;
    lithology: string;
}

// 剖切线
export interface SectionLine {
    id: string;
    name: string;
    lineString: Array<[number, number, number]>;
}

export type StratumLithology = Record<string, string>;

// 扩展类型
export type Extensions = {
    metadata?: Metadata;
    materials?: Material[];
    faultProfiles?: FaultProfile[];
    boreholes?: Borehole[];
    stratumLayers?: StratumLayer[];
    collapsePillars?: CollapsePillar[];
    sectionLines?: SectionLine[];
    stratumLithology?: Record<string, string>; // 新增类型
} & {
    [key: string]: any; // 允许其他未定义的扩展
};
