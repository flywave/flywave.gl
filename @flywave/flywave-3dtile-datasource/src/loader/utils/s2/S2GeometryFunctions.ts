/* Copyright (C) 2025 flywave.gl contributors */

import { getS2BoundaryFlatFromS2Cell } from "./converters/S2ToBoundary";
import { getS2Cell } from "./s2geometry/S2CellUtils";
import { getS2LngLatFromS2Cell } from "./s2geometry/S2Geometry";

// GEOMETRY

/**
 * Retrieve S2 geometry center
 * @param s2Token {string} A string that is the cell's hex token
 * @returns {[number, number]} Longitude and Latitude coordinates of the S2 cell's center
 */
export function getS2LngLat(s2Token: string): [number, number] {
    const s2cell = getS2Cell(s2Token);
    return getS2LngLatFromS2Cell(s2cell);
}

/**
 * Get a polygon with corner coordinates for an s2 cell
 * @param tokenOrKey {string} A string that is the cell's hex token or the Hilbert quad key (containing /)
 * @return {Float64Array} - a simple polygon in flat array format: [lng0, lat0, lng1, lat1, ...]
 *   - the polygon is closed, i.e. last coordinate is a copy of the first coordinate
 */
export function getS2BoundaryFlat(tokenOrKey: string): Float64Array {
    const s2cell = getS2Cell(tokenOrKey);
    return getS2BoundaryFlatFromS2Cell(s2cell);
}
