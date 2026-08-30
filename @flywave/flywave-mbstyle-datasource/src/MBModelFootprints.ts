import * as THREE from 'three';

/**
 * §634 conflation replacement registry: world-space (lng/lat) bounding boxes
 * of GLB model footprint nodes (`mapbox:footprint:id`). mgl's conflation
 * replaces fill-extrusion buildings with 3D models where they overlap — the
 * data source skips extruding a polygon whose centroid falls inside a model
 * footprint box.
 */
export interface ModelFootprintBox {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
}

const boxes: ModelFootprintBox[] = [];
const seen = new Set<string>();
const MAX_BOXES = 50000;

/** Registers a box; returns false when it was already registered (re-decode
 * of the same tile) so callers only react to genuinely new coverage. */
export function registerModelFootprintBox(box: ModelFootprintBox): boolean {
    const key = `${box.minLng.toFixed(7)},${box.minLat.toFixed(7)},${box.maxLng.toFixed(7)},${box.maxLat.toFixed(7)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (boxes.length < MAX_BOXES) boxes.push(box);
    return true;
}

export function getModelFootprintBoxes(): readonly ModelFootprintBox[] {
    return boxes;
}

export function getModelFootprintBoxCount(): number {
    return boxes.length;
}

/** True when (lng, lat) falls inside any registered model footprint box. */
export function pointInModelFootprint(lng: number, lat: number): boolean {
    for (const b of boxes) {
        if (lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat) {
            return true;
        }
    }
    return false;
}

/** Convert a tile-local Box3 (x east m, y south m, centered on tile center)
 * into a lng/lat footprint box and register it. */
export function registerBoxFromLocalBox(
    box: THREE.Box3,
    centerLng: number,
    centerLat: number,
    /** meshopt grid y is NORTH-positive (loader centers with +4096 offset);
     * draco vertices have the y mirror baked (south-positive). */
    yNorthPositive: boolean,
): boolean {
    if (!isFinite(box.min.x) || !isFinite(box.max.x) || !isFinite(box.min.y) || !isFinite(box.max.y)) {
        return false;
    }
    const cosLat = Math.max(0.01, Math.cos(centerLat * Math.PI / 180));
    const metersPerDegLng = 111320 * cosLat;
    const metersPerDegLat = 110574;
    const minLng = centerLng + box.min.x / metersPerDegLng;
    const maxLng = centerLng + box.max.x / metersPerDegLng;
    let minLat: number, maxLat: number;
    if (yNorthPositive) {
        minLat = centerLat + box.min.y / metersPerDegLat;
        maxLat = centerLat + box.max.y / metersPerDegLat;
    } else {
        // local y SOUTH-positive: y max = southern edge = min lat.
        minLat = centerLat - box.max.y / metersPerDegLat;
        maxLat = centerLat - box.min.y / metersPerDegLat;
    }
    return registerModelFootprintBox({ minLng, minLat, maxLng, maxLat });
}
