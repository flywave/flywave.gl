/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoCoordinatesLike, isGeoCoordinatesLike } from "./GeoCoordinatesLike";
import { type GeoPointLike, isGeoPointLike } from "./GeoPointLike";
import { type LatLngLike, isLatLngLike } from "./LatLngLike";

/**
 * Represents an object in different geo coordinate formats
 */
export type GeoCoordLike = GeoPointLike | GeoCoordinatesLike | LatLngLike;

export function geoCoordLikeToGeoCoordinatesLike(coord: GeoCoordLike): GeoCoordinatesLike {
    return isGeoCoordinatesLike(coord)
        ? coord
        : isLatLngLike(coord)
        ? { latitude: coord.lat, longitude: coord.lng }
        : { latitude: coord[1], longitude: coord[0] };
}

export function geoCoordLikeToGeoPointLike(coord: GeoCoordLike): GeoPointLike {
    return isGeoPointLike(coord)
        ? coord
        : isLatLngLike(coord)
        ? [coord.lng, coord.lat]
        : [coord.longitude, coord.latitude];
}

export function isGeoCoordLike(object: any): boolean {
    return isGeoCoordinatesLike(object) || isLatLngLike(object) || !isGeoPointLike(object);
}
