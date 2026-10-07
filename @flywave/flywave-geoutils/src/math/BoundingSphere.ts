/* Copyright (C) 2025 flywave.gl contributors */

import { defined } from "@flywave/flywave-utils";
import { type Ray, Sphere as ThreeSphere, Vector3 } from "three/webgpu";

// Reuse vector objects to avoid memory allocations
const fromPointsCurrentPos = new Vector3();
const fromPointsXMin = new Vector3();
const fromPointsYMin = new Vector3();
const fromPointsZMin = new Vector3();
const fromPointsXMax = new Vector3();
const fromPointsYMax = new Vector3();
const fromPointsZMax = new Vector3();
const fromPointsScratch = new Vector3();
const fromPointsNaiveCenterScratch = new Vector3();
const fromPointsRitterCenter = new Vector3();
const fromPointsMinBoxPt = new Vector3();
const fromPointsMaxBoxPt = new Vector3();

export class BoundingSphere {
    readonly center = new Vector3();
    radius: number = 0;

    constructor(center?: Vector3, radius?: number) {
        if (center) {
            this.center.copy(center);
        }
        if (radius !== undefined) {
            this.radius = radius;
        }
    }

    /**
     * Check whether a ray intersects this sphere
     * @param ray the ray to test
     * @returns true if they intersect, otherwise false
     */
    intersectsRay(ray: Ray): boolean {
        const diff = ray.origin.clone().sub(this.center);
        const a = ray.direction.dot(ray.direction);
        const b = 2 * ray.direction.dot(diff);
        const c = diff.dot(diff) - this.radius * this.radius;

        const discriminant = b * b - 4 * a * c;
        return discriminant >= 0;
    }

    /**
     * Create a bounding sphere from an array of points
     * @param positions the array of points
     * @param result optional result object
     * @returns the bounding sphere containing all points
     */
    static fromPoints(positions: Vector3[], result?: BoundingSphere): BoundingSphere {
        if (!defined(result)) {
            result = new BoundingSphere();
        }

        if (!defined(positions) || positions.length === 0) {
            result.center.set(0, 0, 0);
            result.radius = 0;
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

        // First pass: find the min/max points on each axis
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

        // Compute the span of each axis
        const xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
        const ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
        const zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

        // Pick the largest span as the initial diameter
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

        // Compute the Ritter sphere center and radius
        const ritterCenter = fromPointsRitterCenter;
        ritterCenter.addVectors(diameter1, diameter2).multiplyScalar(0.5);
        const radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
        let ritterRadius = Math.sqrt(radiusSquared);

        // Compute the naive bounding box center
        const minBoxPt = fromPointsMinBoxPt.set(xMin.x, yMin.y, zMin.z);
        const maxBoxPt = fromPointsMaxBoxPt.set(xMax.x, yMax.y, zMax.z);
        const naiveCenter = fromPointsNaiveCenterScratch
            .addVectors(minBoxPt, maxBoxPt)
            .multiplyScalar(0.5);

        // Second pass: refine the sphere and compute the naive radius
        let naiveRadius = 0;
        for (let i = 0; i < numPositions; i++) {
            currentPos.copy(positions[i]);

            // Update the naive radius
            const r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
            naiveRadius = Math.max(naiveRadius, r);

            // Grow the Ritter sphere if necessary
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
     * Create a bounding sphere from an array of vertex coordinates
     * @param positions vertex coordinate array [x, y, z, x, y, z, ...]
     * @param center optional center offset
     * @param stride number of components per vertex (defaults to 3)
     * @param result optional result object
     * @returns the bounding sphere containing all vertices
     */
    static fromVertices(
        positions: number[],
        center: Vector3 = new Vector3(),
        stride: number = 3,
        result?: BoundingSphere
    ): BoundingSphere {
        if (!defined(result)) {
            result = new BoundingSphere();
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

        // First pass: find the min/max points on each axis
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

        // Compute the span of each axis
        const xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
        const ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
        const zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

        // Pick the largest span as the initial diameter
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

        // Compute the Ritter sphere center and radius
        const ritterCenter = fromPointsRitterCenter;
        ritterCenter.addVectors(diameter1, diameter2).multiplyScalar(0.5);
        const radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
        let ritterRadius = Math.sqrt(radiusSquared);

        // Compute the naive bounding box center
        const minBoxPt = fromPointsMinBoxPt.set(xMin.x, yMin.y, zMin.z);
        const maxBoxPt = fromPointsMaxBoxPt.set(xMax.x, yMax.y, zMax.z);
        const naiveCenter = fromPointsNaiveCenterScratch
            .addVectors(minBoxPt, maxBoxPt)
            .multiplyScalar(0.5);

        // Second pass: refine the sphere and compute the naive radius
        let naiveRadius = 0;
        for (let i = 0; i < numElements; i += stride) {
            currentPos.set(
                positions[i] + center.x,
                positions[i + 1] + center.y,
                positions[i + 2] + center.z
            );

            // Update the naive radius
            const r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
            naiveRadius = Math.max(naiveRadius, r);

            // Grow the Ritter sphere if necessary
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
     * Create a BoundingSphere from a Three.js Sphere object
     * @param threeSphere the Three.js Sphere object
     * @param result optional result object
     * @returns a new BoundingSphere instance
     */
    static fromThreeSphere(threeSphere: ThreeSphere, result?: BoundingSphere): BoundingSphere {
        if (!defined(result)) {
            result = new BoundingSphere();
        }
        result.center.copy(threeSphere.center);
        result.radius = threeSphere.radius;
        return result;
    }

    /**
     * Convert to a Three.js Sphere object
     * @param result optional result object
     * @returns the Three.js Sphere object
     */
    toThreeSphere(result?: ThreeSphere): ThreeSphere {
        if (!defined(result)) {
            result = new ThreeSphere();
        }
        result.center.copy(this.center);
        result.radius = this.radius;
        return result;
    }

    /**
     * Merge two bounding spheres
     * @param sphere the other bounding sphere to merge with
     * @param result optional result object
     * @returns a new bounding sphere containing both spheres
     */
    union(sphere: BoundingSphere, result?: BoundingSphere): BoundingSphere {
        if (!defined(result)) {
            result = new BoundingSphere();
        }

        const diff = sphere.center.clone().sub(this.center);
        const lengthSq = diff.lengthSq();
        const radiusDiff = sphere.radius - this.radius;
        const radiusDiffSq = radiusDiff * radiusDiff;

        if (radiusDiffSq >= lengthSq) {
            if (radiusDiff >= 0) {
                return result.copy(sphere);
            } else {
                return result.copy(this);
            }
        }

        const length = Math.sqrt(lengthSq);
        const t = (length + sphere.radius - this.radius) / (2 * length);

        result.center.copy(this.center).add(diff.multiplyScalar(t));
        result.radius = (length + this.radius + sphere.radius) * 0.5;

        return result;
    }

    /**
     * Copy the properties of another bounding sphere
     * @param sphere the source sphere to copy from
     * @returns this sphere instance
     */
    copy(sphere: BoundingSphere): this {
        this.center.copy(sphere.center);
        this.radius = sphere.radius;
        return this;
    }

    /**
     * Clone the current bounding sphere
     * @returns a new BoundingSphere instance
     */
    clone(): BoundingSphere {
        return new BoundingSphere(this.center.clone(), this.radius);
    }

    /**
     * Check whether this sphere intersects another bounding sphere
     * @param sphere the other bounding sphere to test
     * @returns true if they intersect, otherwise false
     */
    intersectsSphere(sphere: BoundingSphere): boolean {
        const radiusSum = this.radius + sphere.radius;
        const distanceSq = this.center.distanceToSquared(sphere.center);
        return distanceSq <= radiusSum * radiusSum;
    }

    /**
     * Check whether a point lies inside the sphere
     * @param point the point to test
     * @returns true if the point is inside the sphere, otherwise false
     */
    containsPoint(point: Vector3): boolean {
        return this.center.distanceToSquared(point) <= this.radius * this.radius;
    }

    /**
     * Expand the sphere so that it contains the given point
     * @param point the point to include
     * @returns this sphere instance
     */
    expandByPoint(point: Vector3): this {
        if (!this.containsPoint(point)) {
            const diff = point.clone().sub(this.center);
            const length = diff.length();
            const newRadius = (this.radius + length) * 0.5;
            const centerDiff = (length - this.radius) * 0.5;
            this.center.add(diff.multiplyScalar(centerDiff / length));
            this.radius = newRadius;
        }
        return this;
    }
}

// Compatibility function
export function makeBoundingSphereFromPoints(
    positions: Vector3[],
    result?: BoundingSphere
): BoundingSphere {
    return BoundingSphere.fromPoints(positions, result);
}
