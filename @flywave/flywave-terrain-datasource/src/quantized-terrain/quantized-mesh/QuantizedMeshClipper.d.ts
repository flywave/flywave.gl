import { type Projection, GeoBox } from "@flywave/flywave-geoutils";
import { type SerializedGroundModificationPolygon } from "../../ground-modification-manager";
import { GeometryClipper } from "./GeometryClipper";
import { QuantizedTerrainMesh } from "./QuantizedTerrainMesh";
export interface QuantizedMeshClipperOptions {
    projection: Projection;
    skirtHeight?: number;
    smoothSkirtNormals?: boolean;
    isWebMercator?: boolean;
    solid?: boolean;
    geoBox: GeoBox;
    targetGeoBox: GeoBox;
    groundModificationPolygons?: SerializedGroundModificationPolygon[];
    elevationMapEnabled: boolean;
    elevationMapFlipY: boolean;
}
export declare class QuantizedMeshClipper extends GeometryClipper {
    ellipsoid: Projection;
    skirtLength: number;
    smoothSkirtNormals: boolean;
    isWebMercator?: boolean;
    solid: boolean;
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
    attributeList: string[];
    constructor(options: QuantizedMeshClipperOptions);
    clipToQuadrant(quantizedTerrainMesh: QuantizedTerrainMesh, left: boolean, bottom: boolean): QuantizedTerrainMesh;
    private adjustVertices;
}
