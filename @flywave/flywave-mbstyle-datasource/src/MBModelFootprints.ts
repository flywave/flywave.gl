import * as THREE from 'three';

/**
 * §634/§639/§640 conflation replacement registry: world-space (lng/lat)
 * footprint CONTOUR groups of GLB model footprint nodes
 * (`mapbox:footprint:id`).
 *
 * A footprint node's vertex sequence may concatenate MULTIPLE contours
 * (exterior + holes): even-odd XOR over the group's contours is the exact
 * containment test. Ring/bbox approximations mis-suppressed adjacent
 * buildings (§638 padding-lod +39k) or left a +12.6k residual (§640).
 */
interface Contour {
    pts: number[][]; // [lng, lat][]
    minLng: number; maxLng: number; minLat: number; maxLat: number;
}

interface FootprintGroup {
    contours: Contour[];
    minLng: number; maxLng: number; minLat: number; maxLat: number;
}

const groups: FootprintGroup[] = [];
const seen = new Set<string>();
const MAX_GROUPS = 20000;

/** Registers one footprint node's vertex sequence (lng/lat, closed-polygon
 * outline(s)). Concatenated contours are split at discontinuities (edge
 * length > 4× median). Dedup by rounded vertex keys; returns false when
 * already registered (re-decode of the same tile). */
export function registerModelFootprintRing(ring: number[][]): boolean {
    if (ring.length < 3) return false;
    const key = ring.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);

    // Segment into contours at jumps: edge length far above the median.
    const lens: number[] = [];
    for (let i = 1; i < ring.length; i++) {
        lens.push(Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
    }
    const sorted = [...lens].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const threshold = Math.max(median * 4, 1e-6);
    const contours: number[][][] = [];
    let cur: number[][] = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
        const d = Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]);
        if (d > threshold && cur.length >= 3) {
            contours.push(cur);
            cur = [ring[i]];
        } else {
            cur.push(ring[i]);
        }
    }
    if (cur.length >= 3) contours.push(cur);

    const group: FootprintGroup = { contours: [], minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
    for (const pts of contours) {
        const c: Contour = { pts, minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity };
        for (const p of pts) {
            if (p[0] < c.minLng) c.minLng = p[0];
            if (p[0] > c.maxLng) c.maxLng = p[0];
            if (p[1] < c.minLat) c.minLat = p[1];
            if (p[1] > c.maxLat) c.maxLat = p[1];
        }
        group.contours.push(c);
        if (c.minLng < group.minLng) group.minLng = c.minLng;
        if (c.maxLng > group.maxLng) group.maxLng = c.maxLng;
        if (c.minLat < group.minLat) group.minLat = c.minLat;
        if (c.maxLat > group.maxLat) group.maxLat = c.maxLat;
    }
    if (groups.length < MAX_GROUPS) groups.push(group);
    return true;
}

export function getModelFootprintBoxCount(): number {
    return groups.length;
}

function pointInRing(lng: number, lat: number, pts: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i][0], yi = pts[i][1];
        const xj = pts[j][0], yj = pts[j][1];
        if (((yi > lat) !== (yj > lat)) &&
            (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/** Even-odd XOR over a group's contours — exact containment for polygons
 * with holes. */
export function pointInModelFootprint(lng: number, lat: number): boolean {
    for (const g of groups) {
        if (lng < g.minLng || lng > g.maxLng || lat < g.minLat || lat > g.maxLat) continue;
        let xor = false;
        for (const c of g.contours) {
            if (lng < c.minLng || lng > c.maxLng || lat < c.minLat || lat > c.maxLat) continue;
            if (pointInRing(lng, lat, c.pts)) xor = !xor;
        }
        if (xor) return true;
    }
    return false;
}
