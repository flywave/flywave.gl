/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

import { ellipsoidProjection } from "../projection/EllipsoidProjection";
import { type Projection } from "../projection/Projection";

/**
 * Convert ECEF coordinates into the target projection and return the transform matrix
 * @param ecefPos - ECEF coordinates (EPSG:4979, unit: meters)
 * @param targetProjection - the target projection (e.g. SphereProjection)
 * @param isEllipsoid - whether an ellipsoidal projection is used, defaults to true
 * @returns an object containing the projected coordinates and the transform matrix
 * @returns projectedPos - coordinates in the target projection
 * @returns transformMatrix - transform matrix (adapts the ECEF rotation/scale to the target projection)
 */
export function convertEllipsoidToProjection(
    ecefPos: THREE.Vector3,
    targetProjection: Projection,
    isEllipsoid: boolean = true
): {
    projectedPos: THREE.Vector3;
    transformMatrix: THREE.Matrix4;
} {
    // Handle the non-ellipsoidal case
    if (!isEllipsoid) {
        return {
            projectedPos: ecefPos,
            transformMatrix: new THREE.Matrix4().setPosition(ecefPos.x, ecefPos.y, ecefPos.z)
        };
    }

    // 1. Convert the ECEF coordinates to geodetic coordinates
    const geoCoords = ellipsoidProjection.unprojectPoint(ecefPos);

    // 2. Compute the coordinates in the target projection
    const projectedPos = new THREE.Vector3();
    targetProjection.projectPoint(geoCoords, projectedPos);

    // 3. Compute the transform matrix
    const transformMatrix = new THREE.Matrix4();

    // 3.1 Get the local tangent space in ECEF
    const ecefTangentSpace = {
        position: new THREE.Vector3(),
        xAxis: new THREE.Vector3(),
        yAxis: new THREE.Vector3(),
        zAxis: new THREE.Vector3()
    };
    ellipsoidProjection.localTangentSpace(ecefPos, ecefTangentSpace);

    // 3.2 Get the local tangent space in the target projection
    const targetTangentSpace = {
        position: new THREE.Vector3(),
        xAxis: new THREE.Vector3(),
        yAxis: new THREE.Vector3(),
        zAxis: new THREE.Vector3()
    };
    targetProjection.localTangentSpace(geoCoords, targetTangentSpace);

    // 3.3 Build the rotation matrix from ECEF to the target projection
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

    // 3.4 Combine the translation and rotation
    transformMatrix
        .makeTranslation(projectedPos.x, projectedPos.y, projectedPos.z)
        .multiply(targetRotation)
        .multiply(ecefRotation.invert());

    return {
        projectedPos,
        transformMatrix
    };
}
