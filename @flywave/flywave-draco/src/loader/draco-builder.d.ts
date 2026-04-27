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
    /**
     * Encode mesh or point cloud
     * @param mesh =({})
     * @param options
     */
    encodeSync(mesh: DracoMesh, options?: DracoBuildOptions): ArrayBuffer;
    _getAttributesFromMesh(mesh: DracoMesh): {
        [key: string]: THREE.BufferAttribute;
    };
    _encodePointCloud(pointcloud: DracoMesh, options: DracoBuildOptions): ArrayBuffer;
    _encodeMesh(mesh: DracoMesh, options: DracoBuildOptions): ArrayBuffer;
    /**
     * Set encoding options.
     * @param {{speed?: any; method?: any; quantization?: any;}} options
     */
    _setOptions(options: DracoBuildOptions): void;
    /**
     * @param {Mesh} dracoMesh
     * @param {object} attributes
     * @returns {Mesh}
     */
    _createDracoMesh(dracoMesh: Mesh, attributes: any, options: DracoBuildOptions): Mesh;
    /**
     * @param {} dracoPointCloud
     * @param {object} attributes
     */
    _createDracoPointCloud(dracoPointCloud: PointCloud, attributes: object, options: DracoBuildOptions): PointCloud;
    /**
     * @param mesh
     * @param attributeName
     * @param attribute
     * @param vertexCount
     */
    _addAttributeToMesh(mesh: PointCloud, attributeName: string, attribute: TypedArray, vertexCount: number): number;
    /**
     * DRACO can compress attributes of know type better
     * TODO - expose an attribute type map?
     * @param attributeName
     */
    _getDracoAttributeType(attributeName: string): draco_GeometryAttribute_Type | "indices";
    _getPositionAttribute(attributes: any): any;
    /**
     * Add metadata for the geometry.
     * @param dracoGeometry - WASM Draco Object
     * @param metadata
     */
    _addGeometryMetadata(dracoGeometry: PointCloud, metadata: {
        [key: string]: string;
    }): void;
    /**
     * Add metadata for an attribute to geometry.
     * @param dracoGeometry - WASM Draco Object
     * @param uniqueAttributeId
     * @param metadata
     */
    _addAttributeMetadata(dracoGeometry: PointCloud, uniqueAttributeId: number, metadata: Map<string, string> | {
        [key: string]: string;
    }): void;
    /**
     * Add contents of object or map to a WASM Draco Metadata Object
     * @param dracoMetadata - WASM Draco Object
     * @param metadata
     */
    _populateDracoMetadata(dracoMetadata: Metadata, metadata: Map<string, string> | {
        [key: string]: string;
    }): void;
}
