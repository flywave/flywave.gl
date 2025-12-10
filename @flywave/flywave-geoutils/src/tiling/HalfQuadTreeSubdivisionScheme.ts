/* Copyright (C) 2025 flywave.gl contributors */

import { type SubdivisionScheme } from "./SubdivisionScheme";
import { TileEncoding } from "./TileKey";

class HalfQuadTreeSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(level: number): number {
        return 2;
    }

    getSubdivisionY(level: number): number {
        return level == 0 ? 1 : 2;
    }

    getLevelDimensionX(level: number): number {
        return 2 << level;
    }

    getLevelDimensionY(level: number): number {
        return 1 << level;
    }

    get mortonTileEncoding(): TileEncoding {
        return TileEncoding.HALF_QUAD_TREE;
    }
}

/**
 * A {@link SubdivisionScheme} used to represent half quadtrees.
 * This particular subdivision scheme is
 * used by the HERE tiling scheme.
 */
export const halfQuadTreeSubdivisionScheme: SubdivisionScheme = new HalfQuadTreeSubdivisionScheme();
