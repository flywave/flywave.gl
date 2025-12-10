/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Represents an object that carry {@link GeoBox} extents like interface.
 */
export interface GeoBoxExtentLike {
    /**
     * Latitude span in degrees.
     */
    readonly latitudeSpan: number;

    /**
     * Longitude span in degrees
     */
    readonly longitudeSpan: number;
}

/**
 * Type guard to assert that `object` conforms to {@link GeoBoxExtentLike} interface.
 */
export function isGeoBoxExtentLike(obj: any): obj is GeoBoxExtentLike {
    return (
        obj &&
        typeof obj === "object" &&
        typeof obj.latitudeSpan === "number" &&
        typeof obj.longitudeSpan === "number"
    );
}
