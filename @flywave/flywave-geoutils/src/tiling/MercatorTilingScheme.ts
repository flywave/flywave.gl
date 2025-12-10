/* Copyright (C) 2025 flywave.gl contributors */

import { mercatorProjection } from "../projection/MercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * The {@link TilingScheme} used by the HERE web tiles.
 *
 * The `mercatorTilingScheme` features a quadtree subdivision scheme and a Mercator projection.
 */
export const mercatorTilingScheme = new TilingScheme(quadTreeSubdivisionScheme, mercatorProjection);
