/* Copyright (C) 2025 flywave.gl contributors */

import { type SubdivisionScheme } from "./SubdivisionScheme";
import { SubTiles } from "./SubTiles";
import { type TileKey } from "./TileKey";

export class TileTreeTraverse {
    private readonly m_subdivisionScheme: SubdivisionScheme;

    constructor(subdivisionScheme: SubdivisionScheme) {
        this.m_subdivisionScheme = subdivisionScheme;
    }

    subTiles(tileKey: TileKey): Iterable<TileKey> {
        const divX = this.m_subdivisionScheme.getSubdivisionX(tileKey.level + 1);
        const divY = this.m_subdivisionScheme.getSubdivisionY(tileKey.level + 1);

        return new SubTiles(tileKey, divX, divY);
    }
}
