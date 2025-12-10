/* Copyright (C) 2025 flywave.gl contributors */

/**
 * @file BaseFrustumTester.ts
 * @description Base class for frustum intersection testing
 * @license MIT
 */

import { type Plane, type Triangle, Matrix3, Matrix4, Sphere, Vector3 } from "three";

import { type OrientedBox3 } from "./OrientedBox3";

/**
 * Intersection test results
 */
export enum FrustumIntersection {
    /** Object is completely outside the frustum */
    OUTSIDE = 0,
    /** Object intersects or touches the frustum boundaries */
    INTERSECTS = 1,
    /** Object is completely inside the frustum */
    INSIDE = 2
}

/**
 * Base class for frustum intersection testing
 * Handles floating-point precision issues with configurable epsilon values
 */
export class FrustumTester {
    protected readonly planes: Plane[];
    protected epsilon: number;
    protected localToWorldMatrix: Matrix4;
    protected worldToLocalMatrix: Matrix4;

    /**
     * Creates a new BaseFrustumTester instance
     * @param planes - Array of planes defining the frustum
     * @param epsilon - Tolerance value for floating-point comparisons (default: 1e-6)
     * @param localOrigin - Optional local coordinate system origin for improved precision
     */
    protected constructor(planes: Plane[], epsilon: number = 1e-8, localOrigin?: Vector3) {
        this.planes = planes;
        this.epsilon = Math.max(0, epsilon);

        // Setup coordinate transformation matrices
        this.localToWorldMatrix = new Matrix4();
        this.worldToLocalMatrix = new Matrix4();

        if (localOrigin) {
            this.setLocalOrigin(localOrigin);
        }
    }

    /**
     * Sets the local coordinate system origin for improved precision
     * @param origin - The origin point in world coordinates
     */
    public setLocalOrigin(origin: Vector3): void {
        this.localToWorldMatrix.identity().setPosition(origin);
        this.worldToLocalMatrix.copy(this.localToWorldMatrix).invert();

        // Transform planes to local coordinates
        this.transformPlanesToLocal();
    }

    /**
     * Gets the local coordinate system origin
     * @returns The local origin in world coordinates
     */
    public getLocalOrigin(): Vector3 {
        return new Vector3().setFromMatrixPosition(this.localToWorldMatrix);
    }

    /**
     * Transforms all planes to local coordinates
     */
    protected transformPlanesToLocal(): void {
        const normalMatrix = new Matrix3().getNormalMatrix(this.worldToLocalMatrix);

        for (const plane of this.planes) {
            // Transform plane normal using normal matrix
            const localNormal = plane.normal.clone().applyMatrix3(normalMatrix).normalize();

            // Transform a point on the plane to local coordinates
            const pointOnPlane = plane.normal.clone().multiplyScalar(-plane.constant);
            const localPoint = pointOnPlane.applyMatrix4(this.worldToLocalMatrix);

            // Calculate new constant
            const localConstant = -localNormal.dot(localPoint);

            plane.normal.copy(localNormal);
            plane.constant = localConstant;
        }
    }

    /**
     * Transforms a point from world to local coordinates
     */
    protected worldToLocal(point: Vector3): Vector3 {
        return point.applyMatrix4(this.worldToLocalMatrix);
    }

    /**
     * Transforms a point from local to world coordinates
     */
    protected localToWorld(point: Vector3): Vector3 {
        return point.applyMatrix4(this.localToWorldMatrix);
    }

    /**
     * Expands the frustum to fully contain the given sphere and returns a new FrustumTester
     * @param sphere - The sphere to contain
     * @returns A new FrustumTester with expanded frustum planes
     */
    public expandToCoverSphere(sphere: Sphere): this {
        const localSphere = new Sphere(sphere.center, sphere.radius);

        for (let i = 0; i < this.planes.length; i++) {
            const plane = this.planes[i];
            const distance = plane.distanceToPoint(localSphere.center);

            if (distance < localSphere.radius * 2 - this.epsilon) {
                const moveDistance = localSphere.radius * 2 - distance;
                plane.constant += moveDistance;
            }
        }
        return this;
    }

    /**
     * Creates a copy of this frustum tester
     * @returns A new FrustumTester with the same planes and epsilon
     */
    public clone(): FrustumTester {
        const clonedPlanes = this.planes.map(plane => plane.clone());
        const origin = this.getLocalOrigin();
        return new FrustumTester(clonedPlanes, this.epsilon, origin);
    }

    /**
     * Checks if a point is inside, on the boundary, or outside the frustum
     * @param point - The point to test (in world coordinates)
     * @returns Intersection status
     */
    public pointIntersects(point: Vector3): FrustumIntersection {
        const localPoint = this.worldToLocal(point);
        let isOnBoundary = false;

        for (const plane of this.planes) {
            const distance = plane.distanceToPoint(localPoint);

            if (distance < -this.epsilon) {
                return FrustumIntersection.OUTSIDE;
            }

            if (Math.abs(distance) <= this.epsilon) {
                isOnBoundary = true;
            }
        }

        return isOnBoundary ? FrustumIntersection.INTERSECTS : FrustumIntersection.INSIDE;
    }

    /**
     * Simplified point containment check
     * @param point - The point to test
     * @returns True if the point is inside or on the boundary
     */
    public containsPoint(point: Vector3): boolean {
        return this.pointIntersects(point) !== FrustumIntersection.OUTSIDE;
    }

    /**
     * Checks if a point is strictly inside the frustum (not on the boundary)
     * @param point - The point to test
     * @returns True if the point is strictly inside
     */
    public isPointStrictlyInside(point: Vector3): boolean {
        return this.pointIntersects(point) === FrustumIntersection.INSIDE;
    }

    /**
     * Checks FrustumIntersection between a sphere and the frustum
     */
    public sphereIntersects(sphere: Sphere): FrustumIntersection {
        const localCenter = this.worldToLocal(sphere.center);
        const localSphere = new Sphere(localCenter, sphere.radius);
        let result = FrustumIntersection.INSIDE;

        for (const plane of this.planes) {
            const distance = plane.distanceToPoint(localCenter);

            if (distance < -localSphere.radius - this.epsilon) {
                return FrustumIntersection.OUTSIDE;
            }

            if (distance < localSphere.radius + this.epsilon) {
                result = FrustumIntersection.INTERSECTS;
            }
        }

        return result;
    }

    /**
     * Simplified sphere intersection check
     * @param sphere - The sphere to test
     * @returns True if the sphere intersects or is contained within the frustum
     */
    public intersectsSphere(sphere: Sphere): boolean {
        return this.sphereIntersects(sphere) !== FrustumIntersection.OUTSIDE;
    }

    /**
     * Checks intersection between an oriented box and the frustum
     * @param orientedBox - The oriented box to test
     * @returns FrustumIntersection status
     */
    public orientedBoxIntersects(orientedBox: OrientedBox3): FrustumIntersection {
        let allInside = true;

        for (const plane of this.planes) {
            const normal = plane.normal;
            const radius =
                Math.abs(normal.dot(orientedBox.xAxis)) * orientedBox.extents.x +
                Math.abs(normal.dot(orientedBox.yAxis)) * orientedBox.extents.y +
                Math.abs(normal.dot(orientedBox.zAxis)) * orientedBox.extents.z;

            const distance = plane.distanceToPoint(orientedBox.position);

            if (distance < -radius - this.epsilon) {
                return FrustumIntersection.OUTSIDE;
            }

            if (distance <= radius - this.epsilon) {
                allInside = false;
            }
        }

        return allInside ? FrustumIntersection.INSIDE : FrustumIntersection.INTERSECTS;
    }

    /**
     * Simplified oriented box intersection check
     * @param orientedBox - The oriented box to test
     * @returns True if the box intersects or is contained within the frustum
     */
    public intersectsOrientedBox(orientedBox: OrientedBox3): boolean {
        return this.orientedBoxIntersects(orientedBox) !== FrustumIntersection.OUTSIDE;
    }

    /**
     * Checks intersection between a triangle and the frustum
     * @param triangle - The triangle to test
     * @returns FrustumIntersection status
     */
    public triangleIntersects(triangle: Triangle): FrustumIntersection {
        let allVerticesInside = true;
        let anyVertexOutside = false;

        // Test each vertex against all planes
        for (const vertex of [triangle.a, triangle.b, triangle.c]) {
            const vertexResult = this.pointIntersects(vertex);

            if (vertexResult === FrustumIntersection.OUTSIDE) {
                anyVertexOutside = true;
                allVerticesInside = false;
            } else if (vertexResult === FrustumIntersection.INTERSECTS) {
                allVerticesInside = false;
            }
        }

        // If all vertices are inside, the triangle is completely inside
        if (allVerticesInside) {
            return FrustumIntersection.INSIDE;
        }

        // If any vertex is outside, check if the triangle might still intersect
        if (anyVertexOutside) {
            // Check if the triangle intersects any of the frustum planes
            for (const plane of this.planes) {
                // Test if triangle is completely outside this plane
                const distanceA = plane.distanceToPoint(triangle.a);
                const distanceB = plane.distanceToPoint(triangle.b);
                const distanceC = plane.distanceToPoint(triangle.c);

                if (
                    distanceA < -this.epsilon &&
                    distanceB < -this.epsilon &&
                    distanceC < -this.epsilon
                ) {
                    return FrustumIntersection.OUTSIDE;
                }
            }

            // Additional check: test if any frustum edge intersects the triangle
            if (this.doesTriangleIntersectFrustum(triangle)) {
                return FrustumIntersection.INTERSECTS;
            }

            // Check if triangle contains any part of the frustum (rare but possible)
            if (this.doesTriangleContainFrustumPart(triangle)) {
                return FrustumIntersection.INTERSECTS;
            }
        }

        return FrustumIntersection.INTERSECTS;
    }

    /**
     * Simplified triangle intersection check
     * @param triangle - The triangle to test
     * @returns True if the triangle intersects or is contained within the frustum
     */
    public intersectsTriangle(triangle: Triangle): boolean {
        return this.triangleIntersects(triangle) !== FrustumIntersection.OUTSIDE;
    }

    /**
     * Checks if the frustum completely contains a triangle
     * @param triangle - The triangle to test
     * @returns True if all triangle vertices are strictly inside the frustum
     */
    public containsTriangle(triangle: Triangle): boolean {
        return this.triangleIntersects(triangle) === FrustumIntersection.INSIDE;
    }

    /**
     * Gets the epsilon value used for floating-point comparisons
     * @returns Current epsilon value
     */
    public getEpsilon(): number {
        return this.epsilon;
    }

    /**
     * Sets a new epsilon value for floating-point comparisons
     * @param epsilon - New epsilon value (must be non-negative)
     */
    public setEpsilon(epsilon: number): void {
        this.epsilon = Math.max(0, epsilon);
    }

    /**
     * Gets the planes defining the frustum
     * @returns Array of planes
     */
    public getPlanes(): Plane[] {
        return this.planes;
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Checks if a triangle intersects with any of the frustum edges
     * @param triangle - The triangle to test
     * @returns True if the triangle intersects any frustum edge
     */
    protected doesTriangleIntersectFrustum(triangle: Triangle): boolean {
        // Test triangle edges against frustum planes
        const edges = [
            [triangle.a, triangle.b],
            [triangle.b, triangle.c],
            [triangle.c, triangle.a]
        ];

        for (const [start, end] of edges) {
            for (const plane of this.planes) {
                const startDist = plane.distanceToPoint(start);
                const endDist = plane.distanceToPoint(end);

                // If the edge crosses the plane
                if (startDist * endDist < -this.epsilon) {
                    // Calculate intersection point
                    const direction = new Vector3().subVectors(end, start).normalize();
                    const t = -plane.distanceToPoint(start) / plane.normal.dot(direction);
                    const intersection = new Vector3().copy(start).addScaledVector(direction, t);

                    // Check if intersection point is inside the frustum
                    if (this.containsPoint(intersection)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    /**
     * Checks if the triangle contains any part of the frustum
     * This handles cases where the frustum is partially inside a large triangle
     * @param triangle - The triangle to test
     * @returns True if the triangle contains any frustum corner
     */
    protected doesTriangleContainFrustumPart(triangle: Triangle): boolean {
        const triangleCenter = new Vector3()
            .add(triangle.a)
            .add(triangle.b)
            .add(triangle.c)
            .multiplyScalar(1 / 3);

        for (const plane of this.planes) {
            const distance = plane.distanceToPoint(triangleCenter);
            if (distance > this.epsilon) {
                return true;
            }
        }

        return false;
    }
}
