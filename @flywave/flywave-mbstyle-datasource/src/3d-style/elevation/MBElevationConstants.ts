/**
 * HD road elevation constants.
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/elevation_constants.ts`
 * following the flywave code style (see §510/§511 in
 * docs/render-tests-port-todo.md for the 3d-intersections port plan).
 */

/** Property for associating elevation features into regular features. */
export const PROPERTY_ELEVATION_ID = '3d_elevation_id';

/** Property marking the zLevel of elevated road markups (elevated lines/circles). */
export const PROPERTY_ELEVATION_ROAD_MARKUP_Z_LEVEL = 'zLevel';

/** Property marking the zLevel for elevated base roads. */
export const PROPERTY_ELEVATION_ROAD_BASE_Z_LEVEL = 'level';

/** Hard-coded source layer name for HD road elevation data. */
export const HD_ELEVATION_SOURCE_LAYER = 'hd_road_elevation';

/** Tile-extent margin (in extent units) when clipping elevation curves. */
export const ELEVATION_CLIP_MARGIN = 1;

/**
 * Height bias (meters) that markup layers (lines/circles) are lifted by
 * relative to the road base surface — prevents z-fighting between the
 * base road polygon and the markings drawn on top of it.
 */
export const MARKUP_ELEVATION_BIAS = 0.05;

/**
 * Fraction to extend subdivision edge endpoints in each direction to ensure
 * the strip fully crosses the road polygon. Without this, tight ramp
 * geometry can produce edges that don't span the full polygon width,
 * causing invalid clipping output.
 */
export const SUBDIVISION_EDGE_EXTENSION = 0.1;

/** Depth (meters) after which roads render as tunnels. */
export const TUNNEL_THRESHOLD_METERS = 5.0;

/**
 * Canonical tile extent the elevation pipeline normalizes positions into.
 * mgl's HD elevation data is authored in `EXTENT` (4096) space; fixture
 * tiles may declare other extents (e.g. 8192) — the parser rescales.
 */
export const ELEVATION_EXTENT = 4096;

export type ElevationType = 'none' | 'road' | 'offset';
