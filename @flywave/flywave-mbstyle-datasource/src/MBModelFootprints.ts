import * as THREE from 'three';

/**
 * §634/§638 conflation replacement registry: world-space (lng/lat) footprint
 * RINGS of GLB model footprint nodes (`mapbox:footprint:id`). mgl's
 * conflation replaces fill-extrusion buildings with 3D models where their
 * footprints overlap — the data source skips extruding a polygon whose
 * representative point falls inside a model footprint ring.
 * Ring (not bbox) matching: bbox approximation over-suppressed adjacent
 * buildings in the conflation-padding fixtures (§638: intersect-padding-lod
 * +39432).
 */
export interface ModelFootprint {
    ring: number[][]; // [lng, lat][]
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
}

const footprints: ModelFootprint[] = [];
const seen = new Set<string>();
const MAX_FOOTPRINTS = 20000;

/** Registers a footprint ring (dedup by rounded vertices). Returns false when
 * already registered (re-decode of the same tile) so callers only react to
 * genuinely new coverage. */
export function registerModelFootprintRing(ring: number[][]): boolean {
    if (ring.length < 3) return false;
    const key = ring.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
    if (seen.has(key)) return false;
    seen.add(key);
    if (footprints.length >= MAX_FOOTPRINTS) return true;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    for (const p of ring) {
        if (p[0] < minLng) minLng = p[0];
        if (p[0] > maxLng) maxLng = p[0];
        if (p[1] < minLat) minLat = p[1];
        if (p[1] > maxLat) maxLat = p[1];
    }
    footprints.push({ ring, minLng, minLat, maxLng, maxLat });
    return true;
}

export function getModelFootprintBoxCount(): number {
    return footprints.length;
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if (((yi > lat) !== (yj > lat)) &&
            (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
            inside = !inside;
        }
    }
    return inside;
}

/** True when (lng, lat) falls inside any registered model footprint ring. */
export function pointInModelFootprint(lng: number, lat: number): boolean {
    for (const fp of footprints) {
        if (lng < fp.minLng || lng > fp.maxLng || lat < fp.minLat || lat > fp.maxLat) continue;
        if (pointInRing(lng, lat, fp.ring)) return true;
    }
    return false;
}
