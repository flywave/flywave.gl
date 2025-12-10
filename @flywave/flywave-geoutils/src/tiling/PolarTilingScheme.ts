/* Copyright (C) 2025 flywave.gl contributors */

import { transverseMercatorProjection } from "../projection/TransverseMercatorProjection";
import { quadTreeSubdivisionScheme } from "./QuadTreeSubdivisionScheme";
import { TilingScheme } from "./TilingScheme";

/**
 * A {@link TilingScheme} featuring quadtree subdivision scheme and
 * transverse Mercator projection.
 */
export const polarTilingScheme = new TilingScheme(
    quadTreeSubdivisionScheme,
    transverseMercatorProjection
);
