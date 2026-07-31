// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix4, Vector3 } from "three/webgpu";

/**
 * Interface for celestial direction computation.
 *
 * Implementations provide sun/moon directions in the ECEF frame and the
 * ECI→ECEF rotation matrix. flywave's native Simon1994 planetary positions
 * and GMST-based coordinate transforms (from `@flywave/flywave-mapview/celestia`)
 * satisfy this interface.
 *
 * This abstraction exists so that `@flywave/flywave-atmosphere` does not
 * create a circular dependency on `@flywave/flywave-mapview`.
 */
export interface CelestialDirections {
    getECIToECEFRotationMatrix(date: Date, result: Matrix4): Matrix4;
    getSunDirectionECI(date: Date, result: Vector3): Vector3;
    getMoonDirectionECI(date: Date, result: Vector3): Vector3;
    getMoonFixedToECIRotationMatrix(date: Date, result: Matrix4): Matrix4;
}

/**
 * Minimal view of AtmosphereContext's uniform-backed properties needed for
 * celestial direction updates. This avoids importing the `@ts-nocheck` class.
 */
export interface AtmosphereCelestialUniforms {
    matrixECIToECEF: { value: Matrix4 };
    matrixWorldToECEF: { value: Matrix4 };
    sunDirectionECEF: { value: Vector3 };
    moonDirectionECEF: { value: Vector3 };
    matrixMoonFixedToECEF: { value: Matrix4 };
}

/**
 * Updates atmosphere celestial uniforms from a `CelestialDirections`
 * implementation for the given date.
 *
 * This is the canonical wiring called each frame by the host application
 * (typically `MapViewEnvironment` or `Celestia`):
 *
 * ```ts
 * updateCelestialDirections(atmosphereContext, celestialDirections, date);
 * ```
 */
export function updateCelestialDirections(
    uniforms: AtmosphereCelestialUniforms,
    directions: CelestialDirections,
    date: Date,
    scratchECI?: Vector3,
    scratchMatrix?: Matrix4
): void {
    const matrix = scratchMatrix ?? new Matrix4();
    const eci = scratchECI ?? new Vector3();

    directions.getECIToECEFRotationMatrix(date, matrix);
    uniforms.matrixECIToECEF.value.copy(matrix);
    // flywave.gl uses ECEF as the Three.js world frame, so the world-to-ECEF
    // transform is the identity matrix. (The reference project uses ECI.)
    uniforms.matrixWorldToECEF.value.identity();

    directions.getSunDirectionECI(date, eci);
    eci.applyMatrix4(matrix);
    uniforms.sunDirectionECEF.value.copy(eci);

    directions.getMoonDirectionECI(date, eci);
    eci.applyMatrix4(matrix);
    uniforms.moonDirectionECEF.value.copy(eci);

    directions.getMoonFixedToECIRotationMatrix(date, matrix);
    matrix.multiply(uniforms.matrixECIToECEF.value);
    uniforms.matrixMoonFixedToECEF.value.copy(matrix);
}
