"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HD_ELEVATION_SOURCE_LAYER = exports.MBElevatedStructures = void 0;
exports.normalizeToElevationExtent = normalizeToElevationExtent;
const MBElevationConstants_1 = require("./MBElevationConstants");
Object.defineProperty(exports, "HD_ELEVATION_SOURCE_LAYER", { enumerable: true, get: function () { return MBElevationConstants_1.HD_ELEVATION_SOURCE_LAYER; } });
const MBElevationFeature_1 = require("./MBElevationFeature");
const MBElevationFeatureParser_1 = require("./MBElevationFeatureParser");
const MBElevationGraph_1 = require("./MBElevationGraph");
const MBGetElevationFeature_1 = require("./MBGetElevationFeature");
class MBElevatedStructures {
    constructor() {
        this.features = [];
        this.hasPayload = false;
        this.m_meta = [];
        this.m_vertices = [];
        this.m_unevaluatedPortals = null;
        this.m_layerExtent = 4096;
    }
    addRawFeature(f) {
        this.hasPayload = true;
        this.m_layerExtent = f.layerExtent;
        const vertex = (0, MBElevationFeatureParser_1.parseElevationVertex)(f);
        if (vertex) {
            this.m_vertices.push(vertex);
            return true;
        }
        const meta = (0, MBElevationFeatureParser_1.parseElevationMeta)(f);
        if (meta) {
            this.m_meta.push(meta);
            return true;
        }
        return false;
    }
    finalize(metersToTile) {
        const vertices = this.m_vertices.slice()
            .sort((a, b) => a.id - b.id || a.idx - b.idx);
        const deduped = [];
        for (const v of vertices) {
            const last = deduped[deduped.length - 1];
            if (!last || last.id !== v.id || last.idx !== v.idx)
                deduped.push(v);
        }
        const metas = this.m_meta.slice().sort((a, b) => a.id - b.id);
        let vCurrent = 0;
        const vEnd = deduped.length;
        this.features = [];
        for (const meta of metas) {
            if (meta.constantHeight != null) {
                this.features.push(new MBElevationFeature_1.MBElevationFeature(meta.id, { minX: meta.bounds[0], minY: meta.bounds[1], maxX: meta.bounds[2], maxY: meta.bounds[3] }, meta.constantHeight));
                continue;
            }
            while (vCurrent !== vEnd && deduped[vCurrent].id < meta.id)
                vCurrent++;
            if (vCurrent === vEnd || deduped[vCurrent].id !== meta.id)
                continue;
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
            this.features.push(new MBElevationFeature_1.MBElevationFeature(meta.id, { minX: meta.bounds[0], minY: meta.bounds[1], maxX: meta.bounds[2], maxY: meta.bounds[3] }, undefined, outVertices, outEdges, metersToTile));
        }
    }
    get isEmpty() {
        return this.features.length === 0;
    }
    resolveFillHeights(properties, rings, isMarkup) {
        const feature = (0, MBGetElevationFeature_1.getElevationFeature)(properties, this.features);
        if (!feature)
            return null;
        const sampler = new MBElevationFeature_1.MBElevationFeatureSampler(0, 0, 0, 0, 0, 0);
        void sampler;
        const bias = isMarkup ? MBElevationConstants_1.MARKUP_ELEVATION_BIAS : 0;
        const ringHeights = rings.map(ring => ring.map(pt => {
            const h = feature.pointElevation(pt.x, pt.y);
            if (bias <= 0)
                return h;
            const stepHeight = h >= 0 ? h : Math.abs(0.5 * h);
            return h + bias * smoothstep(0, bias, stepHeight);
        }));
        return { ringHeights, feature };
    }
    resolveFeature(properties) {
        return (0, MBGetElevationFeature_1.getElevationFeature)(properties, this.features);
    }
    sampleHeight(properties, x, y, isMarkup) {
        const feature = this.resolveFeature(properties);
        if (!feature)
            return undefined;
        const nx = normalizeToElevationExtent(x, this.m_layerExtent);
        const ny = normalizeToElevationExtent(y, this.m_layerExtent);
        const h = feature.pointElevation(nx, ny);
        if (!isMarkup)
            return h;
        const stepHeight = h >= 0 ? h : Math.abs(0.5 * h);
        return h + MBElevationConstants_1.MARKUP_ELEVATION_BIAS * smoothstep(0, MBElevationConstants_1.MARKUP_ELEVATION_BIAS, stepHeight);
    }
    isTunnelFeature(properties) {
        const feature = (0, MBGetElevationFeature_1.getElevationFeature)(properties, this.features);
        return feature ? feature.isTunnel() : false;
    }
    addPortalEdge(ax, ay, bx, by, edgeIndex, isTunnel) {
        if (!this.m_unevaluatedPortals) {
            this.m_unevaluatedPortals = new MBElevationGraph_1.MBElevationPortalGraph();
        }
        const length = Math.hypot(bx - ax, by - ay);
        this.m_unevaluatedPortals.addPortal({
            connection: { a: edgeIndex, b: undefined },
            vaX: ax, vaY: ay, vbX: bx, vbY: by,
            length,
            hash: (0, MBElevationGraph_1.portalEdgeHash)(ax, ay, bx, by),
            isTunnel,
            type: 'unevaluated',
        });
    }
    get unevaluatedPortals() {
        return this.m_unevaluatedPortals;
    }
}
exports.MBElevatedStructures = MBElevatedStructures;
function smoothstep(a, b, x) {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}
function normalizeToElevationExtent(v, layerExtent) {
    return layerExtent > 0 && layerExtent !== 4096 ? (v / layerExtent) * 4096 : v;
}
//# sourceMappingURL=MBElevatedStructures.js.map