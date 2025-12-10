/* Copyright (C) 2025 flywave.gl contributors */



import { type LinePixels, type PolylineTypeFlags } from "../../../common";
import { type VertexIndices } from "./vertex-indices";
import { type VertexTable } from "./vertex-table";

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
