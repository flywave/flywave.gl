/* Copyright (C) 2025 flywave.gl contributors */



import { type ColorDef, type QParams2d, type QParams3d } from "../../../common";
import { assert } from "../../../utils";

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

export function computeDimensions(
    nEntries: number,
    nRgbaPerEntry: number,
    nExtraRgba: number,
    maxSize: number
): Dimensions {
    const nRgba = nEntries * nRgbaPerEntry + nExtraRgba;

    if (nRgba < maxSize) return { width: nRgba, height: 1 };

    let width = Math.ceil(Math.sqrt(nRgba));

    const remainder = width % nRgbaPerEntry;
    if (remainder !== 0) {
        width += nRgbaPerEntry - remainder;
    }

    let height = Math.ceil(nRgba / width);
    if (width * height < nRgba) ++height;

    assert(height <= maxSize);
    assert(width <= maxSize);
    assert(width * height >= nRgba);
    assert(Math.floor(height) === height);
    assert(Math.floor(width) === width);

    assert(width % nRgbaPerEntry === 0);

    return { width, height };
}
