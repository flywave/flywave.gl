/* Copyright (C) 2025 flywave.gl contributors */

import {
    equirectangularProjection,
    normalizedEquirectangularProjection
} from "../projection/EquirectangularProjection";
import { halfQuadTreeSubdivisionScheme } from "./HalfQuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * {@link TilingScheme} used by most of the data published by HERE.
 *
 * The `geographicStandardTiling` features a half quadtree subdivision scheme and an equirectangular
 * projection.
 */
export const geographicStandardTiling = new TilingScheme(
    halfQuadTreeSubdivisionScheme,
    equirectangularProjection
);
export const geographicTerrainStandardTiling = new TilingScheme(
    halfQuadTreeSubdivisionScheme,
    normalizedEquirectangularProjection
);