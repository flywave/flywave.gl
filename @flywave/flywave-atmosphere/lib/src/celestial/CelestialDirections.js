// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
import { Matrix4, Vector3 } from "three";
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
export function updateCelestialDirections(uniforms, directions, date, scratchECI, scratchMatrix) {
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
//# sourceMappingURL=CelestialDirections.js.map