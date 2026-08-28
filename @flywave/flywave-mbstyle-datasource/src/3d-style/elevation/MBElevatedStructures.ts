/**
 * Per-tile HD elevated-structures state.
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/elevated_structures.ts`
 * for the flywave pipeline. mgl builds GPU intersection meshes + portal
 * graphs here; our renderer generates THREE geometry at decode time, so
 * this module owns the semantic core:
 *
 *  - holds the tile's parsed `hd_road_elevation` curves and assembles them
 *    in `finalize()` (mirrors `ElevationFeatures.parseFrom`);
 *  - resolves a road feature's `3d_elevation_id` to a curve — same tile
 *    first, then the decoder's cross-tile registry, merging parts from
 *    ancestor/descendant tiles into this tile's frame (`mergeElevationFeatures`,
 *    mgl `line_hd_extension.handleFeature` / `fill_hd_extension.handleFeature`);
 *  - samples per-vertex heights for fills and lines, subdividing the
 *    geometry along the curve's perpendicular split lines so the sampled
 *    surface follows ramps (mgl `polygonSubdivision` / `lineSubdivision`);
 *  - classifies features as tunnel / elevated via the curve's height range;
 *  - collects portal candidates from fill exterior rings (`addPortalCandidates`:
 *    ground-touching edges → `entrance`, tile-border edges → `border`) and
 *    evaluates the cross-polygon portal graph (`evaluatePortals`, mgl
 *    `ElevationPortalGraph.evaluate` + `evaluatePortalGraphs`).
 */

import {
    ELEVATION_CLIP_MARGIN,
    ELEVATION_EXTENT,
    MARKUP_ELEVATION_BIAS,
} from './MBElevationConstants';
import {
    MBElevationFeature,
    mergeElevationFeatures,
} from './MBElevationFeature';
import {
    ElevationCurveMeta,
    ElevationCurveVertex,
    RawElevationFeature,
    parseElevationMeta,
    parseElevationVertex,
} from './MBElevationFeatureParser';
import {
    ElevationPortalEdge,
    ElevationPortalType,
    MBElevationPortalGraph,
    portalEdgeHash,
} from './MBElevationGraph';
import {
    ElevationTiledFeature,
    getElevationFeature,
    getOverlappingElevationParts,
} from './MBGetElevationFeature';
import {
    ClipPoint,
    SubdivisionEdge,
    clipRingToBox,
    lineSubdivision,
    polygonSubdivision,
} from '../util/MBPolygonClippingHD';

export interface FillElevationPiece {
    ring: ClipPoint[];
    /** Sampled height per ring vertex (meters, markup bias applied). */
    heights: number[];
    /** Hole rings subdivided with the same edges, with heights. */
    holes: Array<{ ring: ClipPoint[]; heights: number[] }>;
}

export interface FillElevationPlan {
    feature: MBElevationFeature;
    isTunnel: boolean;
    /** Subdivided exterior pieces with their attached subdivided holes. */
    pieces: FillElevationPiece[];
    /** Clipped pre-subdivision rings (exterior first) — portal candidates. */
    clippedRings: ClipPoint[][];
}

export interface LineElevationPlan {
    feature: MBElevationFeature;
    /** Subdivided points with sampled heights (markup bias applied). */
    points: ClipPoint[];
    heights: number[];
}

export class MBElevatedStructures {
    /** Parsed elevation curves for this tile. */
    features: MBElevationFeature[] = [];
    /** Whether any curve payload arrived for this tile. */
    hasPayload = false;
    /** Evaluated cross-polygon portal graph (after `evaluatePortals`). */
    evaluatedPortals: MBElevationPortalGraph | null = null;

    private m_meta: ElevationCurveMeta[] = [];
    private m_vertices: ElevationCurveVertex[] = [];
    /** Canonical extent of the elevation layer (positions normalized to it). */
    private m_layerExtent = ELEVATION_EXTENT;
    /** meters → canonical-extent-units (tile frame of THIS decode). */
    private m_metersToTile = 1;
    private m_consumerZ = 0;
    private m_consumerX = 0;
    private m_consumerY = 0;
    /** Decoder-owned cross-tile registry (id-sorted flat view). */
    private m_registryProvider: (() => ElevationTiledFeature[]) | null = null;
    /** Merged cross-tile curves by feature id (mgl mergedFeatureCache). */
    private m_mergedCache: Map<number, MBElevationFeature> = new Map();
    private m_unevaluatedPortals: MBElevationPortalGraph | null = null;

    constructor(z = 0, x = 0, y = 0) {
        this.m_consumerZ = z;
        this.m_consumerX = x;
        this.m_consumerY = y;
    }

    /** Wire the decoder's cross-tile elevation registry. */
    setRegistryProvider(provider: () => ElevationTiledFeature[]): void {
        this.m_registryProvider = provider;
    }

    /** Set the meters→extent-units factor (tessellation + subdivision). */
    setMetersToTile(metersToTile: number): void {
        this.m_metersToTile = metersToTile > 0 ? metersToTile : 1;
    }

    /** Feed one decoded `hd_road_elevation` feature (decoder intercept). */
    addRawFeature(f: RawElevationFeature): boolean {
        this.hasPayload = true;
        this.m_layerExtent = f.layerExtent;
        const vertex = parseElevationVertex(f);
        if (vertex) {
            this.m_vertices.push(vertex);
            return true;
        }
        const meta = parseElevationMeta(f);
        if (meta) {
            this.m_meta.push(meta);
            return true;
        }
        return false;
    }

    /** Assemble curves once all raw features of the tile are collected. */
    finalize(metersToTile?: number): void {
        if (metersToTile !== undefined) this.setMetersToTile(metersToTile);
        // Sort by (id, idx) then dedupe — mirrors ElevationFeatures.parseFrom.
        const vertices = this.m_vertices.slice()
            .sort((a, b) => a.id - b.id || a.idx - b.idx);
        const deduped: ElevationCurveVertex[] = [];
        for (const v of vertices) {
            const last = deduped[deduped.length - 1];
            if (!last || last.id !== v.id || last.idx !== v.idx) deduped.push(v);
        }
        const metas = this.m_meta.slice().sort((a, b) => a.id - b.id);

        let vCurrent = 0;
        const vEnd = deduped.length;
        this.features = [];

        for (const meta of metas) {
            if (meta.constantHeight != null) {
                this.features.push(new MBElevationFeature(
                    meta.id,
                    { minX: meta.bounds[0], minY: meta.bounds[1], maxX: meta.bounds[2], maxY: meta.bounds[3] },
                    meta.constantHeight,
                ));
                continue;
            }

            while (vCurrent !== vEnd && deduped[vCurrent].id < meta.id) vCurrent++;
            if (vCurrent === vEnd || deduped[vCurrent].id !== meta.id) continue;

            const outVertices = [];
            const outEdges = [];
            const vFirst = vCurrent;

            while (vCurrent !== vEnd && deduped[vCurrent].id === meta.id) {
                const v = deduped[vCurrent];
                outVertices.push({ x: v.x, y: v.y, height: v.height, extent: v.extent, index: v.idx });
                if (vCurrent !== vFirst && deduped[vCurrent - 1].idx === v.idx - 1) {
                    const idx = vCurrent - vFirst;
                    outEdges.push({ a: idx - 1, b: idx });
                }
                vCurrent++;
            }

            this.features.push(new MBElevationFeature(
                meta.id,
                { minX: meta.bounds[0], minY: meta.bounds[1], maxX: meta.bounds[2], maxY: meta.bounds[3] },
                undefined,
                outVertices,
                outEdges,
                this.m_metersToTile,
            ));
        }
    }

    /** Whether the tile carries any assembled elevation curves. */
    get isEmpty(): boolean {
        return this.features.length === 0;
    }

    /**
     * Resolve the elevation curve a road feature references: same tile
     * first; otherwise the cross-tile registry provides ancestor/
     * descendant parts which are merged into THIS tile's frame (mgl
     * `handleFeature` mergedFeatureCache path). Returns undefined when the
     * id has no curve available.
     */
    resolveElevation(properties: Record<string, unknown> | undefined): MBElevationFeature | undefined {
        const local = getElevationFeature(properties, this.features);
        if (local) return local;

        const registry = this.m_registryProvider?.() ?? [];
        const parts = getOverlappingElevationParts(
            properties, registry, this.m_consumerZ, this.m_consumerX, this.m_consumerY);
        if (parts.length === 0) return undefined;

        const id = parts[0].feature.id;
        const cached = this.m_mergedCache.get(id);
        if (cached) return cached;

        const merged = mergeElevationFeatures(
            this.m_consumerZ, this.m_consumerX, this.m_consumerY,
            this.m_metersToTile, parts);
        this.m_mergedCache.set(id, merged);
        return merged;
    }

    /**
     * Subdivide a fill's rings along the resolved curve and sample
     * per-vertex heights. Rings are in the CONSUMER LAYER's extent units
     * (`tileExtent` = that extent); curve space is the canonical 4096
     * grid — inputs are converted in, results are converted BACK to
     * extent units so callers can project directly. Returns null when the
     * feature references no available curve.
     *
     * Tile clipping mirrors mgl `clipPolygonsToTile(ELEVATION_CLIP_MARGIN)`
     * and subdivision mirrors `prepareElevatedPolygons`.
     */
    prepareFillGeometry(
        properties: Record<string, unknown> | undefined,
        rings: ClipPoint[][],
        isMarkup: boolean,
        tileExtent: number,
    ): FillElevationPlan | null {
        const feature = this.resolveElevation(properties);
        if (!feature) return null;

        const scale = tileExtent > 0 && tileExtent !== ELEVATION_EXTENT
            ? ELEVATION_EXTENT / tileExtent : 1;
        const inv = 1 / scale;
        const canonRings = scale === 1
            ? rings
            : rings.map(r => r.map(p => ({ x: p.x * scale, y: p.y * scale })));

        // mgl clips the original polygons to the tile ± margin BEFORE
        // portals/subdivision, exterior ring first.
        const clipped: ClipPoint[][] = [];
        for (const ring of canonRings) {
            const kept = clipRingToBox(ring, ELEVATION_EXTENT, ELEVATION_CLIP_MARGIN);
            if (kept) clipped.push(kept);
        }
        if (clipped.length === 0) return null;

        const bias = isMarkup ? MARKUP_ELEVATION_BIAS : 0;
        const edges = feature.constantHeight != null
            ? []
            : feature.getSubdivisionEdges(this.m_metersToTile);
        const sample = (p: ClipPoint): number =>
            this.biased(feature.pointElevation(p.x, p.y), bias);

        const back = (ring: ClipPoint[]): ClipPoint[] =>
            scale === 1 ? ring : ring.map(p => ({ x: p.x * inv, y: p.y * inv }));

        const pieces: FillElevationPiece[] = [];

        if (feature.constantHeight != null || edges.length === 0) {
            const h = feature.pointElevation(clipped[0][0].x, clipped[0][0].y);
            pieces.push({
                ring: back(clipped[0]),
                heights: clipped[0].map(() => this.biased(h, bias)),
                holes: clipped.slice(1).map(ring => ({
                    ring: back(ring),
                    heights: ring.map(() => this.biased(h, bias)),
                })),
            });
            return {
                feature, isTunnel: feature.isTunnel(),
                pieces,
                clippedRings: clipped.map(back),
            };
        }

        // Subdivide the exterior; subdivide each hole with the same edges
        // and re-attach it to the exterior piece containing it.
        const exteriorPieces = polygonSubdivision([clipped[0]], edges as SubdivisionEdge[]);
        const holePieces = clipped.slice(1).map(ring => polygonSubdivision([ring], edges as SubdivisionEdge[]));

        for (const piece of exteriorPieces) {
            const holes: FillElevationPiece['holes'] = [];
            for (const parts of holePieces) {
                for (const part of parts) {
                    if (pointInRing(part[0], piece)) {
                        holes.push({ ring: back(part), heights: part.map(sample) });
                    }
                }
            }
            pieces.push({ ring: back(piece), heights: piece.map(sample), holes });
        }

        if (pieces.length === 0) return null;
        return {
            feature, isTunnel: feature.isTunnel(),
            pieces,
            clippedRings: clipped.map(back),
        };
    }

    /**
     * Subdivide a polyline along the resolved curve and sample per-point
     * heights (mgl `prepareElevatedLines` + per-vertex zOffset attribute).
     * Points are in the consumer layer's extent units. Returns null when
     * the feature references no available curve.
     */
    prepareLineGeometry(
        properties: Record<string, unknown> | undefined,
        points: ClipPoint[],
        isMarkup: boolean,
        tileExtent: number,
    ): LineElevationPlan | null {
        const feature = this.resolveElevation(properties);
        if (!feature || points.length < 2) return null;

        const scale = tileExtent > 0 && tileExtent !== ELEVATION_EXTENT
            ? ELEVATION_EXTENT / tileExtent : 1;
        const inv = 1 / scale;
        const canonical = scale === 1
            ? points
            : points.map(p => ({ x: p.x * scale, y: p.y * scale }));

        const bias = isMarkup ? MARKUP_ELEVATION_BIAS : 0;
        // Results convert back to extent units so the caller projects them
        // in its own frame.
        const back = (p: ClipPoint): ClipPoint =>
            scale === 1 ? p : { x: p.x * inv, y: p.y * inv };

        if (feature.constantHeight != null) {
            const h = this.biased(feature.constantHeight, bias);
            return { feature, points: canonical.map(back), heights: canonical.map(() => h) };
        }

        const edges = feature.getSubdivisionEdges(this.m_metersToTile);
        const out: ClipPoint[][] = [];
        lineSubdivision(canonical, edges, out);
        if (out.length === 0) return null;

        const merged: ClipPoint[] = [];
        const heights: number[] = [];
        for (const line of out) {
            for (const p of line) {
                const last = merged[merged.length - 1];
                if (last && last.x === p.x && last.y === p.y) continue;
                merged.push(p);
                heights.push(this.biased(feature.pointElevation(p.x, p.y), bias));
            }
        }
        if (merged.length < 2) return null;
        return { feature, points: merged.map(back), heights };
    }

    /**
     * Sample the referenced curve at a point given in CANONICAL elevation
     * extent units. Returns the biased height for markup layers.
     */
    sampleHeightCanonical(
        properties: Record<string, unknown> | undefined,
        x: number, y: number, isMarkup: boolean,
    ): number | undefined {
        const feature = this.resolveElevation(properties);
        if (!feature) return undefined;
        return this.biased(feature.pointElevation(x, y), isMarkup ? MARKUP_ELEVATION_BIAS : 0);
    }

    /** Tunnel classification of a feature via its curve's height range. */
    isTunnelFeature(properties: Record<string, unknown> | undefined): boolean {
        const feature = this.resolveElevation(properties);
        return feature ? feature.isTunnel() : false;
    }

    /**
     * Record portal candidates from a fill's exterior ring (mgl
     * `addPortalCandidates`): every exterior edge is a candidate; edges
     * whose endpoints rest at ground level become `entrance` portals,
     * edges on the tile border become `border` portals.
     */
    addPortalCandidates(
        id: number,
        exterior: ClipPoint[],
        isTunnel: boolean,
        elevation: MBElevationFeature,
    ): void {
        if (!this.m_unevaluatedPortals) {
            this.m_unevaluatedPortals = new MBElevationPortalGraph();
        }

        const n = exterior.length >= 2 &&
            exterior[0].x === exterior[exterior.length - 1].x &&
            exterior[0].y === exterior[exterior.length - 1].y
            ? exterior.length - 1
            : exterior.length;
        if (n < 2) return;

        for (let i = 0; i < n; i++) {
            const a = exterior[i];
            const b = exterior[(i + 1) % n];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (length === 0) continue;

            let type: ElevationPortalType = 'unevaluated';
            const ha = elevation.pointElevation(a.x, a.y);
            const hb = elevation.pointElevation(b.x, b.y);
            const onGround = Math.abs(ha) < 0.01 && Math.abs(hb) < 0.01;
            if (onGround) {
                type = 'entrance';
            } else if (this.isOnBorder(a.x, b.x) || this.isOnBorder(a.y, b.y)) {
                type = 'border';
            }

            const portal: ElevationPortalEdge = {
                connection: { a: id, b: undefined },
                vaX: a.x, vaY: a.y, vbX: b.x, vbY: b.y,
                length,
                hash: portalEdgeHash(a.x, a.y, b.x, b.y),
                isTunnel,
                type,
            };
            this.m_unevaluatedPortals.addPortal(portal);
        }
    }

    /**
     * Evaluate the tile's portal graph from all collected candidates
     * (mgl `evaluatePortalGraphs` — runs after every contributing fill of
     * the tile has been processed).
     */
    evaluatePortals(): MBElevationPortalGraph {
        this.evaluatedPortals = this.m_unevaluatedPortals
            ? MBElevationPortalGraph.evaluate([this.m_unevaluatedPortals])
            : new MBElevationPortalGraph();
        return this.evaluatedPortals;
    }

    get unevaluatedPortals(): MBElevationPortalGraph | null {
        return this.m_unevaluatedPortals;
    }

    private biased(h: number, bias: number): number {
        if (bias <= 0) return h;
        const stepHeight = h >= 0 ? h : Math.abs(0.5 * h);
        return h + bias * smoothstep(0, bias, stepHeight);
    }

    private isOnBorder(a: number, b: number): boolean {
        return (a <= 0 && b <= 0) || (a >= ELEVATION_EXTENT && b >= ELEVATION_EXTENT);
    }
}

function smoothstep(a: number, b: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** Even-odd containment test for a closed ring. */
function pointInRing(p: ClipPoint, ring: ClipPoint[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i].x, yi = ring[i].y;
        const xj = ring[j].x, yj = ring[j].y;
        if (((yi > p.y) !== (yj > p.y)) &&
            (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}
