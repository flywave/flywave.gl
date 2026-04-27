import { type GeoBox, type Projection } from "@flywave/flywave-geoutils";
import { type SerializedGroundModificationPolygon } from "../../ground-modification-manager";
import { QuantizedMeshLoaderBase } from "./QuantizedMeshLoaderBase";
import { QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
interface MetadataJson {
    geometricerror?: number;
    available?: Array<{
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    }>;
    [key: string]: unknown;
}
export interface MetadataExtension {
    extensionId: number;
    json: MetadataJson;
}
export interface QuantizedMeshLoaderOptions {
    skirtLength?: number;
    smoothSkirtNormals?: boolean;
    isWebMercator?: boolean;
    solid?: boolean;
    geoBox: GeoBox;
    elevationMapEnabled: boolean;
    elevationMapFlipY: boolean;
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
}
export declare class QuantizedMeshLoader extends QuantizedMeshLoaderBase {
    private readonly ellipsoid;
    private readonly options;
    skirtLength: number;
    smoothSkirtNormals: boolean;
    solid: boolean;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    constructor(ellipsoid: Projection, options: QuantizedMeshLoaderOptions);
    parse(buffer: ArrayBuffer): QuantizedTerrainMesh;
}
export {};
