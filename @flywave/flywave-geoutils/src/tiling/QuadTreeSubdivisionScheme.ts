/* Copyright (C) 2025 flywave.gl contributors */

import { type SubdivisionScheme } from "./SubdivisionScheme";
import { TileEncoding } from "./TileKey";

class QuadTreeSubdivisionScheme implements SubdivisionScheme {
    getSubdivisionX(): number {
        return 2;
    }

    getSubdivisionY(): number {
        return 2;
    }

    getLevelDimensionX(level: number): number {
        return 1 << level;
    }

    getLevelDimensionY(level: number): number {
        return 1 << level;
    }

    get mortonTileEncoding(): TileEncoding {
        return TileEncoding.QUAD_TREE;
    }
}

/**
 * {@link SubdivisionScheme} representing a quadtree.
 */
export const quadTreeSubdivisionScheme: SubdivisionScheme = new QuadTreeSubdivisionScheme();
