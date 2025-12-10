/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoPolygon, type Projection } from "@flywave/flywave-geoutils";
import type * as THREE from "three";

/**
 * View bounds for a given camera and world space projection.
 *
 * @internal
 */
export interface ViewBounds {
    readonly camera: THREE.Camera;
    readonly projection: Projection;

    /**
     * Generates a {@link @flywave/flywave-geoutils#GeoPolygon} covering the visible map.
     * The coordinates are sorted to ccw winding, so a polygon could be drawn with them.
     * @returns The GeoPolygon with the view bounds or undefined if world is not in view.
     */
    generate(): GeoPolygon | undefined;
}
