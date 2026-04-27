import { type GeoCoordinatesLike } from "@flywave/flywave-geoutils";
import { Vector3 } from "three";
import { type CollapseProfile, type StratumProfile } from "./CrossSectionUtils";
import { type StratumLayer } from "./StratumLayer";
import { type StratumTileData } from "./StratumTileData";
export declare class StratumCrossSections {
    private readonly stratumMeshData;
    constructor(stratumMeshData: StratumTileData);
    generateCrossSections(cutLines: GeoCoordinatesLike[][], upDir?: Vector3): Array<{
        stratumProfiles: StratumProfile[];
        collapseProfiles: CollapseProfile[];
        line: GeoCoordinatesLike[];
    }>;
    private processTriangles;
    private projectPointToSegment;
    private lineTriangleIntersection;
    private generateStratumMesh;
    private calculateProjectionMatrixForSection;
    private sortPointsAlongLine;
    private queryRelevantCollapses;
    private calculate3DBounds;
    private splitContinuousSegments;
    private computePolygonNormal;
    private cutProfiles;
    private ensureClockwiseOrder;
    private ensureCounterClockwiseOrder;
    private calculatePolygonArea;
    private polygonsIntersect;
    private projectTo2D;
    private projectTo3D;
    private calculateBounds;
    private boundsIntersect;
    private pointInPolygon;
    private buildTriangulateMesh;
    private weilerAthertonClip;
    extractGroundFaces(stratumLayers: StratumLayer[]): {
        positions: Float32Array;
        indices: Uint32Array;
        extents: number[];
    };
    private mergeGeometryData;
    private generatePositionHash;
}
