
export type ParseStratumMeshOptions = {
    bounds?: [number, number, number, number];
};

export type Header = {
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
};

export type DecodeHeaderResult = {
    header: Header;
    headerEndPosition: number;
};

export type VertexData = {
    u: Float64Array<ArrayBuffer>;
    v: Float64Array<ArrayBuffer>;
    h: Float64Array<ArrayBuffer>;
    normals: Float32Array<ArrayBuffer>;
    uvs: Float32Array<ArrayBuffer>;
};

export type DecodeVertexDataResult = {
    vertexData: VertexData;
    vertexDataEndPosition: number;
};

export type DecodeTriangleIndicesResult = {
    triangleIndices: Uint16Array | Uint32Array;
    triangleIndicesEndPosition: number;
};

export type DecodeExtensionsResult = {
    extensions: Extensions;
    extensionsEndPosition: number;
};

export type DecodeOptions = {
    maxDecodingStep?: number;
};

export type DecodeResult = {
    header: Header;
    vertexData?: VertexData;
    triangleIndices?: Uint16Array | Uint32Array;
    extensions?: Extensions;
    layers?: StratumLayer[];
    faceTypes?: Uint8Array;
};

// 扩展头
export type ExtensionHeader = {
    extensionId: number;
    extensionLength: number;
};

// 元数据
export type Metadata = {
    jsonLength: number;
    json: any; // 可以使用更具体的类型替代 any
};

// 地层体素
export type StratumVoxel = {
    id: string;
    index: number;
    start: number;
    end: number;
    bbox: [[number, number, number], [number, number, number]];
    neighbors: [number, number, number];
};

// 颜色映射
export type ColorMap = {
    textureSize: number;
    stratumColor: Record<string, ColorRGBA>;
    stratumTexture: Record<string, string>;
    defaultStratum: ColorRGBA;
    faultColor: Record<string, ColorRGBA>;
    faultHighlight: ColorRGBA;
    defaultFault: ColorRGBA;
    collapseColor: Record<string, ColorRGBA>;
    defaultCollapse: ColorRGBA;
};

// RGBA 颜色
export type ColorRGBA = {
    r: number;
    g: number;
    b: number;
    a: number;
};

// 断层点
export type FaultPoint = {
    x: number;
    y: number;
    z: number;
};

// 断层剖面
export type FaultProfile = {
    id: string;
    name: string;
    type: string;
    strike: number;
    dip: number;
    throw: number;
    points: FaultPoint[];
};

// 轨迹点
export type TrajectoryPoint = {
    depth: number;
    x: number;
    y: number;
    z: number;
    azimuth: number;
    inclination: number;
};

// 钻孔地层
export type BoreholeStratum = {
    id: string;
    lithology: string;
    top: number;
    base: number;
};

// 钻孔
export type Borehole = {
    id: string;
    location: [number, number, number];
    depth: number;
    azimuth: number;
    inclination: number;
    trajectory: TrajectoryPoint[];
    stratums: BoreholeStratum[];
};

export enum LayerType {
    Voxel = 0,
    Borehole = 1,
    Fault = 2,
    Collapse = 3,
    Section = 4
}

// 地层组
export type StratumLayer = {
    type: LayerType; // 使用枚举类型替代number
    id: string;
    voxels: StratumVoxel[];
};

// 陷落柱
export type CollapsePillar = {
    id: string;
    name: string;
    topCenter: [number, number, number];
    baseCenter: [number, number, number];
    topRadius: number;
    baseRadius: number;
    height: number;
    stratumId: string;
    lithology: string;
    bbox: [[number, number, number], [number, number, number]];
};

// 剖切线
export type SectionLine = {
    id: string;
    name: string;
    lineString: [number, number, number][];
};

export type StratumLithology = Record<string, string>;

// 扩展类型
export type Extensions = {
    metadata?: Metadata;
    colorMap?: ColorMap;
    faultProfiles?: FaultProfile[];
    boreholes?: Borehole[];
    stratumLayers?: StratumLayer[];
    collapsePillars?: CollapsePillar[];
    sectionLines?: SectionLine[];
    stratumLithology?: Record<string, string>; // 新增类型
} & {
    [key: string]: any; // 允许其他未定义的扩展
};
