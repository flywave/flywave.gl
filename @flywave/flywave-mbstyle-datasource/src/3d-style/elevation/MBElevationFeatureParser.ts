/**
 * Parser for the HD road elevation vector layer (`hd_road_elevation`).
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/elevation_feature_parser.ts`
 * for the flywave pipeline: instead of reading raw `@mapbox/vector-tile`
 * structures, this parser consumes decoded adapter callbacks — the decoder
 * dispatches `hd_road_elevation` Points (`curve_point`) and Polygons
 * (`curve_meta`) here with their properties already resolved.
 *
 * Two schema versions exist:
 *  - v1.0.0 (default): heights are relative, scaled by 1/10000 and a 5.0
 *    placeholder factor (`height_relative`, `fixed_height_relative`).
 *  - v1.0.1: heights are plain meters scaled by 1/10000
 *    (`height`, `fixed_height`).
 */

import {
    PROPERTY_ELEVATION_ID,
    ELEVATION_EXTENT,
} from './MBElevationConstants';

/** A single elevation curve point (canonical-extent coordinates, meters height). */
export interface ElevationCurveVertex {
    /** Owning elevation curve id (`3d_elevation_id`). */
    id: number;
    /** Curve point index (`elevation_idx`) — defines adjacency. */
    idx: number;
    /** Position in canonical elevation-extent units. */
    x: number;
    y: number;
    /** Road half-width in METERS (raw property — mgl keeps it unnormalized;
     * the subdivision edge iterator scales it by metersToTile at use time). */
    extent: number;
    /** Height above ground in meters. */
    height: number;
}

/** A curve meta feature — bounds + optional constant height. */
export interface ElevationCurveMeta {
    id: number;
    /** Tile-extent bounds of the curve (minX, minY, maxX, maxY). */
    bounds: [number, number, number, number];
    constantHeight: number | undefined;
}

export interface ElevationParseResult {
    vertices: ElevationCurveVertex[];
    features: ElevationCurveMeta[];
}

/** Decode the quantized relative-height encoding into meters (v1.0.0). */
export function decodeRelativeHeight(height: number): number {
    // Placeholder factor for converting relative heights into meters —
    // chosen by visual inspection; values are expected in meters later.
    const RELATIVE_ELEVATION_TO_METERS = 5.0;
    return (height / 10000.0) * RELATIVE_ELEVATION_TO_METERS;
}

/** Decode the quantized metric-height encoding into meters (v1.0.1). */
export function decodeMetricHeight(height: number): number {
    return height / 10000.0;
}

/** Minimal view of one decoded vector feature fed into the parser. */
export interface RawElevationFeature {
    /** `curve_meta` (polygon) or `curve_point` (point). */
    type: string;
    properties: Record<string, unknown>;
    /** First geometry point in the LAYER's extent units. */
    x: number;
    y: number;
    /** Geometry bounds in the layer's extent units. */
    bounds: [number, number, number, number];
    /** The layer's declared extent (positions are normalized from it). */
    layerExtent: number;
}

type MetaSchema = (f: RawElevationFeature, out: ElevationCurveMeta) => boolean;
type VertexSchema = (f: RawElevationFeature, out: ElevationCurveVertex) => boolean;

function numProp(f: RawElevationFeature, name: string): number | undefined {
    const v = f.properties[name];
    if (v === undefined || v === null) return undefined;
    const n = +v;
    return Number.isNaN(n) ? undefined : n;
}

/** Rescale a layer-extent coordinate into canonical elevation-extent units. */
function normalizeCoord(v: number, layerExtent: number): number {
    return layerExtent > 0 && layerExtent !== ELEVATION_EXTENT
        ? (v / layerExtent) * ELEVATION_EXTENT
        : v;
}

/** v1.0.0 — relative heights. */
const schemaV100: { meta: MetaSchema; vertex: VertexSchema } = {
    meta: (f, out) => {
        const id = numProp(f, PROPERTY_ELEVATION_ID);
        if (id === undefined) return false;
        out.id = id;
        const fixed = numProp(f, 'fixed_height_relative');
        out.constantHeight = fixed !== undefined ? decodeRelativeHeight(fixed) : undefined;
        out.bounds = f.bounds;
        return true;
    },
    vertex: (f, out) => {
        const id = numProp(f, PROPERTY_ELEVATION_ID);
        const idx = numProp(f, 'elevation_idx');
        const extent = numProp(f, 'extent');
        const height = numProp(f, 'height_relative');
        if (id === undefined || idx === undefined || extent === undefined || height === undefined) {
            return false;
        }
        out.id = id;
        out.idx = idx;
        // mgl keeps `extent` (road half-width, meters) raw — normalizing it
        // by the layer extent would halve the subdivision strip width.
        out.extent = extent;
        out.height = decodeRelativeHeight(height);
        out.x = normalizeCoord(f.x, f.layerExtent);
        out.y = normalizeCoord(f.y, f.layerExtent);
        return true;
    },
};

/** v1.0.1 — metric heights, "relative" dropped from property names. */
const schemaV101: { meta: MetaSchema; vertex: VertexSchema } = {
    meta: (f, out) => {
        const id = numProp(f, PROPERTY_ELEVATION_ID);
        if (id === undefined) return false;
        out.id = id;
        const fixed = numProp(f, 'fixed_height');
        out.constantHeight = fixed !== undefined ? decodeMetricHeight(fixed) : undefined;
        out.bounds = f.bounds;
        return true;
    },
    vertex: (f, out) => {
        const id = numProp(f, PROPERTY_ELEVATION_ID);
        const idx = numProp(f, 'elevation_idx');
        const extent = numProp(f, 'extent');
        const height = numProp(f, 'height');
        if (id === undefined || idx === undefined || extent === undefined || height === undefined) {
            return false;
        }
        out.id = id;
        out.idx = idx;
        // See the v1.0.0 note: `extent` stays raw meters.
        out.extent = extent;
        out.height = decodeMetricHeight(height);
        out.x = normalizeCoord(f.x, f.layerExtent);
        out.y = normalizeCoord(f.y, f.layerExtent);
        return true;
    },
};

function getVersionSchema(version: unknown): { meta: MetaSchema; vertex: VertexSchema } | undefined {
    if (!version) return schemaV100;
    if (version === '1.0.1') return schemaV101;
    return undefined;
}

/** Parse a `curve_point` feature into a curve vertex, or null when invalid. */
export function parseElevationVertex(f: RawElevationFeature): ElevationCurveVertex | null {
    const schema = getVersionSchema(f.properties.version);
    if (!schema || f.type !== 'Point' || f.properties['type'] !== 'curve_point') return null;
    const out = {} as ElevationCurveVertex;
    return schema.vertex(f, out) ? out : null;
}

/** Parse a `curve_meta` feature into curve metadata, or null when invalid. */
export function parseElevationMeta(f: RawElevationFeature): ElevationCurveMeta | null {
    const schema = getVersionSchema(f.properties.version);
    if (!schema || f.type !== 'Polygon' || f.properties['type'] !== 'curve_meta') return null;
    const out = {} as ElevationCurveMeta;
    return schema.meta(f, out) ? out : null;
}
