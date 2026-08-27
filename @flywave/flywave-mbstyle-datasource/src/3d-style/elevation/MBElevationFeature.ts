/**
 * Elevation feature — a 3D linestring "skeleton" that guides the elevation
 * of attached HD road features (polygons, lines, symbols) near it.
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/elevation_feature.ts`
 * following flywave conventions: plain `{x, y}` positions instead of
 * gl-matrix vec2 / @mapbox Point, no worker-transfer registration (our
 * decoder runs in-process), and the curve assembly (`parseFrom`) folded in
 * from the parser callbacks described in MBElevationFeatureParser.
 */

import {
    MARKUP_ELEVATION_BIAS,
    TUNNEL_THRESHOLD_METERS,
    ELEVATION_EXTENT,
} from './MBElevationConstants';
import {
    ElevationCurveMeta,
    ElevationCurveVertex,
} from './MBElevationFeatureParser';

export interface ElevationVertex {
    x: number;
    y: number;
    /** Height above ground (meters). */
    height: number;
    /** Road half-width in canonical extent units. */
    extent: number;
    /** Curve index (defines adjacency; may be fractional after tessellation). */
    index: number;
}

export interface ElevationEdge {
    a: number;
    b: number;
}

interface ElevationEdgeProps {
    /** a -> b vector. */
    vx: number;
    vy: number;
    /** Unit direction. */
    dx: number;
    dy: number;
    len: number;
}

export interface ElevationRange {
    min: number;
    max: number;
}

export interface ElevationBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/** Linear interpolation, matching mgl style-spec `interpolate.number`. */
function lerp(a: number, b: number, t: number): number {
    return a * (1 - t) + b * t;
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/** mgl util smoothstep. */
function smoothstep(a: number, b: number, x: number): number {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * Squared distance between two 3D lines given by point+direction pairs.
 * Used by tessellation to estimate the non-planarity of an edge quad.
 */
function distSqLines(
    aStart: [number, number, number], aEnd: [number, number, number],
    bStart: [number, number, number], bEnd: [number, number, number],
): number {
    const aVec = [aEnd[0] - aStart[0], aEnd[1] - aStart[1], aEnd[2] - aStart[2]];
    const bVec = [bEnd[0] - bStart[0], bEnd[1] - bStart[1], bEnd[2] - bStart[2]];
    const abVec = [aStart[0] - bStart[0], aStart[1] - bStart[1], aStart[2] - bStart[2]];

    const a = aVec[0] * aVec[0] + aVec[1] * aVec[1] + aVec[2] * aVec[2];
    const b = aVec[0] * bVec[0] + aVec[1] * bVec[1] + aVec[2] * bVec[2];
    const c = aVec[0] * abVec[0] + aVec[1] * abVec[1] + aVec[2] * abVec[2];
    const d = bVec[0] * bVec[0] + bVec[1] * bVec[1] + bVec[2] * bVec[2];
    const e = bVec[0] * abVec[0] + bVec[1] * abVec[1] + bVec[2] * abVec[2];

    const det = a * d - b * b;
    if (det === 0) {
        // Parallel lines — distance from aStart to the closest point on b.
        const t = d > 0 ? (abVec[0] * bVec[0] + abVec[1] * bVec[1] + abVec[2] * bVec[2]) / d : 0;
        const px = bStart[0] + bVec[0] * t;
        const py = bStart[1] + bVec[1] * t;
        const pz = bStart[2] + bVec[2] * t;
        const dx = px - aStart[0], dy2 = py - aStart[1], dz = pz - aStart[2];
        return dx * dx + dy2 * dy2 + dz * dz;
    }

    const s = (b * e - c * d) / det;
    const t = (a * e - b * c) / det;

    const ax = aStart[0] + aVec[0] * s, ay = aStart[1] + aVec[1] * s, az = aStart[2] + aVec[2] * s;
    const bx = bStart[0] + bVec[0] * t, by = bStart[1] + bVec[1] * t, bz = bStart[2] + bVec[2] * t;
    const dx = ax - bx, dy2 = ay - by, dz = az - bz;
    return dx * dx + dy2 * dy2 + dz * dz;
}

export class MBElevationFeature {
    id: number;
    constantHeight: number | undefined;
    heightRange: ElevationRange;
    safeArea: ElevationBounds;
    vertices: ElevationVertex[] = [];
    edges: ElevationEdge[] = [];
    /** Per-vertex accumulated direction (normalized after edge pass). */
    private vertexDirs: Array<{ dx: number; dy: number }> = [];
    private edgeProps: ElevationEdgeProps[] = [];

    constructor(
        id: number,
        safeArea: ElevationBounds,
        constantHeight?: number,
        vertices?: ElevationVertex[],
        edges?: ElevationEdge[],
        metersToTile?: number,
    ) {
        this.id = id;
        this.safeArea = safeArea;
        this.constantHeight = constantHeight;
        this.heightRange = constantHeight != null
            ? { min: constantHeight, max: constantHeight }
            : { min: 0, max: 0 };

        if (this.constantHeight != null || !vertices || vertices.length === 0) return;

        this.vertices = vertices;
        this.edges = edges ?? [];
        for (let i = 0; i < this.vertices.length; i++) {
            this.vertices[i].index = this.vertices[i].index ?? i;
        }

        // Drop invalid edges (out-of-range endpoints or degenerate).
        this.edges = this.edges.filter(e =>
            e.a < this.vertices.length &&
            e.b < this.vertices.length &&
            !(this.vertices[e.a].x === this.vertices[e.b].x &&
              this.vertices[e.a].y === this.vertices[e.b].y));

        this.heightRange = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY };
        for (const v of this.vertices) {
            this.vertexDirs.push({ dx: 0, dy: 0 });
            this.heightRange.min = Math.min(this.heightRange.min, v.height);
            this.heightRange.max = Math.max(this.heightRange.max, v.height);
        }

        for (const edge of this.edges) {
            const a = this.vertices[edge.a];
            const b = this.vertices[edge.b];
            const vx = b.x - a.x;
            const vy = b.y - a.y;
            const len = Math.hypot(vx, vy);
            const dx = vx / len;
            const dy = vy / len;
            this.edgeProps.push({ vx, vy, dx, dy, len });

            // Accumulate edge directions onto both endpoint vertices.
            this.vertexDirs[edge.a].dx += dx; this.vertexDirs[edge.a].dy += dy;
            this.vertexDirs[edge.b].dx += dx; this.vertexDirs[edge.b].dy += dy;
        }

        for (const dir of this.vertexDirs) {
            const len = Math.hypot(dir.dx, dir.dy);
            if (len > 0) { dir.dx /= len; dir.dy /= len; }
        }

        // Split edges whose quad surface would deviate too far from planar —
        // reduces z-clipping between stacked polygons of different topology.
        if (metersToTile !== undefined) {
            this.tessellate(metersToTile);
        }
    }

    /** Elevation at a point: nearest-edge linear height interpolation. */
    pointElevation(x: number, y: number): number {
        if (this.constantHeight != null) return this.constantHeight;

        const closest = this.getClosestEdge(x, y);
        if (!closest) return 0;

        const [idx, t] = closest;
        return lerp(this.vertices[this.edges[idx].a].height, this.vertices[this.edges[idx].b].height, t);
    }

    /** Surface slope normal at a point (unit vector; +z up in extent space). */
    computeSlopeNormal(x: number, y: number, metersToTile: number): [number, number, number] {
        const closest = this.getClosestEdge(x, y);
        if (!closest) return [0, 0, 1];

        const idx = closest[0];
        const edge = this.edges[idx];
        const a = this.vertices[edge.a];
        const b = this.vertices[edge.b];
        const props = this.edgeProps[idx];

        // Edge vector with metric height delta; normal = perp × edgeVec,
        // where perp = (dy, -dx, 0) is the in-plane perpendicular.
        const ex = props.vx, ey = props.vy, ez = (b.height - a.height) * metersToTile;
        const perpX = props.dy, perpY = -props.dx, perpZ = 0;
        const nx = perpY * ez - perpZ * ey;
        const ny = perpZ * ex - perpX * ez;
        const nz = perpX * ey - perpY * ex;
        const len = Math.hypot(nx, ny, nz);

        return len > 0 ? [nx / len, ny / len, nz / len] : [0, 0, 1];
    }

    /** Whether this feature describes a tunnel (fully below threshold). */
    isTunnel(): boolean {
        return this.heightRange.max <= -TUNNEL_THRESHOLD_METERS;
    }

    /** Nearest edge to a point: [edgeIndex, clamped t along the edge]. */
    private getClosestEdge(x: number, y: number): [number, number] | undefined {
        if (this.edges.length === 0) return undefined;

        let closestIdx = 0;
        let closestDist = Number.POSITIVE_INFINITY;
        let closestT = 0;

        for (let i = 0; i < this.edges.length; i++) {
            const edge = this.edges[i];
            const edgeDir = this.edgeProps[i];
            const a = this.vertices[edge.a];
            const b = this.vertices[edge.b];

            // Ray from the query point along the edge direction; intersect
            // with the perpendicular "planes" at both endpoints. The endpoint
            // directions are edge-average, so this quad interpolation is
            // approximate — clamp handles overshoot.
            const t1 = this.rayPlaneT(x, y, edgeDir.dx, edgeDir.dy, a.x, a.y, this.vertexDirs[edge.a]);
            const t2 = this.rayPlaneT(x, y, edgeDir.dx, edgeDir.dy, b.x, b.y, this.vertexDirs[edge.b]);
            if (t1 === null || t2 === null) continue;

            const paX = x + edgeDir.dx * t1, paY = y + edgeDir.dy * t1;
            const pbX = x + edgeDir.dx * t2, pbY = y + edgeDir.dy * t2;

            const vabX = pbX - paX, vabY = pbY - paY;
            const paX2 = x - paX, paY2 = y - paY;
            const vabLenSq = vabX * vabX + vabY * vabY;
            const t = vabLenSq > 0 ? (paX2 * vabX + paY2 * vabY) / vabLenSq : 0;
            const clampedT = clamp(t, 0, 1);

            // Manhattan distance distinguishes the correct parallel line.
            const distAlongLine = Math.abs((t - clampedT) * this.edgeProps[i].len);
            const perpX = edgeDir.dy, perpY = -edgeDir.dx;
            const perpDist = Math.abs((x - a.x) * perpX + (y - a.y) * perpY);
            const dist = distAlongLine + perpDist;

            if (dist < closestDist) {
                closestIdx = i;
                closestDist = dist;
                closestT = clampedT;
            }
        }

        return [closestIdx, closestT];
    }

    /** Ray (origin point, direction d) against plane (point p, normal n) in 2D. */
    private rayPlaneT(
        ox: number, oy: number, dX: number, dY: number,
        pX: number, pY: number, n: { dx: number; dy: number },
    ): number | null {
        const denom = dX * n.dx + dY * n.dy;
        if (denom === 0) return null;
        return ((pX - ox) * n.dx + (pY - oy) * n.dy) / denom;
    }

    /**
     * Split edges whose quad surface deviates too far from planar: compute
     * the closest distance between the two diagonals of the endpoint
     * perpendicular quad; split at the midpoint when above the markup bias.
     */
    private tessellate(metersToTile: number): void {
        const splitThreshold = MARKUP_ELEVATION_BIAS;

        for (let i = this.edges.length - 1; i >= 0; --i) {
            const ea = this.edges[i].a;
            const eb = this.edges[i].b;
            const a = this.vertices[ea];
            const b = this.vertices[eb];
            const aDir = this.vertexDirs[ea];
            const bDir = this.vertexDirs[eb];

            // Positions in meters (z = height).
            const aPos: [number, number, number] = [a.x / metersToTile, a.y / metersToTile, a.height];
            const bPos: [number, number, number] = [b.x / metersToTile, b.y / metersToTile, b.height];
            const aPerp: [number, number, number] = [aDir.dy * a.extent, -aDir.dx * a.extent, 0];
            const bPerp: [number, number, number] = [bDir.dy * b.extent, -bDir.dx * b.extent, 0];

            const lineDistSq = distSqLines(
                [aPos[0] + 0.5 * aPerp[0], aPos[1] + 0.5 * aPerp[1], aPos[2] + 0.5 * aPerp[2]],
                [bPos[0] - 0.5 * bPerp[0], bPos[1] - 0.5 * bPerp[1], bPos[2] - 0.5 * bPerp[2]],
                [aPos[0] - 0.5 * aPerp[0], aPos[1] - 0.5 * aPerp[1], aPos[2] - 0.5 * aPerp[2]],
                [bPos[0] + 0.5 * bPerp[0], bPos[1] + 0.5 * bPerp[1], bPos[2] + 0.5 * bPerp[2]],
            );

            if (lineDistSq <= splitThreshold * splitThreshold) continue;

            const mid = this.vertices.length;
            this.vertices.push({
                x: (a.x + b.x) / 2,
                y: (a.y + b.y) / 2,
                height: (a.height + b.height) / 2,
                extent: (a.extent + b.extent) / 2,
                index: (a.index + b.index) / 2,
            });

            const dirX = (aDir.dx + bDir.dx) / 2;
            const dirY = (aDir.dy + bDir.dy) / 2;
            const dirLen = Math.hypot(dirX, dirY) || 1;
            this.vertexDirs.push({ dx: dirX / dirLen, dy: dirY / dirLen });

            this.edges.splice(i, 1);
            this.edgeProps.splice(i, 1);

            this.edges.push({ a: ea, b: mid });
            this.edges.push({ a: mid, b: eb });

            const vx = this.vertices[mid].x - a.x;
            const vy = this.vertices[mid].y - a.y;
            const vLen = Math.hypot(vx, vy) || 1;
            const props: ElevationEdgeProps = {
                vx, vy,
                dx: vx / vLen, dy: vy / vLen,
                len: vLen,
            };
            this.edgeProps.push(props, props);
        }
    }
}

/** Convert canonical-extent coordinates to world meters per tile. */
export function elevationTileToMeters(latitudeSin: number, zoomLevel: number): number {
    // Matches mgl tileToMeter: world circumference scaled by tile fraction,
    // cos(lat) correction folded via sin(lat) identity.
    const worldSize = 40075016.68557849 / Math.pow(2, zoomLevel);
    return worldSize * Math.sqrt(1 - latitudeSin * latitudeSin);
}

/**
 * Build elevation features from parsed curve payloads (parser callbacks).
 * Curves are assembled by matching `3d_elevation_id`, sorted, deduped and
 * wired into adjacency chains via `elevation_idx` — mirrors mgl
 * `ElevationFeatures.parseFrom`.
 */
export function assembleElevationFeatures(
    metas: ElevationCurveMeta[],
    curveVertices: ElevationCurveVertex[],
    metersToTile: number,
): MBElevationFeature[] {
    const features = metas.slice().sort((a, b) => a.id - b.id);
    const vertices = curveVertices.slice()
        .sort((a, b) => a.id - b.id || a.idx - b.idx);

    // Deduplicate by (id, idx) keeping the first occurrence.
    const deduped: ElevationCurveVertex[] = [];
    for (const v of vertices) {
        const last = deduped[deduped.length - 1];
        if (!last || last.id !== v.id || last.idx !== v.idx) deduped.push(v);
    }

    const result: MBElevationFeature[] = [];
    let vCurrent = 0;
    const vEnd = deduped.length;

    for (const feature of features) {
        if (feature.constantHeight != null) {
            result.push(new MBElevationFeature(feature.id, toBounds(feature.bounds), feature.constantHeight));
            continue;
        }

        while (vCurrent !== vEnd && deduped[vCurrent].id < feature.id) vCurrent++;
        if (vCurrent === vEnd || deduped[vCurrent].id !== feature.id) continue;

        const outVertices: ElevationVertex[] = [];
        const outEdges: ElevationEdge[] = [];
        const vFirst = vCurrent;

        while (vCurrent !== vEnd && deduped[vCurrent].id === feature.id) {
            const v = deduped[vCurrent];
            outVertices.push({ x: v.x, y: v.y, height: v.height, extent: v.extent, index: v.idx });

            if (vCurrent !== vFirst && deduped[vCurrent - 1].idx === v.idx - 1) {
                const idx = vCurrent - vFirst;
                outEdges.push({ a: idx - 1, b: idx });
            }

            vCurrent++;
        }

        result.push(new MBElevationFeature(
            feature.id, toBounds(feature.bounds), undefined, outVertices, outEdges, metersToTile,
        ));
    }

    return result;
}

function toBounds(b: [number, number, number, number]): ElevationBounds {
    return { minX: b[0], minY: b[1], maxX: b[2], maxY: b[3] };
}

/**
 * Sampler transforms points between the elevation feature's tile space and
 * the sampling (consumer) tile space, and applies the markup height bias.
 */
export class MBElevationFeatureSampler {
    zScale = 1;
    xOffset = 0;
    yOffset = 0;

    constructor(sampleZ: number, sampleX: number, sampleY: number, elevZ: number, elevX: number, elevY: number) {
        if (sampleZ === elevZ && sampleX === elevX && sampleY === elevY) return;
        this.zScale = Math.pow(2, elevZ - sampleZ);
        this.xOffset = (sampleX * this.zScale - elevX) * ELEVATION_EXTENT;
        this.yOffset = (sampleY * this.zScale - elevY) * ELEVATION_EXTENT;
    }

    pointTransform(x: number, y: number): [number, number] {
        return [x * this.zScale + this.xOffset, y * this.zScale + this.yOffset];
    }

    constantElevation(elevation: MBElevationFeature, bias: number): number | undefined {
        if (elevation.constantHeight == null) return undefined;
        return this.computeBiasedHeight(elevation.constantHeight, bias);
    }

    pointElevation(x: number, y: number, elevation: MBElevationFeature, bias: number): number {
        const constant = this.constantElevation(elevation, bias);
        if (constant != null) return constant;

        const [tx, ty] = this.pointTransform(x, y);
        return this.computeBiasedHeight(elevation.pointElevation(tx, ty), bias);
    }

    private computeBiasedHeight(height: number, bias: number): number {
        if (bias <= 0) return height;
        const stepHeight = height >= 0 ? height : Math.abs(0.5 * height);
        return height + bias * smoothstep(0, bias, stepHeight);
    }
}

/**
 * Merge elevation curve parts from multiple provider tiles into one curve
 * in `consumerZ/X/Y` tile space. Parts must share the feature id; higher
 * zoom parts win when deduplicating vertices by curve index. Without
 * merging, points outside a part's own tile slice would sample as ground.
 */
export function mergeElevationFeatures(
    consumerZ: number, consumerX: number, consumerY: number,
    metersToTile: number,
    parts: Array<{ z: number; x: number; y: number; feature: MBElevationFeature }>,
): MBElevationFeature {
    const sorted = parts.slice().sort((a, b) => b.z - a.z);

    let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
    const mergedVertices: ElevationVertex[] = [];
    let id = sorted[0].feature.id;
    let constantHeight: number | undefined;

    for (const part of sorted) {
        const sampler = new MBElevationFeatureSampler(consumerZ, consumerX, consumerY, part.z, part.x, part.y);
        id = part.feature.id;
        const sa = part.feature.safeArea;
        for (const [cx, cy] of [
            sampler.pointTransform(sa.minX, sa.minY),
            sampler.pointTransform(sa.maxX, sa.maxY),
        ]) {
            minX = Math.min(minX, cx); minY = Math.min(minY, cy);
            maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
        }
        if (part.feature.constantHeight != null) {
            constantHeight = part.feature.constantHeight;
            continue;
        }
        for (const v of part.feature.vertices) {
            const [tx, ty] = sampler.pointTransform(v.x, v.y);
            mergedVertices.push({ x: tx, y: ty, height: v.height, extent: v.extent, index: v.index });
        }
    }

    const bounds: ElevationBounds = { minX, minY, maxX, maxY };

    if (constantHeight != null) {
        return new MBElevationFeature(id, bounds, constantHeight);
    }

    // Sort by curve index; drop duplicates (highest zoom kept by the sort).
    mergedVertices.sort((a, b) => a.index - b.index);
    const deduped: ElevationVertex[] = [];
    for (const v of mergedVertices) {
        const last = deduped[deduped.length - 1];
        if (!last || last.index !== v.index) deduped.push(v);
    }

    // Connect consecutive vertices with adjacent curve indices.
    const edges: ElevationEdge[] = [];
    for (let i = 1; i < deduped.length; i++) {
        if (deduped[i].index - deduped[i - 1].index <= 1) {
            edges.push({ a: i - 1, b: i });
        }
    }

    return new MBElevationFeature(id, bounds, undefined, deduped, edges, metersToTile);
}
