import { type GeoBoxArray, type Projection, GeoBox } from "@flywave/flywave-geoutils";
import { type SerializableGeometryData } from "@flywave/flywave-utils/bufferGeometryTransfer";
import { type BufferGeometry, type Material, type TextureImageData, BufferGeometryEventMap, DataTexture, Mesh, NormalBufferAttributes, Quaternion, Vector3 } from "three";
import DEMData, { SerializedDEMData } from "../../dem-terrain/dem/DemData";
import { type GroundModificationEventParams, type GroundModificationManager, type GroundModificationPolygon, type SerializedGroundModificationPolygon } from "../../ground-modification-manager";
import { QuantizedTileResource } from "../QuantizedTileResource";
import { type MetadataExtension } from "./QuantizedMeshLoader";
export type WaterMask = TextureImageData & {
    geoBox: GeoBoxArray;
};
export type QuantizedMetaData = {
    minHeight: number;
    maxHeight: number;
} & MetadataExtension;
export interface QuantizedTerrainMeshData {
    metadata: QuantizedMetaData;
    geometry: SerializableGeometryData;
    projectionName: string;
    waterMask?: WaterMask;
    geoBox: GeoBoxArray;
    matrix: number[];
    minimumHeight: number;
    maximumHeight: number;
    demMap?: SerializedDEMData;
    groundElevationModified?: boolean;
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
}
export declare class QuantizedTerrainMesh extends QuantizedTileResource {
    private m_projection?;
    waterMask?: WaterMask;
    private _demMap?;
    private _groundElevationModified?;
    quantizedGeometry: BufferGeometry;
    position: Vector3;
    private m_geoCenter;
    quaternion: Quaternion;
    scale: Vector3;
    metadataExtension?: QuantizedMetaData;
    waterMaskTexture?: DataTexture;
    geoBox: GeoBox;
    constructor(data: QuantizedTerrainMeshData | Mesh, m_projection?: Projection, waterMask?: WaterMask);
    generateAndProcessTerrain(options: {
        heightMap?: {
            geoBox: GeoBox;
            flipY?: boolean;
        };
        clip: GroundModificationPolygon[];
        projection: Projection;
    }): void;
    private drawHeightMap;
    toQuantizedTerrainMeshData(): QuantizedTerrainMeshData;
    static fromQuantizedTerrainMeshData(data: QuantizedTerrainMeshData): QuantizedTerrainMesh;
    static fromMesh(mesh: Mesh, projection: Projection): QuantizedTerrainMesh;
    get metaData(): QuantizedMetaData;
    get isGroundElevationModified(): boolean;
    getBytesUsed(): number;
    makeQuantizeMesh<T extends Material | Material[]>(material?: T): Mesh<BufferGeometry<NormalBufferAttributes, BufferGeometryEventMap>, T, import("three").Object3DEventMap>;
    get minHeight(): number;
    get maxHeight(): number;
    get demMap(): DEMData;
    protected get geometry(): BufferGeometry<NormalBufferAttributes, BufferGeometryEventMap>;
    get geometryProjection(): Projection;
    protected updateGeometryProjection(projection: Projection): void;
    protected get geoCenter(): GeoCoordinates;
    protected handleGroundModificationChange(event: GroundModificationEventParams, modify: GroundModificationManager): Promise<void>;
    protected disposeResources(): void;
}
