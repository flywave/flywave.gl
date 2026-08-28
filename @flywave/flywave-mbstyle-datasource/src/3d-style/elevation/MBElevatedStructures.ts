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
import earcut from 'earcut';

/** mgl TUNNEL_ENTERANCE_HEIGHT: wall/entrance rise above the tunnel roof. */
const TUNNEL_ENTERANCE_HEIGHT_METERS = 4.0;

interface ElevatedEdge {
    polygonIdx: number;
    a: number;
    b: number;
    hash: string;
    portalHash: string;
    isTunnel: boolean;
    type: ElevationPortalType;
    featureIndex: number;
    guardRailEnabled: boolean;
}

type Vec3 = [number, number, number];

interface MeshBuilder {
    positions: number[];
    normals: number[];
    indices: number[];
    vertexLookup: Map<string, number>;
}

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
    /** Same pieces in canonical extent space (structures mesh frame). */
    piecesCanonical: CanonicalPiece[];
    /** Clipped pre-subdivision rings in canonical space (portal hashing). */
    clippedRingsCanonical: ClipPoint[][];
}

export interface LineElevationPlan {
    feature: MBElevationFeature;
    /** Subdivided points with sampled heights (markup bias applied). */
    points: ClipPoint[];
    heights: number[];
}

/**
 * One subdivided piece in CANONICAL extent space (structures mesh frame —
 * portal/edge hashes must match between candidates and renderable edges).
 * Heights are pre-sampled meters (markup bias already applied when the
 * plan was built with it).
 */
export interface CanonicalPiece {
    ring: ClipPoint[];
    ringHeights: number[];
    holes: ClipPoint[][];
    holeHeights: number[][];
}

/** Constructed elevated-structures mesh (mgl `ElevatedStructures.construct`). */
export interface ElevatedStructuresMesh {
    /** Flat vertex stream: x, y (canonical extent), z (meters). */
    positions: number[];
    /** Per-vertex unit normals (x, y, z; +z up in extent space). */
    normals: number[];
    indices: number[];
    /** Index offset where the tunnel segment begins (rails first). */
    tunnelStart: number;
    /** Per-feature vertex sections for data-driven structure colors. */
    bridgeSections: Array<{ featureIndex: number; vertexStart: number }>;
    tunnelSections: Array<{ featureIndex: number; vertexStart: number }>;
    /** §515 depth prepass: tunnel structures + all roads (real depth). */
    depthIndices: number[];
    /** §515 depth prepass: tunnel structures + non-tunnel roads (holes). */
    maskIndices: number[];
    /** Any contributed feature samples below the ground plane. */
    underground: boolean;
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

    // ---- elevated structures mesh state (mgl ElevatedStructures) ----
    private m_unevalPositions: number[] = [];
    private m_unevalHeights: number[] = [];
    private m_unevalTriangles: number[] = [];
    private m_unevalTunnelTriangles: number[] = [];
    private m_unevalEdges: ElevatedEdge[] = [];
    /** Any sampled road height dips to/below the ground plane (mgl heightRange). */
    private m_underground = false;
    /** §516: consumer key of this tile (for the deferred-curve report). */
    private m_consumerKey = '';
    /** Exterior-vertex posHash → hashes of the edges it connects (mgl vertexHashLookup). */
    private m_vertexHashLookup: Map<number, { prev: string; next: string }> = new Map();

    constructor(z = 0, x = 0, y = 0) {
        this.m_consumerZ = z;
        this.m_consumerX = x;
        this.m_consumerY = y;
        this.m_consumerKey = `${z}-${x}-${y}`;
    }

    /**
     * §516: features here referenced a curve that was not available at
     * decode time (mgl hasDeferredElevationFeatures) — the tile must be
     * re-decoded once the registry grows. Keys accumulate until taken.
     */
    takeDeferredKeys(): string[] {
        const out = [...this.m_deferredKeys];
        this.m_deferredKeys.clear();
        return out;
    }
    private m_deferredKeys: Set<string> = new Set();

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
        if (parts.length === 0) {
            if (properties?.['3d_elevation_id'] !== undefined) {
                this.m_deferredKeys.add(this.m_consumerKey);
            }
            return undefined;
        }

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
        const piecesCanonical: CanonicalPiece[] = [];

        if (feature.constantHeight != null || edges.length === 0) {
            const h = feature.pointElevation(clipped[0][0].x, clipped[0][0].y);
            const heightsAll = clipped[0].map(() => this.biased(h, bias));
            pieces.push({
                ring: back(clipped[0]),
                heights: heightsAll,
                holes: clipped.slice(1).map(ring => ({
                    ring: back(ring),
                    heights: ring.map(() => this.biased(h, bias)),
                })),
            });
            piecesCanonical.push({
                ring: clipped[0],
                ringHeights: heightsAll,
                holes: clipped.slice(1),
                holeHeights: clipped.slice(1).map(ring => ring.map(() => this.biased(h, bias))),
            });
            return {
                feature, isTunnel: feature.isTunnel(),
                pieces,
                piecesCanonical,
                clippedRings: clipped.map(back),
                clippedRingsCanonical: clipped,
            };
        }

        // Subdivide the exterior; subdivide each hole with the same edges
        // and re-attach it to the exterior piece containing it.
        const exteriorPieces = polygonSubdivision([clipped[0]], edges as SubdivisionEdge[]);
        const holePieces = clipped.slice(1).map(ring => polygonSubdivision([ring], edges as SubdivisionEdge[]));

        for (const piece of exteriorPieces) {
            const holes: FillElevationPiece['holes'] = [];
            const holesCanonical: ClipPoint[][] = [];
            const holeHeightsCanonical: number[][] = [];
            for (const parts of holePieces) {
                for (const part of parts) {
                    if (pointInRing(part[0], piece)) {
                        const hs = part.map(sample);
                        holes.push({ ring: back(part), heights: hs });
                        holesCanonical.push(part);
                        holeHeightsCanonical.push(hs);
                    }
                }
            }
            const ringHeights = piece.map(sample);
            pieces.push({ ring: back(piece), heights: ringHeights, holes });
            piecesCanonical.push({
                ring: piece,
                ringHeights,
                holes: holesCanonical,
                holeHeights: holeHeightsCanonical,
            });
        }

        if (pieces.length === 0) return null;
        return {
            feature, isTunnel: feature.isTunnel(),
            pieces,
            piecesCanonical,
            clippedRings: clipped.map(back),
            clippedRingsCanonical: clipped,
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

        // Rebuild the per-feature vertex → adjacent edge hashes table (mgl
        // vertexHashLookup in addPortalCandidates) — addRenderableRing uses
        // it to propagate the ORIGINAL edge hash (portalHash) through
        // geometry later split by subdivision.
        this.m_vertexHashLookup.clear();
        let prevEdgeHash = edgeHashOf(exterior[n - 1], exterior[0]);
        void prevEdgeHash;

        for (let i = 0; i < n; i++) {
            const a = exterior[i];
            const b = exterior[(i + 1) % n];
            const length = Math.hypot(b.x - a.x, b.y - a.y);
            if (length === 0) continue;

            const edgeHash = edgeHashOf(a, b);
            this.m_vertexHashLookup.set(posHashOf(a), { prev: prevEdgeHash, next: edgeHash });
            prevEdgeHash = edgeHash;

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

    // ------------------------------------------------------------------
    // Elevated structures mesh (mgl ElevatedStructures.construct)
    // ------------------------------------------------------------------

    /**
     * Feed one hd-road-base feature's subdivided geometry into the
     * structures mesh state (mgl addVertices + addTriangles +
     * addRenderableRing, driven by FillBucket.addGeometry). Pieces are in
     * canonical extent space with pre-sampled heights in meters; portal
     * candidates must have been added for this feature FIRST (the render
     * hash propagation reads the vertex lookup built there).
     */
    addElevatedFeature(params: {
        featureIndex: number;
        guardRailEnabled: boolean;
        isTunnel: boolean;
        pieces: CanonicalPiece[];
    }): void {
        const { featureIndex, guardRailEnabled, isTunnel, pieces } = params;
        for (const piece of pieces) {
            for (const h of piece.ringHeights) {
                if (h < 1.0) this.m_underground = true;  // mgl heightMargin 1.0
            }
            const rings: Array<{ ring: ClipPoint[]; heights: number[] }> = [
                { ring: piece.ring, heights: piece.ringHeights },
                ...piece.holes.map((h, i) => ({ ring: h, heights: piece.holeHeights[i] ?? [] })),
            ];
            const flattened: number[] = [];
            const holeIndices: number[] = [];
            const ringRanges: Array<[number, number]> = [];

            for (const { ring, heights } of rings) {
                const open = ring.length >= 2 &&
                    ring[0].x === ring[ring.length - 1].x &&
                    ring[0].y === ring[ring.length - 1].y
                    ? ring.slice(0, ring.length - 1)
                    : ring;
                if (open.length < 3) continue;
                const start = flattened.length / 2;
                for (let i = 0; i < open.length; i++) {
                    flattened.push(open[i].x, open[i].y);
                    this.m_unevalPositions.push(open[i].x, open[i].y);
                    this.m_unevalHeights.push(heights[i] ?? 0);
                }
                if (start > 0) holeIndices.push(start);
                ringRanges.push([start, open.length]);
            }
            if (ringRanges.length === 0) continue;

            const tri = earcut(flattened, holeIndices.length > 0 ? holeIndices : null, 2);
            const vOffset = this.m_unevalHeights.length - flattened.length / 2;
            const outTriangles = isTunnel ? this.m_unevalTunnelTriangles : this.m_unevalTriangles;
            for (const idx of tri) outTriangles.push(idx + vOffset);

            for (const [offset, count] of ringRanges) {
                this.addRenderableRing(
                    featureIndex, vOffset + offset, count, isTunnel, guardRailEnabled);
            }
        }
    }

    /**
     * Build the structures mesh from all collected features (mgl
     * `construct`): bridge guard rails over non-shared edges, tunnel walls
     * under every edge of the road, and double-sided tunnel entrances.
     * Returns null when the tile collected no elevated geometry.
     */
    construct(): ElevatedStructuresMesh | null {
        if (this.m_unevalPositions.length === 0) return null;
        this.evaluatePortals();
        const portals = this.evaluatedPortals?.portals ?? [];

        this.prepareEdges(portals, this.m_unevalEdges);

        const positions: number[] = [];
        const normals: number[] = [];
        const indices: number[] = [];
        const bridgeSections: Array<{ featureIndex: number; vertexStart: number }> = [];
        const tunnelSections: Array<{ featureIndex: number; vertexStart: number }> = [];
        const builder: MeshBuilder = { positions, normals, indices, vertexLookup: new Map() };

        const partition = (edges: ElevatedEdge[], type: ElevationPortalType): number => {
            edges.sort((a, b) => {
                if (a.type === type && b.type !== type) return -1;
                if (a.type !== type && b.type === type) return 1;
                return 0;
            });
            const idx = edges.findIndex(e => e.type !== type);
            return idx >= 0 ? idx : edges.length;
        };

        let wallEndIdx = 0;
        if (this.m_unevalEdges.length > 0) {
            wallEndIdx = partition(this.m_unevalEdges, 'none');
            this.constructBridgeStructures(builder, wallEndIdx, bridgeSections);
        }

        const tunnelStart = indices.length;
        const tunnelQuadStart = indices.length;
        if (this.m_unevalEdges.length > 0) {
            const afterWallEnd = this.m_unevalEdges.splice(wallEndIdx);
            const tunnelEndIdx = partition(afterWallEnd, 'tunnel') + wallEndIdx;
            this.m_unevalEdges.push(...afterWallEnd);
            this.constructTunnelStructures(
                builder, { min: 0, max: wallEndIdx }, { min: wallEndIdx, max: tunnelEndIdx },
                tunnelSections);
        }
        const tunnelQuadEnd = indices.length;

        // §515 depth-prepass index sets (mgl drawDepthPrepass):
        //  - depth = tunnel structures + ALL road triangles (real depth);
        //  - mask  = tunnel structures + NON-tunnel roads — flattened to the
        //    ground plane with GREATER depth mode these carve the
        //    "see-through" holes so tunnels read as sunken 3D forms.
        const tunnelQuads = indices.slice(tunnelQuadStart, tunnelQuadEnd);
        const depthIndices = [
            ...tunnelQuads, ...this.m_unevalTriangles, ...this.m_unevalTunnelTriangles,
        ];
        const maskIndices = [...tunnelQuads, ...this.m_unevalTriangles];

        if (indices.length === 0 && depthIndices.length === 0) return null;
        return {
            positions, normals, indices, tunnelStart, bridgeSections, tunnelSections,
            depthIndices, maskIndices, underground: this.m_underground,
        };
    }

    /**
     * Prune shared edges and classify survivors against the evaluated
     * portal graph (mgl prepareEdges).
     */
    private prepareEdges(portals: ElevationPortalEdge[], edges: ElevatedEdge[]): void {
        if (edges.length === 0) return;

        edges.sort((a, b) => (a.hash === b.hash
            ? b.polygonIdx - a.polygonIdx
            : b.hash > a.hash ? 1 : -1));

        let begin = 0;
        let end = 0;
        let out = 0;
        let polygonIdx = edges[begin].polygonIdx;

        do {
            end++;
            if (end === edges.length || edges[begin].hash !== edges[end].hash) {
                const occurrences = end - begin;
                const differentOwner = edges[end - 1].polygonIdx !== polygonIdx;
                if (occurrences === 1 || differentOwner) {
                    if (out < begin) {
                        edges[out] = edges[begin];
                    }
                    edges[out].type = 'none';
                    out++;
                }
                begin = end;
                if (begin !== edges.length) {
                    polygonIdx = edges[begin].polygonIdx;
                }
            }
        } while (begin !== edges.length);

        edges.splice(out);

        // Classify surviving edges by portal hash against the evaluated graph.
        if (edges.length !== 0 && portals.length !== 0) {
            const sortedPortals = portals.slice().sort((a, b) => (a.hash < b.hash ? 1 : -1));
            edges.sort((a, b) => (a.portalHash < b.portalHash ? 1 : -1));

            let eIndex = 0;
            let pIndex = 0;
            while (eIndex !== edges.length && pIndex !== sortedPortals.length) {
                const edge = edges[eIndex];
                const portal = sortedPortals[pIndex];
                if (edge.portalHash > portal.hash) {
                    eIndex++;
                } else if (portal.hash > edge.portalHash) {
                    pIndex++;
                } else {
                    edge.type = portal.type;
                    eIndex++;
                }
            }
        }
    }

    /**
     * Bridge guard rails along non-shared road edges (mgl
     * constructBridgeStructures): outer/top/inner strips around a 0.5 m
     * cross-section, plus end caps at terminal vertices near the ground.
     */
    private constructBridgeStructures(
        builder: MeshBuilder, edgeEnd: number,
        sections: Array<{ featureIndex: number; vertexStart: number }>,
    ): void {
        builder.vertexLookup.clear();
        const vertices = this.m_unevalPositions;
        const heights = this.m_unevalHeights;
        const edges = this.m_unevalEdges;

        const connectivity = this.computeVertexConnections(edges, 0, edgeEnd);
        const metersToTile = this.m_metersToTile;
        const scale = 0.5 * metersToTile;

        let lastFeatureIndex = Number.POSITIVE_INFINITY;

        // Feature order reduces vertex-binder fragmentation (mgl sorts too).
        const range = edges.slice(0, edgeEnd);
        range.sort((a, b) => a.featureIndex - b.featureIndex);

        for (const edge of range) {
            if (!edge.guardRailEnabled) continue;

            const pts = prepareEdgePoints(vertices, heights, edge, (a, b) => a > b);
            if (!pts) continue;
            const [pa, pb] = pts;

            const va: Vec3 = [pa.x, pa.y, metersToTile * pa.h];
            const vb: Vec3 = [pb.x, pb.y, metersToTile * pb.h];
            if (va[0] === vb[0] && va[1] === vb[1] && va[2] === vb[2]) continue;

            const dir = norm3(sub3(vb, va));
            const aFwd = this.computeFwd(connectivity, vertices, heights, edge.a, metersToTile) || dir;
            const bFwd = this.computeFwd(connectivity, vertices, heights, edge.b, metersToTile) || dir;

            const aLeft = norm3([aFwd[1], -aFwd[0], 0]);
            const bLeft = norm3([bFwd[1], -bFwd[0], 0]);
            const aUp = norm3(cross3(aLeft, aFwd));
            const bUp = norm3(cross3(bLeft, bFwd));

            // Cross-section: outer, top, inner points + the road vertex.
            const aV: Vec3[] = [
                add3(va, scale3(sub3(aLeft, aUp), scale)),
                add3(va, scale3(add3(aLeft, aUp), scale)),
                add3(va, scale3(aUp, scale)),
                va,
            ];
            const bV: Vec3[] = [
                add3(vb, scale3(sub3(bLeft, bUp), scale)),
                add3(vb, scale3(add3(bLeft, bUp), scale)),
                add3(vb, scale3(bUp, scale)),
                vb,
            ];

            if (edge.featureIndex !== lastFeatureIndex) {
                lastFeatureIndex = edge.featureIndex;
                sections.push({ featureIndex: edge.featureIndex, vertexStart: builder.positions.length / 3 });
                builder.vertexLookup.clear();
            }

            // Cross-sections are built in tile units (mgl toTileVec);
            // emit with z converted back to METERS (mgl addVertex's
            // tileToMeters argument) so the mesh shares one z unit.
            const m = (v: Vec3, n: Vec3): number =>
                addVertex(builder, [v[0], v[1], v[2] / metersToTile], n);

            // Outer side
            quad(builder,
                m(aV[0], aLeft), m(aV[1], aLeft),
                m(bV[0], bLeft), m(bV[1], bLeft));
            // Top side
            quad(builder,
                m(aV[1], aUp), m(aV[2], aUp),
                m(bV[1], bUp), m(bV[2], bUp));
            // Inner side
            quad(builder,
                m(aV[2], neg3(aLeft)), m(aV[3], neg3(aLeft)),
                m(bV[2], neg3(bLeft)), m(bV[3], neg3(bLeft)));

            // End caps at terminal vertices that sit near the ground.
            const aTerminal = isTerminalVertex(connectivity, posHashOf({ x: vertices[edge.a * 2], y: vertices[edge.a * 2 + 1] }));
            const bTerminal = isTerminalVertex(connectivity, posHashOf({ x: vertices[edge.b * 2], y: vertices[edge.b * 2 + 1] }));
            if (pa.h < 0.01 && aTerminal) {
                quad(builder,
                    m(aV[3], neg3(aFwd)), m(aV[2], neg3(aFwd)),
                    m(aV[1], neg3(aFwd)), m(aV[0], neg3(aFwd)));
            }
            if (pb.h < 0.01 && bTerminal) {
                quad(builder,
                    m(bV[0], bFwd), m(bV[1], bFwd),
                    m(bV[2], bFwd), m(bV[3], bFwd));
            }
        }
    }

    /**
     * Tunnel walls under the road edges + double-sided entrances (mgl
     * constructTunnelStructures). Heights stay in meters.
     */
    private constructTunnelStructures(
        builder: MeshBuilder,
        wallRange: { min: number; max: number },
        entranceRange: { min: number; max: number },
        sections: Array<{ featureIndex: number; vertexStart: number }>,
    ): void {
        builder.vertexLookup.clear();
        const vertices = this.m_unevalPositions;
        const heights = this.m_unevalHeights;
        const edges = this.m_unevalEdges;
        const entranceHeight = TUNNEL_ENTERANCE_HEIGHT_METERS;
        let lastFeatureIndex = Number.POSITIVE_INFINITY;

        const section = (featureIndex: number): void => {
            if (featureIndex !== lastFeatureIndex) {
                lastFeatureIndex = featureIndex;
                sections.push({ featureIndex, vertexStart: builder.positions.length / 3 });
                builder.vertexLookup.clear();
            }
        };

        // Underground walls for every edge (below-ground part only).
        for (let i = wallRange.min; i < wallRange.max; i++) {
            const pts = prepareEdgePoints(vertices, heights, edges[i], (a, b) => a < b);
            if (!pts) continue;
            const [a, b] = pts;
            const n = norm3([-(b.y - a.y), b.x - a.x, 0]);
            section(edges[i].featureIndex);
            const topB = edges[i].isTunnel ? b.h + entranceHeight : 0;
            const topA = edges[i].isTunnel ? a.h + entranceHeight : 0;
            quad(builder,
                addVertex(builder, [a.x, a.y, a.h], n),
                addVertex(builder, [b.x, b.y, b.h], n),
                addVertex(builder, [b.x, b.y, topB], n),
                addVertex(builder, [a.x, a.y, topA], n));
        }

        // Entrances from tunnel-flagged edges (double-sided).
        for (let i = entranceRange.min; i < entranceRange.max; i++) {
            const edge = edges[i];
            if (edge.isTunnel) {
                const t = edge.a; edge.a = edge.b; edge.b = t;
            }
            const ax = vertices[edge.a * 2], ay = vertices[edge.a * 2 + 1];
            const bx = vertices[edge.b * 2], by = vertices[edge.b * 2 + 1];
            const n = norm3([-(by - ay), bx - ax, 0]);
            section(edge.featureIndex);
            const ha = heights[edge.a];
            const hb = heights[edge.b];
            // Two quads == double sided.
            quad(builder,
                addVertex(builder, [bx, by, 0], n),
                addVertex(builder, [ax, ay, 0], n),
                addVertex(builder, [ax, ay, ha + entranceHeight], n),
                addVertex(builder, [bx, by, hb + entranceHeight], n));
            quad(builder,
                addVertex(builder, [ax, ay, 0], n),
                addVertex(builder, [bx, by, 0], n),
                addVertex(builder, [bx, by, hb + entranceHeight], n),
                addVertex(builder, [ax, ay, ha + entranceHeight], n));
        }
    }

    /**
     * Renderable boundary edges of one ring (mgl addRenderableRing):
     * border-touching edges are skipped; edges inherit the portal hash of
     * the ORIGINAL (pre-subdivision) edge via the vertex lookup.
     */
    private addRenderableRing(
        polygonIdx: number, vertexOffset: number, count: number,
        isTunnel: boolean, guardRailEnabled: boolean,
    ): void {
        const vertices = this.m_unevalPositions;
        // The stored ring is OPEN (closing duplicate stripped) — all count
        // edges wrap. (mgl loops count-1 because its rings keep the dup.)
        for (let i = 0; i < count; i++) {
            const ai = vertexOffset + i;
            const bi = vertexOffset + ((i + 1) % count);
            const vax = vertices[ai * 2], vay = vertices[ai * 2 + 1];
            const vbx = vertices[bi * 2], vby = vertices[bi * 2 + 1];

            if (this.isOnBorder(vax, vbx) || this.isOnBorder(vay, vby)) continue;

            const va = { x: vax, y: vay };
            const vb = { x: vbx, y: vby };
            const edgeHash = edgeHashOf(va, vb);
            let portalHash = this.m_vertexHashLookup.get(posHashOf(va))?.next
                ?? this.m_vertexHashLookup.get(posHashOf(vb))?.prev
                ?? edgeHash;

            this.m_unevalEdges.push({
                polygonIdx, a: ai, b: bi, hash: edgeHash, portalHash,
                isTunnel, type: 'unevaluated',
                featureIndex: polygonIdx, guardRailEnabled,
            });
        }
    }

    private computeVertexConnections(
        edges: ElevatedEdge[], start: number, end: number,
    ): Map<number, { from?: number; to?: number }> {
        const map = new Map<number, { from?: number; to?: number }>();
        const vertices = this.m_unevalPositions;
        const heights = this.m_unevalHeights;
        for (let i = start; i < end; i++) {
            const edge = edges[i];
            const aHash = posHashOf({ x: vertices[edge.a * 2], y: vertices[edge.a * 2 + 1] });
            const bHash = posHashOf({ x: vertices[edge.b * 2], y: vertices[edge.b * 2 + 1] });
            let pA = map.get(aHash);
            if (!pA) { pA = {}; map.set(aHash, pA); }
            let pB = map.get(bHash);
            if (!pB) { pB = {}; map.set(bHash, pB); }
            // No rail connectivity across ground-level edges (mgl).
            if (heights[edge.a] <= 0 && heights[edge.b] <= 0) continue;
            pA.to = edge.b;
            pB.from = edge.a;
        }
        return map;
    }

    private computeFwd(
        connectivity: Map<number, { from?: number; to?: number }>,
        vertices: number[], heights: number[], vIdx: number, metersToTile: number,
    ): Vec3 | undefined {
        const conn = connectivity.get(posHashOf({ x: vertices[vIdx * 2], y: vertices[vIdx * 2 + 1] }));
        if (!conn) return undefined;
        const from = conn.from;
        const to = conn.to;
        if (from === undefined || to === undefined) return undefined;

        const fromV: Vec3 = [vertices[from * 2], vertices[from * 2 + 1], heights[from] * metersToTile];
        const midV: Vec3 = [vertices[vIdx * 2], vertices[vIdx * 2 + 1], heights[vIdx] * metersToTile];
        const toV: Vec3 = [vertices[to * 2], vertices[to * 2 + 1], heights[to] * metersToTile];

        let fwd: Vec3 = [0, 0, 0];
        if (!eq3(fromV, midV)) fwd = add3(fwd, norm3(sub3(midV, fromV)));
        if (!eq3(toV, midV)) fwd = add3(fwd, norm3(sub3(toV, midV)));
        const len = len3(fwd);
        return len > 0 ? scale3(fwd, 1 / len) : undefined;
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

// ---------------------------------------------------------------------------
// Structures mesh helpers (mgl ElevatedStructures statics + MeshBuilder)
// ---------------------------------------------------------------------------

/** mgl computePosHash: 16-bit truncating coordinate hash. */
function posHashOf(p: ClipPoint): number {
    const x = Math.round(p.x) & 0xFFFF;
    const y = Math.round(p.y) & 0xFFFF;
    return ((x << 16) | y) >>> 0;
}

/** mgl computeEdgeHash: order-independent pair hash, string form. */
function edgeHashOf(pa: ClipPoint, pb: ClipPoint): string {
    if ((pa.y === pb.y && pa.x > pb.x) || pa.y > pb.y) {
        const t = pa; pa = pb; pb = t;
    }
    return `${posHashOf(pa)}_${posHashOf(pb)}`;
}

function addVertex(builder: MeshBuilder, v: Vec3, n: Vec3): number {
    const key = `${v[0]},${v[1]},${v[2]},${n[0]},${n[1]},${n[2]}`;
    const hit = builder.vertexLookup.get(key);
    if (hit !== undefined) return hit;
    const offset = builder.positions.length / 3;
    builder.vertexLookup.set(key, offset);
    builder.positions.push(v[0], v[1], v[2]);
    builder.normals.push(n[0], n[1], n[2]);
    return offset;
}

function quad(builder: MeshBuilder, a: number, b: number, c: number, d: number): void {
    builder.indices.push(a, b, c, c, d, a);
}

function sub3(a: Vec3, b: Vec3): Vec3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function add3(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale3(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function neg3(a: Vec3): Vec3 { return [-a[0], -a[1], -a[2]]; }
function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len3(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
function eq3(a: Vec3, b: Vec3): boolean { return a[0] === b[0] && a[1] === b[1] && a[2] === b[2]; }
function cross3(a: Vec3, b: Vec3): Vec3 {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}
function norm3(a: Vec3): Vec3 {
    const len = len3(a);
    return len > 0 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 1];
}

function isTerminalVertex(
    connectivity: Map<number, { from?: number; to?: number }>, hash: number,
): boolean {
    const conn = connectivity.get(hash);
    return !conn || conn.from === undefined || conn.to === undefined;
}

interface EdgePoint { x: number; y: number; h: number; }

/**
 * mgl prepareEdgePoints: keep only the segment part that passes the
 * comparison (above ground for rails, below for tunnel walls), cutting at
 * the zero crossing.
 */
function prepareEdgePoints(
    vertices: number[], heights: number[], edge: ElevatedEdge,
    comp: (a: number, b: number) => boolean,
): [EdgePoint, EdgePoint] | null {
    let vax = vertices[edge.a * 2], vay = vertices[edge.a * 2 + 1];
    let vbx = vertices[edge.b * 2], vby = vertices[edge.b * 2 + 1];
    let ha = heights[edge.a];
    let hb = heights[edge.b];
    const aPass = comp(ha, 0);
    const bPass = comp(hb, 0);

    if (aPass && bPass) {
        return [{ x: vax, y: vay, h: ha }, { x: vbx, y: vby, h: hb }];
    }
    if (!aPass && !bPass) return null;

    if (!aPass) {
        const t = ha / (ha - hb);
        vax = vax + (vbx - vax) * t;
        vay = vay + (vby - vay) * t;
        ha = ha + (hb - ha) * t;
    } else {
        const t = hb / (hb - ha);
        vbx = vbx + (vax - vbx) * t;
        vby = vby + (vay - vby) * t;
        hb = hb + (ha - hb) * t;
    }
    return [{ x: vax, y: vay, h: ha }, { x: vbx, y: vby, h: hb }];
}

// Silence an unused-helper lint for dot3 (kept for future lighting math).
void dot3;
