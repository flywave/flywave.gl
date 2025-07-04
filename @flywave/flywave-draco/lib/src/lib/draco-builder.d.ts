import type { TypedArray } from "three";
import * as THREE from "three";
import type { draco_GeometryAttribute_Type, Draco3D, Encoder, Mesh, MeshBuilder, Metadata, MetadataBuilder, PointCloud } from "../draco3d/draco3d-types";
import type { DracoMesh } from "./draco-types";
export interface DracoBuildOptions {
    pointcloud?: boolean;
    metadata?: {
        [key: string]: string;
    };
    attributesMetadata?: {};
    log?: any;
    speed?: [number, number];
    method?: string;
    quantization?: {
        [attributeName: string]: number;
    };
}
export default class DracoBuilder {
    draco: Draco3D;
    dracoEncoder: Encoder;
    dracoMeshBuilder: MeshBuilder;
    dracoMetadataBuilder: MetadataBuilder;
    log: any;
    constructor(draco: Draco3D);
    destroy(): void;
    destroyEncodedObject(object: any): void;
    encodeSync(mesh: DracoMesh, options?: DracoBuildOptions): ArrayBuffer;
    _getAttributesFromMesh(mesh: DracoMesh): {
        [key: string]: THREE.BufferAttribute;
    };
    _encodePointCloud(pointcloud: DracoMesh, options: DracoBuildOptions): ArrayBuffer;
    _encodeMesh(mesh: DracoMesh, options: DracoBuildOptions): ArrayBuffer;
    _setOptions(options: DracoBuildOptions): void;
    _createDracoMesh(dracoMesh: Mesh, attributes: any, options: DracoBuildOptions): Mesh;
    _createDracoPointCloud(dracoPointCloud: PointCloud, attributes: object, options: DracoBuildOptions): PointCloud;
    _addAttributeToMesh(mesh: PointCloud, attributeName: string, attribute: TypedArray, vertexCount: number): number;
    _getDracoAttributeType(attributeName: string): draco_GeometryAttribute_Type | "indices";
    _getPositionAttribute(attributes: any): any;
    _addGeometryMetadata(dracoGeometry: PointCloud, metadata: {
        [key: string]: string;
    }): void;
    _addAttributeMetadata(dracoGeometry: PointCloud, uniqueAttributeId: number, metadata: Map<string, string> | {
        [key: string]: string;
    }): void;
    _populateDracoMetadata(dracoMetadata: Metadata, metadata: Map<string, string> | {
        [key: string]: string;
    }): void;
}
//# sourceMappingURL=draco-builder.d.ts.map