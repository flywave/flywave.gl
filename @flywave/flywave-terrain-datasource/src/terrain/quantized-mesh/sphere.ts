import { defined } from "@flywave/flywave-utils";
import * as THREE from "three";

// Reusable vectors to avoid allocations
const fromPointsCurrentPos = new THREE.Vector3();
const fromPointsXMin = new THREE.Vector3();
const fromPointsYMin = new THREE.Vector3();
const fromPointsZMin = new THREE.Vector3();
const fromPointsXMax = new THREE.Vector3();
const fromPointsYMax = new THREE.Vector3();
const fromPointsZMax = new THREE.Vector3();
const fromPointsScratch = new THREE.Vector3();
const fromPointsNaiveCenterScratch = new THREE.Vector3();
const fromPointsRitterCenter = new THREE.Vector3();
const fromPointsMinBoxPt = new THREE.Vector3();
const fromPointsMaxBoxPt = new THREE.Vector3();

/**
 * Creates a bounding sphere from an array of 3D points.
 * @param positions Array of THREE.Vector3 points
 * @param result Optional sphere to store the result
 * @returns The bounding sphere containing all points
 */
export function makeBoundingSphereFromPoints(
    positions: THREE.Vector3[],
    result?: THREE.Sphere
): THREE.Sphere {
    if (!defined(result)) {
        result = new THREE.Sphere();
    }

    if (!defined(positions) || positions.length === 0) {
        result.center.set(0, 0, 0);
        result.radius = 0.0;
        return result;
    }

    const currentPos = fromPointsCurrentPos.copy(positions[0]);

    const xMin = fromPointsXMin.copy(currentPos);
    const yMin = fromPointsYMin.copy(currentPos);
    const zMin = fromPointsZMin.copy(currentPos);

    const xMax = fromPointsXMax.copy(currentPos);
    const yMax = fromPointsYMax.copy(currentPos);
    const zMax = fromPointsZMax.copy(currentPos);

    const numPositions = positions.length;

    // First pass: find min/max points along each axis
    for (let i = 1; i < numPositions; i++) {
        currentPos.copy(positions[i]);

        const x = currentPos.x;
        const y = currentPos.y;
        const z = currentPos.z;

        if (x < xMin.x) xMin.copy(currentPos);
        if (x > xMax.x) xMax.copy(currentPos);
        if (y < yMin.y) yMin.copy(currentPos);
        if (y > yMax.y) yMax.copy(currentPos);
        if (z < zMin.z) zMin.copy(currentPos);
        if (z > zMax.z) zMax.copy(currentPos);
    }

    // Compute spans for each axis
    const xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
    const ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
    const zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

    // Find the largest span to use as initial diameter
    let diameter1 = xMin;
    let diameter2 = xMax;
    let maxSpan = xSpan;
    if (ySpan > maxSpan) {
        maxSpan = ySpan;
        diameter1 = yMin;
        diameter2 = yMax;
    }
    if (zSpan > maxSpan) {
        maxSpan = zSpan;
        diameter1 = zMin;
        diameter2 = zMax;
    }

    // Calculate Ritter sphere center and radius
    const ritterCenter = fromPointsRitterCenter;
    ritterCenter.addVectors(diameter1, diameter2).multiplyScalar(0.5);
    const radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
    let ritterRadius = Math.sqrt(radiusSquared);

    // Calculate naive bounding box center
    const minBoxPt = fromPointsMinBoxPt.set(xMin.x, yMin.y, zMin.z);
    const maxBoxPt = fromPointsMaxBoxPt.set(xMax.x, yMax.y, zMax.z);
    const naiveCenter = fromPointsNaiveCenterScratch
        .addVectors(minBoxPt, maxBoxPt)
        .multiplyScalar(0.5);

    // Second pass: adjust sphere and calculate naive radius
    let naiveRadius = 0;
    for (let i = 0; i < numPositions; i++) {
        currentPos.copy(positions[i]);

        // Update naive radius
        const r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
        naiveRadius = Math.max(naiveRadius, r);

        // Adjust Ritter sphere if needed
        const oldCenterToPointSquared = fromPointsScratch
            .subVectors(currentPos, ritterCenter)
            .lengthSq();
        if (oldCenterToPointSquared > radiusSquared) {
            const oldCenterToPoint = Math.sqrt(oldCenterToPointSquared);
            ritterRadius = (ritterRadius + oldCenterToPoint) * 0.5;
            const oldToNew = oldCenterToPoint - ritterRadius;
            ritterCenter.x =
                (ritterRadius * ritterCenter.x + oldToNew * currentPos.x) / oldCenterToPoint;
            ritterCenter.y =
                (ritterRadius * ritterCenter.y + oldToNew * currentPos.y) / oldCenterToPoint;
            ritterCenter.z =
                (ritterRadius * ritterCenter.z + oldToNew * currentPos.z) / oldCenterToPoint;
        }
    }

    // Use the smaller of the two spheres
    if (ritterRadius < naiveRadius) {
        result.center.copy(ritterCenter);
        result.radius = ritterRadius;
    } else {
        result.center.copy(naiveCenter);
        result.radius = naiveRadius;
    }

    return result;
}

/**
 * Creates a bounding sphere from an array of vertex positions.
 * @param positions Flat array of vertex coordinates [x, y, z, x, y, z, ...]
 * @param center Optional center to offset positions
 * @param stride Number of components per vertex (default 3)
 * @param result Optional sphere to store the result
 * @returns The bounding sphere containing all vertices
 */
export function fromVertices(
    positions: number[],
    center: THREE.Vector3 = new THREE.Vector3(),
    stride: number = 3,
    result?: THREE.Sphere
): THREE.Sphere {
    if (!defined(result)) {
        result = new THREE.Sphere();
    }

    if (!defined(positions) || positions.length === 0) {
        result.center.set(0, 0, 0);
        result.radius = 0.0;
        return result;
    }

    const currentPos = fromPointsCurrentPos;
    currentPos.set(positions[0] + center.x, positions[1] + center.y, positions[2] + center.z);

    const xMin = fromPointsXMin.copy(currentPos);
    const yMin = fromPointsYMin.copy(currentPos);
    const zMin = fromPointsZMin.copy(currentPos);

    const xMax = fromPointsXMax.copy(currentPos);
    const yMax = fromPointsYMax.copy(currentPos);
    const zMax = fromPointsZMax.copy(currentPos);

    const numElements = positions.length;

    // First pass: find min/max points along each axis
    for (let i = 0; i < numElements; i += stride) {
        currentPos.set(
            positions[i] + center.x,
            positions[i + 1] + center.y,
            positions[i + 2] + center.z
        );

        if (currentPos.x < xMin.x) xMin.copy(currentPos);
        if (currentPos.x > xMax.x) xMax.copy(currentPos);
        if (currentPos.y < yMin.y) yMin.copy(currentPos);
        if (currentPos.y > yMax.y) yMax.copy(currentPos);
        if (currentPos.z < zMin.z) zMin.copy(currentPos);
        if (currentPos.z > zMax.z) zMax.copy(currentPos);
    }

    // Compute spans for each axis
    const xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
    const ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
    const zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

    // Find the largest span to use as initial diameter
    let diameter1 = xMin;
    let diameter2 = xMax;
    let maxSpan = xSpan;
    if (ySpan > maxSpan) {
        maxSpan = ySpan;
        diameter1 = yMin;
        diameter2 = yMax;
    }
    if (zSpan > maxSpan) {
        maxSpan = zSpan;
        diameter1 = zMin;
        diameter2 = zMax;
    }

    // Calculate Ritter sphere center and radius
    const ritterCenter = fromPointsRitterCenter;
    ritterCenter.addVectors(diameter1, diameter2).multiplyScalar(0.5);
    const radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
    let ritterRadius = Math.sqrt(radiusSquared);

    // Calculate naive bounding box center
    const minBoxPt = fromPointsMinBoxPt.set(xMin.x, yMin.y, zMin.z);
    const maxBoxPt = fromPointsMaxBoxPt.set(xMax.x, yMax.y, zMax.z);
    const naiveCenter = fromPointsNaiveCenterScratch
        .addVectors(minBoxPt, maxBoxPt)
        .multiplyScalar(0.5);

    // Second pass: adjust sphere and calculate naive radius
    let naiveRadius = 0;
    for (let i = 0; i < numElements; i += stride) {
        currentPos.set(
            positions[i] + center.x,
            positions[i + 1] + center.y,
            positions[i + 2] + center.z
        );

        // Update naive radius
        const r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
        naiveRadius = Math.max(naiveRadius, r);

        // Adjust Ritter sphere if needed
        const oldCenterToPointSquared = fromPointsScratch
            .subVectors(currentPos, ritterCenter)
            .lengthSq();
        if (oldCenterToPointSquared > radiusSquared) {
            const oldCenterToPoint = Math.sqrt(oldCenterToPointSquared);
            ritterRadius = (ritterRadius + oldCenterToPoint) * 0.5;
            const oldToNew = oldCenterToPoint - ritterRadius;
            ritterCenter.x =
                (ritterRadius * ritterCenter.x + oldToNew * currentPos.x) / oldCenterToPoint;
            ritterCenter.y =
                (ritterRadius * ritterCenter.y + oldToNew * currentPos.y) / oldCenterToPoint;
            ritterCenter.z =
                (ritterRadius * ritterCenter.z + oldToNew * currentPos.z) / oldCenterToPoint;
        }
    }

    // Use the smaller of the two spheres
    if (ritterRadius < naiveRadius) {
        result.center.copy(ritterCenter);
        result.radius = ritterRadius;
    } else {
        result.center.copy(naiveCenter);
        result.radius = naiveRadius;
    }

    return result;
}
