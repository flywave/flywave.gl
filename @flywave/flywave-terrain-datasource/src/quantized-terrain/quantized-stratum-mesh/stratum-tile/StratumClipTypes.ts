/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoPointLike, GeoCoordinates } from "@flywave/flywave-geoutils";

export interface StratumClipRegion {
    id: string;
    boundary: GeoCoordinates[];
}

export interface SerializedStratumClipRegion {
    id: string;
    boundary: GeoPointLike[];
}

export function serializeStratumClipRegion(region: StratumClipRegion): SerializedStratumClipRegion {
    return {
        id: region.id,
        boundary: region.boundary.map(pt => pt.toGeoPoint())
    };
}

export function deserializeStratumClipRegion(
    serialized: SerializedStratumClipRegion
): StratumClipRegion {
    return {
        id: serialized.id,
        boundary: serialized.boundary.map(pt => GeoCoordinates.fromGeoPoint(pt))
    };
}
