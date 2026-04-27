export declare function zigZagDecode(value: number): number;
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
export declare class QuantizedMeshLoaderBase {
    protected decode(buffer: ArrayBuffer): QuantizedMeshData;
}
export {};
