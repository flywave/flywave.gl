/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix4, Quaternion, Spherical, Vector3 } from "three";

/**
 * Performs spherical linear interpolation (slerp) between two matrices
 * @param matrix1 Starting matrix
 * @param matrix2 Target matrix
 * @param t Interpolation factor (0 to 1)
 * @returns Interpolated matrix
 */
export function slerpMatrices(matrix1: Matrix4, matrix2: Matrix4, t: number): Matrix4 {
    // Extract rotation as quaternions
    const quat1 = new Quaternion().setFromRotationMatrix(matrix1);
    const quat2 = new Quaternion().setFromRotationMatrix(matrix2);

    // Spherical linear interpolation of rotation
    const interpolatedQuat = new Quaternion().copy(quat1).slerp(quat2, t);

    // Linear interpolation of position
    const pos1 = new Vector3().setFromMatrixPosition(matrix1);
    const pos2 = new Vector3().setFromMatrixPosition(matrix2);
    const interpolatedPos = pos1.clone().lerp(pos2, t);

    // Construct resulting matrix
    return new Matrix4().makeRotationFromQuaternion(interpolatedQuat).setPosition(interpolatedPos);
}

/**
 * Performs linear interpolation between two spherical coordinates
 * @param start Starting spherical coordinates
 * @param end Target spherical coordinates
 * @param t Interpolation factor (0 to 1)
 * @returns Interpolated spherical coordinates
 */
export function sphericalLerp(start: Spherical, end: Spherical, t: number): Spherical {
    const result = new Spherical();

    // Interpolate radius
    result.radius = start.radius + (end.radius - start.radius) * t;

    // Interpolate polar angle (theta)
    result.theta = start.theta + (end.theta - start.theta) * t;

    // Interpolate azimuthal angle (phi) - using shortest path
    let phiDelta = end.phi - start.phi;
    if (phiDelta > Math.PI) phiDelta -= 2 * Math.PI;
    if (phiDelta < -Math.PI) phiDelta += 2 * Math.PI;

    result.phi = start.phi + phiDelta * t;

    return result;
}

/**
 * Calculates the angular distance between two spherical coordinates
 * @param a First spherical coordinates
 * @param b Second spherical coordinates
 * @returns Angular distance in radians
 */
export function sphericalAngleBetween(a: Spherical, b: Spherical): number {
    // Convert spherical to cartesian coordinates
    const vec1 = new Vector3().setFromSpherical(a);
    const vec2 = new Vector3().setFromSpherical(b);

    // Calculate dot product and ensure valid range
    const dot = vec1.dot(vec2);
    return Math.acos(Math.min(Math.max(dot, -1), 1));
}

/**
 * Performs ray casting against an ellipsoid
 * @param result Output vector for the intersection point (modified in-place)
 * @param rayOrigin Origin point of the ray (in world coordinates)
 * @param rayTarget Target point of the ray (in world coordinates)
 * @param scaleX Ellipsoid scale along X axis (relative to unit sphere)
 * @param scaleY Ellipsoid scale along Y axis (relative to unit sphere)
 */
export function rayCastToEllipsoid(
    result: Vector3,
    rayOrigin: Vector3,
    rayTarget: Vector3,
    scaleX: number,
    scaleY: number
): number {
    // Extract components for readability
    const y = rayOrigin.x;
    const x = rayOrigin.y;
    const v = rayOrigin.z;

    // Calculate ray direction vector
    const C = rayTarget.x - y;
    const B = rayTarget.y - x;
    const A = rayTarget.z - v;

    // Apply ellipsoid scaling (Z axis remains unscaled)
    const u = v * scaleX;
    const n = A * scaleX;

    // Calculate quadratic equation coefficients
    const w = C * C + B * B + n * n;
    const t = 2 * (C * y + B * x + n * u);
    const s = y * y + x * x + u * u - scaleY * scaleY;

    // Check if ray origin is outside ellipsoid
    if (s > 0) {
        const discriminant = t * t - 4 * w * s;

        // Check for real roots (intersections)
        if (discriminant > 0) {
            // Calculate the intersection parameter
            const intersectionT = (-t - Math.sqrt(discriminant)) / (2 * w);

            // Calculate intersection point
            result.set(y + C * intersectionT, x + B * intersectionT, v + A * intersectionT);

            return intersectionT;
        }
    }

    // No intersection found
    return -1;
}
