/**
 * Per-tile HD elevated-structures state.
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/elevated_structures.ts`
 * for the flywave pipeline. mgl builds GPU intersection meshes + portal
 * graphs here; our renderer generates THREE geometry at decode time, so
 * this module owns the semantic core instead:
 *
 *  - holds the tile's parsed `hd_road_elevation` curves;
 *  - resolves a road feature's `3d_elevation_id` to a curve and samples
 *    per-vertex heights (with the markup bias for markup layers);
 *  - classifies features as tunnel / elevated via the curve's height range;
 *  - collects unevaluated portal edges from fill boundary segments for the
 *    cross-layer portal graph evaluation (MBElevationGraph.evaluate).
 */

import { HD_ELEVATION_SOURCE_LAYER, MARKUP_ELEVATION_BIAS } from './MBElevationConstants';
import {
    MBElevationFeature,
    MBElevationFeatureSampler,
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
    MBElevationPortalGraph,
    portalEdgeHash,
} from './MBElevationGraph';
import { getElevationFeature } from './MBGetElevationFeature';

export interface FillElevationResult {
    /** Per-ring vertex heights (meters above ground), outer ring first. */
    ringHeights: number[][];
    /** The elevation feature resolved for this fill. */
    feature: MBElevationFeature;
}

export class MBElevatedStructures {
    /** Parsed elevation curves for this tile. */
    features: MBElevationFeature[] = [];
    /** Whether any curve payload arrived for this tile. */
    hasPayload = false;

    private m_meta: ElevationCurveMeta[] = [];
    private m_vertices: ElevationCurveVertex[] = [];
    private m_unevaluatedPortals: MBElevationPortalGraph | null = null;
    /** Canonical extent of the elevation layer (positions normalized to it). */
    private m_layerExtent = 4096;

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
    finalize(metersToTile: number): void {
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
                metersToTile,
            ));
        }
    }

    /** Whether the tile carries any assembled elevation curves. */
    get isEmpty(): boolean {
        return this.features.length === 0;
    }

    /**
     * Sample per-vertex heights for a fill feature attached to an elevation
     * curve via `3d_elevation_id`. Returns null when the feature does not
     * reference a curve in this tile.
     *
     * @param properties road feature properties
     * @param rings fill rings in canonical elevation-extent units
     * @param isMarkup markup layers get the elevation bias lift
     */
    resolveFillHeights(
        properties: Record<string, unknown> | undefined,
        rings: Array<Array<{ x: number; y: number }>>,
        isMarkup: boolean,
    ): FillElevationResult | null {
        const feature = getElevationFeature(properties, this.features);
        if (!feature) return null;

        const sampler = new MBElevationFeatureSampler(0, 0, 0, 0, 0, 0); // identity
        void sampler;
        const bias = isMarkup ? MARKUP_ELEVATION_BIAS : 0;
        const ringHeights = rings.map(ring => ring.map(pt => {
            // Identity sampler: bias is applied directly on the curve sample.
            const h = feature.pointElevation(pt.x, pt.y);
            if (bias <= 0) return h;
            const stepHeight = h >= 0 ? h : Math.abs(0.5 * h);
            return h + bias * smoothstep(0, bias, stepHeight);
        }));
        return { ringHeights, feature };
    }

    /** Resolve the elevation curve a road feature references, if any. */
    resolveFeature(properties: Record<string, unknown> | undefined): MBElevationFeature | undefined {
        return getElevationFeature(properties, this.features);
    }

    /**
     * Sample the referenced curve at a point given in the elevation
     * LAYER's extent units (positions are normalized to the canonical
     * elevation extent first). Returns the biased height for markup layers.
     */
    sampleHeight(
        properties: Record<string, unknown> | undefined,
        x: number, y: number, isMarkup: boolean,
    ): number | undefined {
        const feature = this.resolveFeature(properties);
        if (!feature) return undefined;
        const nx = normalizeToElevationExtent(x, this.m_layerExtent);
        const ny = normalizeToElevationExtent(y, this.m_layerExtent);
        const h = feature.pointElevation(nx, ny);
        if (!isMarkup) return h;
        const stepHeight = h >= 0 ? h : Math.abs(0.5 * h);
        return h + MARKUP_ELEVATION_BIAS * smoothstep(0, MARKUP_ELEVATION_BIAS, stepHeight);
    }

    /** Tunnel classification of a feature via its curve's height range. */
    isTunnelFeature(properties: Record<string, unknown> | undefined): boolean {
        const feature = getElevationFeature(properties, this.features);
        return feature ? feature.isTunnel() : false;
    }

    /**
     * Record an unevaluated portal edge for a fill boundary segment.
     * `isTunnel` reflects the tunnel classification of the owning polygon.
     */
    addPortalEdge(
        ax: number, ay: number, bx: number, by: number,
        edgeIndex: number, isTunnel: boolean,
    ): void {
        if (!this.m_unevaluatedPortals) {
            this.m_unevaluatedPortals = new MBElevationPortalGraph();
        }
        const length = Math.hypot(bx - ax, by - ay);
        this.m_unevaluatedPortals.addPortal({
            connection: { a: edgeIndex, b: undefined },
            vaX: ax, vaY: ay, vbX: bx, vbY: by,
            length,
            hash: portalEdgeHash(ax, ay, bx, by),
            isTunnel,
            type: 'unevaluated',
        });
    }

    get unevaluatedPortals(): MBElevationPortalGraph | null {
        return this.m_unevaluatedPortals;
    }
}

function smoothstep(a: number, b: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** Canonical-extent helper: normalize one coordinate. */
export function normalizeToElevationExtent(v: number, layerExtent: number): number {
    return layerExtent > 0 && layerExtent !== 4096 ? (v / layerExtent) * 4096 : v;
}

export { HD_ELEVATION_SOURCE_LAYER };
