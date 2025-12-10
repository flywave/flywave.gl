/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Options for parsing stratum mesh data
 */
export interface ParseStratumMeshOptions {
    /**
     * Optional bounding box [minX, minY, maxX, maxY]
     */
    bounds?: [number, number, number, number];
}

/**
 * Header information for stratum mesh data
 */
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

/**
 * Result of header decoding
 */
export interface DecodeHeaderResult {
    header: Header;
    headerEndPosition: number;
}

/**
 * Vertex data structure
 */
export interface VertexData {
    u: Float64Array;
    v: Float64Array;
    h: Float64Array;
    normals: Float32Array;
    uvs: Float32Array;
}

/**
 * Result of vertex data decoding
 */
export interface DecodeVertexDataResult {
    vertexData: VertexData;
    vertexDataEndPosition: number;
}

/**
 * Result of triangle indices decoding
 */
export interface DecodeTriangleIndicesResult {
    triangleIndices: Uint16Array | Uint32Array;
    triangleIndicesEndPosition: number;
}

/**
 * Result of extensions decoding
 */
export interface DecodeExtensionsResult {
    extensions: Extensions;
    extensionsEndPosition: number;
}

/**
 * Options for decoding operations
 */
export interface DecodeOptions {
    /**
     * Maximum decoding step to execute
     */
    maxDecodingStep?: number;
}

/**
 * Complete decoding result
 */
export interface DecodeResult {
    header: Header;
    vertexData?: VertexData;
    triangleIndices?: Uint16Array | Uint32Array;
    extensions?: Extensions;
    layers?: StratumLayerData[];
    faceTypes?: Uint8Array;
}

/**
 * Extension header information
 */
export interface ExtensionHeader {
    extensionId: number;
    extensionLength: number;
}

/**
 * Metadata structure
 */
export interface Metadata {
    jsonLength: number;
    json: Record<string, unknown>; // More specific type than any
}

/**
 * Stratum voxel data
 */
export interface StratumVoxelData {
    id: string;
    index: number;
    start: number;
    end: number;
    neighbors: [number, number, number];
    material: number;
}

/**
 * Material definition
 */
export interface Material {
    color: ColorRGBA;
    uvTransform: [number, number, number, number];
}

/**
 * RGBA color definition
 */
export interface ColorRGBA {
    r: number;
    g: number;
    b: number;
    a: number;
}

/**
 * Fault point coordinates
 */
export interface FaultPoint {
    x: number;
    y: number;
    z: number;
}

/**
 * Fault profile data
 */
export interface FaultProfileData {
    id: string;
    name: string;
    type: string;
    strike: number;
    dip: number;
    throw: number;
    points: FaultPoint[];
}

/**
 * Trajectory point for boreholes
 */
export interface TrajectoryPoint {
    depth: number;
    x: number;
    y: number;
    z: number;
    azimuth: number;
    inclination: number;
}

/**
 * Borehole stratum layer
 */
export interface BoreholeStratum {
    id: string;
    lithology: string;
    top: number;
    base: number;
}

/**
 * Borehole data
 */
export interface BoreholeData {
    id: string;
    location: [number, number, number];
    depth: number;
    azimuth: number;
    inclination: number;
    trajectory: TrajectoryPoint[];
    stratums: BoreholeStratum[];
}

/**
 * Face type bitmask flags
 */
export const FaceTypes = {
    TopFace: 1 << 0,
    BaseFace: 1 << 1,
    SideFace: 1 << 2,
    BoundaryFace: 1 << 3,
    GroundFace: 1 << 4,
    BedrockFace: 1 << 5,
    CutFace: 1 << 6,
    BoundarySideFace: (1 << 2) | (1 << 3),
    TopGroundFace: (1 << 0) | (1 << 4),
    BaseBedrockFace: (1 << 5) | (1 << 1)
} as const;

/**
 * Layer type enumeration
 */
export enum LayerType {
    Voxel = 0,
    Borehole = 1,
    Fault = 2,
    Collapse = 3,
    Section = 4
}

/**
 * Stratum layer data
 */
export interface StratumLayerData {
    type: LayerType;
    id: string;
    voxels: StratumVoxelData[];
}

/**
 * Collapse pillar data
 */
export interface CollapsePillarData {
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

/**
 * Section line data
 */
export interface SectionLineData {
    id: string;
    name: string;
    lineString: Array<[number, number, number]>;
}

/**
 * Stratum lithology mapping
 */
export type StratumLithology = Record<string, string>;

/**
 * Extensions container type
 */
export type Extensions = {
    metadata?: Metadata;
    materials?: Material[];
    faultProfiles?: FaultProfileData[];
    boreholes?: BoreholeData[];
    collapsePillars?: CollapsePillarData[];
    sectionLines?: SectionLineData[];
    stratumLithology?: StratumLithology;
} & Record<string, any>;
