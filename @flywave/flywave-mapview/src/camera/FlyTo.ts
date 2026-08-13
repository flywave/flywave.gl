/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoCoordinatesLike,
    type GeoBox,
    type GeoBoxExtentLike,
    type GeoPolygon
} from "@flywave/flywave-geoutils";

export interface FlyToOptions {
    target?: GeoCoordinatesLike;
    zoomLevel?: number;
    tilt?: number;
    heading?: number;
    distance?: number;
    duration?: number;
    curve?: "linear" | "bow";
    altitude?: number;
}

export interface FlyToBoundsOptions {
    bounds: GeoBox | GeoBoxExtentLike | GeoPolygon;
    tilt?: number;
    heading?: number;
    duration?: number;
    curve?: "linear" | "bow";
    altitude?: number;
}
