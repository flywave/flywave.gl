/**
 * Pole of inaccessibility (polylabel) — faithful port of mgl
 * `util/find_pole_of_inaccessibility.ts` (itself adapted from
 * github.com/mapbox/polylabel), dependency-free (plain {x,y} points, inline
 * binary heap instead of tinyqueue).
 *
 * Used to place point-placement symbols on polygon features
 * (mgl symbol_layout.ts: `findPoleOfInaccessibility(polygon, 16)` — 16 tile
 * units = 2 px at extent 8192).
 */

export interface PoloPoint { x: number; y: number; }

function distToSegmentSquared(p: PoloPoint, v: PoloPoint, w: PoloPoint): number {
    const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
    if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    const t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    if (t < 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
    if (t > 1) return (p.x - w.x) ** 2 + (p.y - w.y) ** 2;
    const x = v.x + (w.x - v.x) * t;
    const y = v.y + (w.y - v.y) * t;
    return (p.x - x) ** 2 + (p.y - y) ** 2;
}

// signed distance from point to polygon outline (negative if point is outside)
function pointToPolygonDist(p: PoloPoint, polygon: PoloPoint[][]): number {
    let inside = false;
    let minDistSq = Infinity;
    for (let k = 0; k < polygon.length; k++) {
        const ring = polygon[k];
        for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
            const a = ring[i];
            const b = ring[j];
            if ((a.y > p.y) !== (b.y > p.y) &&
                (p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
            minDistSq = Math.min(minDistSq, distToSegmentSquared(p, a, b));
        }
    }
    return (inside ? 1 : -1) * Math.sqrt(minDistSq);
}

class Cell {
    p: PoloPoint;
    h: number; // half the cell size
    d: number; // distance from cell center to polygon
    max: number; // max distance to polygon within a cell
    constructor(x: number, y: number, h: number, polygon: PoloPoint[][]) {
        this.p = { x, y };
        this.h = h;
        this.d = pointToPolygonDist(this.p, polygon);
        this.max = this.d + this.h * Math.SQRT2;
    }
}

// get polygon centroid (mgl getCentroidCell — first best guess)
function getCentroidCell(polygon: PoloPoint[][]): Cell {
    let area = 0;
    let x = 0;
    let y = 0;
    const points = polygon[0];
    for (let i = 0, len = points.length, j = len - 1; i < len; j = i++) {
        const a = points[i];
        const b = points[j];
        const f = a.x * b.y - b.x * a.y;
        x += (a.x + b.x) * f;
        y += (a.y + b.y) * f;
        area += f * 3;
    }
    return new Cell(x / area, y / area, 0, polygon);
}

/** Max-heap ordered by cell potential (mgl compareMax: b.max - a.max). */
class MaxHeap {
    private m_items: Cell[] = [];
    get length(): number { return this.m_items.length; }
    push(cell: Cell): void {
        const a = this.m_items;
        a.push(cell);
        let i = a.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (a[parent].max >= a[i].max) break;
            [a[parent], a[i]] = [a[i], a[parent]];
            i = parent;
        }
    }
    pop(): Cell {
        const a = this.m_items;
        const top = a[0];
        const last = a.pop()!;
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1, r = l + 1;
                let largest = i;
                if (l < a.length && a[l].max > a[largest].max) largest = l;
                if (r < a.length && a[r].max > a[largest].max) largest = r;
                if (largest === i) break;
                [a[largest], a[i]] = [a[i], a[largest]];
                i = largest;
            }
        }
        return top;
    }
}

/**
 * Finds an approximation of a polygon's pole of inaccessibility.
 * @param polygonRings first item is the outer ring followed optionally by
 * holes (one polygon as grouped by mgl classify_rings).
 * @param precision in input coordinate units; the search stops once the
 * remaining search radius is below it.
 */
export function findPoleOfInaccessibility(polygonRings: PoloPoint[][], precision: number = 1): PoloPoint {
    // find the bounding box of the outer ring
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const outerRing = polygonRings[0];
    for (let i = 0; i < outerRing.length; i++) {
        const p = outerRing[i];
        if (!i || p.x < minX) minX = p.x;
        if (!i || p.y < minY) minY = p.y;
        if (!i || p.x > maxX) maxX = p.x;
        if (!i || p.y > maxY) maxY = p.y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    const cellSize = Math.min(width, height);
    let h = cellSize / 2;

    const cellQueue = new MaxHeap();
    if (cellSize === 0) return { x: minX, y: minY };

    // cover polygon with initial cells
    for (let x = minX; x < maxX; x += cellSize) {
        for (let y = minY; y < maxY; y += cellSize) {
            cellQueue.push(new Cell(x + h, y + h, h, polygonRings));
        }
    }

    // take centroid as the first best guess
    let bestCell = getCentroidCell(polygonRings);

    while (cellQueue.length) {
        const cell = cellQueue.pop();
        if (cell.d > bestCell.d || !bestCell.d) bestCell = cell;
        if (cell.max - bestCell.d <= precision) continue;
        h = cell.h / 2;
        cellQueue.push(new Cell(cell.p.x - h, cell.p.y - h, h, polygonRings));
        cellQueue.push(new Cell(cell.p.x + h, cell.p.y - h, h, polygonRings));
        cellQueue.push(new Cell(cell.p.x - h, cell.p.y + h, h, polygonRings));
        cellQueue.push(new Cell(cell.p.x + h, cell.p.y + h, h, polygonRings));
    }

    return bestCell.p;
}
