/* Copyright (C) 2025 flywave.gl contributors */



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

export function calculateEdgeTableParams(
    numSegmentEdges: number,
    numSilhouettes: number,
    maxSize: number
): EdgeTableInfo {
    let nRgbaRequired = Math.ceil(1.5 * numSegmentEdges + 2.5 * numSilhouettes);
    const silhouetteStartByteIndex = numSegmentEdges * 6;
    let silhouettePadding = 0;
    let width = nRgbaRequired;
    let height = 1;
    if (nRgbaRequired >= maxSize) {
        width = Math.ceil(Math.sqrt(nRgbaRequired));
        const remainder = width % 15;
        if (remainder !== 0) width += 15 - remainder;

        if (numSilhouettes > 0 && numSegmentEdges > 0) {
            const silOffset = silhouetteStartByteIndex % 60;
            silhouettePadding = (60 - silOffset) % 10;
            nRgbaRequired += Math.ceil(silhouettePadding / 4);
        }

        height = Math.ceil(nRgbaRequired / width);
        if (width * height < nRgbaRequired) height++;
    }

    return {
        width,
        height,
        silhouettePadding,
        silhouetteStartByteIndex
    };
}
