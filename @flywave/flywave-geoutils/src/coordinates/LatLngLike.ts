/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Represents an object with `LatLng` like interface.
 */
export interface LatLngLike {
    /** The latitude in degrees. */
    lat: number;

    /** The longitude in degrees. */
    lng: number;
}

/**
 * Type guard to assert that `object` conforms to {@link LatLngLike} interface.
 */
export function isLatLngLike(object: any): object is LatLngLike {
    return object && typeof object.lat === "number" && typeof object.lng === "number";
}
