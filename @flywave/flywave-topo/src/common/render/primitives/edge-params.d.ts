import { type LinePixels } from "../../../common";
import { type TesselatedPolyline } from "./polyline-params";
import { type VertexIndices } from "./vertex-indices";
export interface SegmentEdgeParams {
    readonly indices: VertexIndices;
    readonly endPointAndQuadIndices: Uint8Array;
}
export interface SilhouetteParams extends SegmentEdgeParams {
    readonly normalPairs: Uint8Array;
}
export interface EdgeTable {
    readonly data: Uint8Array;
    readonly width: number;
    readonly height: number;
    readonly numSegments: number;
    readonly silhouettePadding: number;
}
export interface IndexedEdgeParams {
    readonly indices: VertexIndices;
    readonly edges: EdgeTable;
}
export interface EdgeTableInfo {
    readonly width: number;
    readonly height: number;
    readonly silhouettePadding: number;
    readonly silhouetteStartByteIndex: number;
}
export interface EdgeParams {
    readonly weight: number;
    readonly linePixels: LinePixels;
    readonly segments?: SegmentEdgeParams;
    readonly silhouettes?: SilhouetteParams;
    readonly polylines?: TesselatedPolyline;
    readonly indexed?: IndexedEdgeParams;
}
export declare function calculateEdgeTableParams(numSegmentEdges: number, numSilhouettes: number, maxSize: number): EdgeTableInfo;
