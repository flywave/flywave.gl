import { LinePixels, PolylineTypeFlags } from "../../../common";
import { VertexIndices } from "./vertex-indices";
import { VertexTable } from "./vertex-table";

export interface TesselatedPolyline {
    indices: VertexIndices;
    prevIndices: VertexIndices;
    nextIndicesAndParams: Uint8Array;
}

export interface PolylineParams {
    vertices: VertexTable;
    polyline: TesselatedPolyline;
    isPlanar: boolean;
    type: PolylineTypeFlags;
    weight: number;
    linePixels: LinePixels;
}
