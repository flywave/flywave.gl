/**
 * Elevation feature lookup for HD road features.
 *
 * Rewritten from mapbox-gl-js `3d-style/elevation/get_elevation_feature.ts`:
 * resolves the `3d_elevation_id` property of a decoded road feature to an
 * elevation curve, preferring a same-tile hit and otherwise falling back to
 * a cross-tile registry (built by the decoder from neighbouring tiles'
 * `hd_road_elevation` layers).
 */

import { PROPERTY_ELEVATION_ID } from './MBElevationConstants';
import { MBElevationFeature } from './MBElevationFeature';

/** An elevation feature pinned to the tile it was parsed from. */
export interface ElevationTiledFeature {
    z: number;
    x: number;
    y: number;
    feature: MBElevationFeature;
}

export interface ElevationFeatureRef {
    properties: Record<string, unknown> | undefined;
}

/**
 * Resolve the elevation feature for a road feature.
 *
 * @param featureProps properties of the consuming road feature
 * @param sameTileFeatures elevation features parsed from the SAME tile
 * @param registry cross-tile registry of parsed elevation features
 */
export function getElevationFeature(
    featureProps: Record<string, unknown> | undefined,
    sameTileFeatures: MBElevationFeature[] | undefined,
    registry?: ElevationTiledFeature[],
): MBElevationFeature | undefined {
    if (!featureProps) return undefined;

    const value = +featureProps[PROPERTY_ELEVATION_ID];
    if (Number.isNaN(value)) return undefined;

    if (sameTileFeatures) {
        return sameTileFeatures.find(f => f.id === value);
    }

    if (!registry || registry.length === 0) return undefined;

    // Registry is sorted by feature id — binary search the first hit.
    let lo = 0;
    let hi = registry.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (registry[mid].feature.id < value) lo = mid + 1;
        else hi = mid - 1;
    }
    return lo < registry.length && registry[lo].feature.id === value
        ? registry[lo].feature
        : undefined;
}

/**
 * All registry parts for an id whose tiles overlap the consumer tile
 * (ancestors or descendants). Caller merges them into one consumer-space
 * curve via `mergeElevationFeatures`.
 */
export function getOverlappingElevationParts(
    featureProps: Record<string, unknown> | undefined,
    registry: ElevationTiledFeature[] | undefined,
    consumerZ: number, consumerX: number, consumerY: number,
): ElevationTiledFeature[] {
    if (!featureProps || !registry || registry.length === 0) return [];
    const value = +featureProps[PROPERTY_ELEVATION_ID];
    if (Number.isNaN(value)) return [];

    let lo = 0;
    let hi = registry.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (registry[mid].feature.id < value) lo = mid + 1;
        else hi = mid - 1;
    }
    if (lo < 0 || lo >= registry.length || registry[lo].feature.id !== value) return [];

    const isRelated = (z: number, x: number, y: number): boolean => {
        // Ancestor/descendant test: coordinates must align under the scale.
        if (z >= consumerZ) {
            const s = Math.pow(2, z - consumerZ);
            return Math.floor(x / s) === consumerX && Math.floor(y / s) === consumerY;
        }
        const s = Math.pow(2, consumerZ - z);
        return Math.floor(consumerX / s) === x && Math.floor(consumerY / s) === y;
    };

    const result: ElevationTiledFeature[] = [];
    for (let i = lo; i < registry.length && registry[i].feature.id === value; i++) {
        const e = registry[i];
        if (isRelated(e.z, e.x, e.y) || e.feature.constantHeight != null) {
            result.push(e);
        }
    }
    return result;
}
