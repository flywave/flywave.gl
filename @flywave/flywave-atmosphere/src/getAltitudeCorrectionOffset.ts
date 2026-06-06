/* Copyright (C) 2025 flywave.gl contributors */

import { Vector3 } from "three";

import type { Ellipsoid } from "./geospatial/Ellipsoid";

const vectorScratch = /*#__PURE__*/ new Vector3();

export function getAltitudeCorrectionOffset(
    cameraPosition: Vector3,
    bottomRadius: number,
    ellipsoid: Ellipsoid,
    result: Vector3
): Vector3 {
    const surfacePosition = ellipsoid.projectOnSurface(cameraPosition, vectorScratch);
    return surfacePosition != null
        ? ellipsoid.getOsculatingSphereCenter(surfacePosition, bottomRadius, result).negate()
        : result.setScalar(0);
}
