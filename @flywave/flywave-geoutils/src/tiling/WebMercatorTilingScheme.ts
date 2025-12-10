/* Copyright (C) 2025 flywave.gl contributors */

import { webMercatorProjection } from "../projection/MercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * A {@link TilingScheme} featuring quadtree subdivision scheme and web Mercator projection.
 */
export const webMercatorTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    webMercatorProjection
);

export const webMercatorTerrainTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    webMercatorProjection
);;
