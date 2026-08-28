/**
 * HD elevated-road polygon/line clipping primitives.
 *
 * Rewritten from mapbox-gl-js `3d-style/util/polygon_clipping_hd.ts`
 * (`polygonSubdivision`) and `src/util/line_clipping.ts`
 * (`clipLines`, `lineSubdivision`). mgl drives these through
 * martinez-polygon-clipping boolean ops; this port replaces the boolean
 * layer with direct half-plane splitting:
 *
 *  - mgl's subdivision "cut" is a thin-quad subtraction along each curve
 *    perpendicular — topologically that is a straight cut through the
 *    polygon, so clipping the ring to each side of the cut line
 *    (Sutherland–Hodgman) produces the same split without martinez. For
 *    concave rings SH yields zero-width bridges along the cut line; the
 *    subsequent per-vertex height sampling is continuous across the cut,
 *    so the bridge triangles are degenerate and invisible.
 *  - Heights are sampled from the (continuous) curve afterwards, so the
 *    sliver martinez removes along the cut line has no height-equivalent.
 *
 * All positions are plain `{x, y}` in canonical elevation-extent units.
 */

export interface ClipPoint {
    x: number;
    y: number;
}

export interface SubdivisionEdge {
    ax: number;
    ay: number;
    bx: number;
    by: number;
}

/** Signed side of p relative to the directed line a→b (cross product). */
function sideOf(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
    return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/** Intersection of segment p1→p2 with the infinite line a→b (t in [0,1]). */
function lineHit(
    ax: number, ay: number, bx: number, by: number,
    x1: number, y1: number, x2: number, y2: number,
): ClipPoint | null {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const denom = (bx - ax) * dy - (by - ay) * dx;
    if (denom === 0) return null;
    // Solve cross(b-a, p1 + t*d - a) = 0 for t.
    const t = ((by - ay) * (x1 - ax) - (bx - ax) * (y1 - ay)) / denom;
    if (t < 0 || t > 1) return null;
    return { x: x1 + dx * t, y: y1 + dy * t };
}

/** Ring area (shoelace); positive = counter-clockwise. */
function ringArea(ring: ClipPoint[]): number {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        a += ring[i].x * ring[i + 1].y - ring[i + 1].x * ring[i].y;
    }
    return a / 2;
}

const EPS = 1e-9;

/** Drop the closing duplicate and near-zero-area rings; close outputs. */
function normalizeRing(ring: ClipPoint[]): ClipPoint[] | null {
    const n = ring.length;
    if (n < 3) return null;
    const closedRing = ring.slice();
    if (closedRing[0].x !== closedRing[n - 1].x || closedRing[0].y !== closedRing[n - 1].y) {
        closedRing.push({ x: closedRing[0].x, y: closedRing[0].y });
    }
    if (Math.abs(ringArea(closedRing)) < 1e-6) return null;
    return closedRing;
}

/**
 * Clip a closed ring to one side of the infinite line a→b
 * (Sutherland–Hodgman against a convex half-plane; concave subjects come
 * back bridged along the cut line, which is invisible after per-vertex
 * height sampling). `keepPositive` selects the left/right side; vertices
 * on the line belong to both sides.
 */
function clipRingHalfPlane(
    ring: ClipPoint[], ax: number, ay: number, bx: number, by: number, keepPositive: boolean,
): ClipPoint[] | null {
    const n = ring.length >= 2 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y
        ? ring.length - 1
        : ring.length;

    let anyIn = false;
    let anyOut = false;
    for (let i = 0; i < n; i++) {
        const s = sideOf(ax, ay, bx, by, ring[i].x, ring[i].y);
        const inSide = keepPositive ? s >= -EPS : s <= EPS;
        if (inSide) anyIn = true; else anyOut = true;
    }
    if (!anyOut) return normalizeRing(ring);
    if (!anyIn) return null;

    const out: ClipPoint[] = [];
    for (let i = 0; i < n; i++) {
        const cur = ring[i];
        const nxt = ring[(i + 1) % n];
        const sCur = sideOf(ax, ay, bx, by, cur.x, cur.y);
        const sNxt = sideOf(ax, ay, bx, by, nxt.x, nxt.y);
        const inCur = keepPositive ? sCur >= -EPS : sCur <= EPS;
        const inNxt = keepPositive ? sNxt >= -EPS : sNxt <= EPS;
        if (inCur) out.push(cur);
        if (inCur !== inNxt) {
            const hit = lineHit(ax, ay, bx, by, cur.x, cur.y, nxt.x, nxt.y);
            if (hit) out.push(hit);
        }
    }
    return normalizeRing(out);
}

/**
 * Split polygons along every subdivision edge (mgl `polygonSubdivision`):
 * each ring is clipped to both sides of the edge's infinite line and the
 * union of the pieces replaces it. `edgeExtension` is accepted for mgl
 * signature parity — an infinite cut supersedes the thin-quad extension.
 */
export function polygonSubdivision(
    polygons: ClipPoint[][], subdivisionEdges: SubdivisionEdge[], edgeExtension = 0,
): ClipPoint[][] {
    void edgeExtension;
    if (subdivisionEdges.length === 0) return polygons;

    let current = polygons.map(ring => normalizeRing(ring) ?? ring);
    for (const e of subdivisionEdges) {
        // Degenerate edges (isolated curve vertices have no direction) do
        // not cut — clipping to both sides of a point would duplicate the
        // ring and every shared edge would prune away in prepareEdges.
        if (e.ax === e.bx && e.ay === e.by) continue;
        const next: ClipPoint[][] = [];
        for (const ring of current) {
            const left = clipRingHalfPlane(ring, e.ax, e.ay, e.bx, e.by, true);
            const right = clipRingHalfPlane(ring, e.ax, e.ay, e.bx, e.by, false);
            if (left) next.push(left);
            if (right) next.push(right);
        }
        current = next;
        if (current.length === 0) break;
    }
    return current;
}

/** Segment/segment intersection returning t along a→b and u along c→d. */
export function segmentSegmentIntersection(
    a: ClipPoint, b: ClipPoint, c: ClipPoint, d: ClipPoint,
): [number, number] | null {
    const rx = b.x - a.x;
    const ry = b.y - a.y;
    const sx = d.x - c.x;
    const sy = d.y - c.y;
    const denom = rx * sy - ry * sx;
    if (denom === 0) return null;
    const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
    const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [t, u];
}

function lerp(a: number, b: number, t: number): number {
    return a * (1 - t) + b * t;
}

/**
 * Insert the subdivision-edge crossings into a polyline and emit the
 * resulting sub-lines (mgl `lineSubdivision`). Crossing points become
 * vertices so the per-vertex height sampling follows the curve on both
 * sides of each cut.
 */
export function lineSubdivision(
    line: ClipPoint[], subdivisionEdges: SubdivisionEdge[], linesOut: ClipPoint[][],
): void {
    if (line.length < 2) {
        if (line.length > 0) linesOut.push(line);
        return;
    }

    const intersections: Array<{ t: number; point: ClipPoint }> = [];

    for (const e of subdivisionEdges) {
        const c = { x: e.ax, y: e.ay };
        const d = { x: e.bx, y: e.by };
        for (let i = 0; i < line.length - 1; i++) {
            const hit = segmentSegmentIntersection(line[i], line[i + 1], c, d);
            if (hit) {
                const [t] = hit;
                intersections.push({
                    t: i + t,
                    point: { x: lerp(line[i].x, line[i + 1].x, t), y: lerp(line[i].y, line[i + 1].y, t) },
                });
            }
        }
    }

    if (intersections.length === 0) {
        linesOut.push(line);
        return;
    }

    intersections.sort((p, q) => p.t - q.t);

    let subjIdx = 0;
    let intrIdx = 0;
    let output: ClipPoint[] = [];
    linesOut.push(output);

    const pushPt = (p: ClipPoint): void => {
        const last = output[output.length - 1];
        if (!last || last.x !== p.x || last.y !== p.y) output.push(p);
    };

    while (subjIdx !== line.length) {
        if (intrIdx === intersections.length) {
            while (subjIdx !== line.length) pushPt(line[subjIdx++]);
            break;
        }
        const intr = intersections[intrIdx];
        if (intr.t <= subjIdx) {
            pushPt(intr.point);
            intrIdx++;
        } else {
            pushPt(line[subjIdx]);
            subjIdx++;
        }
    }

    // Drop empty tails produced by duplicated cut points.
    for (let i = linesOut.length - 1; i >= 0; i--) {
        if (linesOut[i].length < 2) linesOut.splice(i, 1);
    }
}

/**
 * Clip a closed polygon ring to the box `[-margin, extent + margin]²`
 * (mgl `clipPolygonsToTile` clip step; Sutherland–Hodgman). Returns the
 * ring unchanged when fully inside; degenerate output → null.
 */
export function clipRingToBox(ring: ClipPoint[], extent: number, margin: number): ClipPoint[] | null {
    const minX = -margin;
    const minY = -margin;
    const maxX = extent + margin;
    const maxY = extent + margin;

    for (const p of ring) {
        if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
            // Needs clipping — fall through to the plane loop. Planes are
            // the box edges in CCW order so "inside" is always side >= 0.
            let poly: ClipPoint[] = ring;
            const planes: Array<[number, number, number, number]> = [
                [minX, minY, maxX, minY], // y >= minY
                [maxX, minY, maxX, maxY], // x <= maxX
                [maxX, maxY, minX, maxY], // y <= maxY
                [minX, maxY, minX, minY], // x >= minX
            ];
            for (const [ax, ay, bx, by] of planes) {
                const out: ClipPoint[] = [];
                const m = poly.length;
                for (let i = 0; i < m; i++) {
                    const cur = poly[i];
                    const nxt = poly[(i + 1) % m];
                    const sCur = sideOf(ax, ay, bx, by, cur.x, cur.y);
                    const sNxt = sideOf(ax, ay, bx, by, nxt.x, nxt.y);
                    if (sCur >= 0) out.push(cur);
                    if ((sCur >= 0) !== (sNxt >= 0)) {
                        const hit = lineHit(ax, ay, bx, by, cur.x, cur.y, nxt.x, nxt.y);
                        if (hit) out.push(hit);
                    }
                }
                poly = out;
                if (poly.length < 3) return null;
            }
            return normalizeRing(poly);
        }
    }
    return normalizeRing(ring);
}

/**
 * Clip polylines to the box `[-margin, extent + margin]²` (mgl
 * `clipLines`): each segment is clipped individually (Liang–Barsky) and
 * consecutive inside results chain into sub-lines.
 */
export function clipLinesToBox(lines: ClipPoint[][], extent: number, margin: number): ClipPoint[][] {
    const minX = -margin;
    const minY = -margin;
    const maxX = extent + margin;
    const maxY = extent + margin;
    const out: ClipPoint[][] = [];

    for (const line of lines) {
        let current: ClipPoint[] = [];
        const flush = (): void => {
            if (current.length >= 2) out.push(current);
            current = [];
        };
        for (let i = 0; i < line.length - 1; i++) {
            const x1 = line[i].x;
            const y1 = line[i].y;
            const x2 = line[i + 1].x;
            const y2 = line[i + 1].y;
            const dx = x2 - x1;
            const dy = y2 - y1;
            let t0 = 0;
            let t1 = 1;
            let rejected = false;
            const bounds: Array<[number, number]> = [
                [-dx, x1 - minX], [dx, maxX - x1],
                [-dy, y1 - minY], [dy, maxY - y1],
            ];
            for (const [p, q] of bounds) {
                if (p === 0) {
                    if (q < 0) { rejected = true; break; }
                } else {
                    const r = q / p;
                    if (p < 0) {
                        if (r > t1) { rejected = true; break; }
                        if (r > t0) t0 = r;
                    } else {
                        if (r < t0) { rejected = true; break; }
                        if (r < t1) t1 = r;
                    }
                }
            }
            if (rejected) {
                flush();
                continue;
            }
            const cx1 = x1 + dx * t0;
            const cy1 = y1 + dy * t0;
            const cx2 = x1 + dx * t1;
            const cy2 = y1 + dy * t1;
            const last = current[current.length - 1];
            if (!last || last.x !== cx1 || last.y !== cy1) flush();
            if (current.length === 0) current.push({ x: cx1, y: cy1 });
            current.push({ x: cx2, y: cy2 });
        }
        flush();
    }
    return out;
}
