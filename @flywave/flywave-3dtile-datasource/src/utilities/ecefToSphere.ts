/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, ellipsoidProjection } from "@flywave/flywave-geoutils";
import * as THREE from "three";

/**
 * Transforms ECEF (Earth-Centered, Earth-Fixed) coordinates to a target projection
 * and returns the transformation matrix.
 *
 * This function converts coordinates from the ECEF coordinate system (EPSG:4979, in meters)
 * to a specified target projection, calculating the necessary transformation matrix
 * to properly orient and scale objects in the new coordinate system.
 *
 * @param ecefPos - ECEF coordinates (EPSG:4979, unit: meters)
 * @param targetProjection - Target projection (e.g., SphereProjection)
 * @param isEllipsoid - Whether to perform ellipsoid-based transformation (default: true)
 * @returns Object containing:
 *   - projectedPos: Coordinates in the target projection
 *   - transformMatrix: Transformation matrix to adapt ECEF rotation/scale to target projection
 */
export function transformECEFToProjection(
    ecefPos: THREE.Vector3,
    targetProjection: Projection,
    isEllipsoid: boolean = true
): {
    projectedPos: THREE.Vector3;
    transformMatrix: THREE.Matrix4;
} {
    if (!isEllipsoid) {
        return {
            projectedPos: ecefPos,
            transformMatrix: new THREE.Matrix4().setPosition(ecefPos.x, ecefPos.y, ecefPos.z)
        };
    }
    // 1. Convert ECEF coordinates to geographic coordinates
    const geoCoords = ellipsoidProjection.unprojectPoint(ecefPos);

    // 2. Calculate coordinates in target projection
    const projectedPos = new THREE.Vector3();
    targetProjection.projectPoint(geoCoords, projectedPos);

    // 3. Calculate transformation matrix
    const transformMatrix = new THREE.Matrix4();

    // 3.1 Get local tangent space in ECEF
    const ecefTangentSpace = {
        position: new THREE.Vector3(),
        xAxis: new THREE.Vector3(),
        yAxis: new THREE.Vector3(),
        zAxis: new THREE.Vector3()
    };
    ellipsoidProjection.localTangentSpace(ecefPos, ecefTangentSpace);

    // 3.2 Get local tangent space in target projection
    const targetTangentSpace = {
        position: new THREE.Vector3(),
        xAxis: new THREE.Vector3(),
        yAxis: new THREE.Vector3(),
        zAxis: new THREE.Vector3()
    };
    targetProjection.localTangentSpace(geoCoords, targetTangentSpace);

    // 3.3 Build rotation matrix from ECEF to target projection
    const ecefRotation = new THREE.Matrix4().makeBasis(
        new THREE.Vector3().copy(ecefTangentSpace.xAxis),
        new THREE.Vector3().copy(ecefTangentSpace.yAxis),
        new THREE.Vector3().copy(ecefTangentSpace.zAxis)
    );

    const targetRotation = new THREE.Matrix4().makeBasis(
        new THREE.Vector3().copy(targetTangentSpace.xAxis),
        new THREE.Vector3().copy(targetTangentSpace.yAxis),
        new THREE.Vector3().copy(targetTangentSpace.zAxis)
    );

    // 3.4 Combine translation and rotation
    transformMatrix
        .makeTranslation(projectedPos.x, projectedPos.y, projectedPos.z)
        .multiply(targetRotation)
        .multiply(ecefRotation.invert());

    return {
        projectedPos,
        transformMatrix
    };
}
