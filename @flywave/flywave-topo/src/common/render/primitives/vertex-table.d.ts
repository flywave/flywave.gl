import { type ColorDef, type QParams2d, type QParams3d } from "../../../common";
export interface VertexTable {
    readonly data: Uint8Array;
    readonly usesUnquantizedPositions?: boolean;
    readonly qparams: QParams3d;
    readonly width: number;
    readonly height: number;
    readonly hasTranslucency: boolean;
    readonly uniformColor?: ColorDef;
    readonly numVertices: number;
    readonly numRgbaPerVertex: number;
    readonly uvParams?: QParams2d;
}
export interface Dimensions {
    width: number;
    height: number;
}
export declare function computeDimensions(nEntries: number, nRgbaPerEntry: number, nExtraRgba: number, maxSize: number): Dimensions;
