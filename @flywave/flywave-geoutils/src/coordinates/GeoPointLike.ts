/* Copyright (C) 2025 flywave.gl contributors */

/**
 * An [[Array]] following the order longitude, latitude, altitude.
 */
export type GeoPointLike = [number, number, number?];

/**
 * Type guard to assert that `object` conforms to [[GeoPointLike]] interface.
 */
export function isGeoPointLike(geoPoint: any): geoPoint is GeoPointLike {
    if (Array.isArray(geoPoint)) {
        const [longitude, latitude, altitude] = geoPoint;
        return (
            typeof longitude === "number" &&
            typeof latitude === "number" &&
            (altitude === undefined || typeof altitude === "number")
        );
    }
    return false;
}
