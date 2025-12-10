/* Copyright (C) 2025 flywave.gl contributors */

import { type CoordinateSystem, type Matrix4, type Plane, Frustum, Matrix3, Vector3 } from "three";

// Temporary matrix for calculations
const _mat3 = new Matrix3();

/**
 * Solves a system of equations to find the point where three planes intersect
 * @param plane1 First plane
 * @param plane2 Second plane
 * @param plane3 Third plane
 * @param target Vector to store the intersection point
 * @returns The intersection point (same as target)
 */
function findIntersectionPoint(
    plane1: Plane,
    plane2: Plane,
    plane3: Plane,
    target: Vector3
): Vector3 {
    // Create the matrix A using the normals of the planes as rows
    const A = _mat3.set(
        plane1.normal.x,
        plane1.normal.y,
        plane1.normal.z,
        plane2.normal.x,
        plane2.normal.y,
        plane2.normal.z,
        plane3.normal.x,
        plane3.normal.y,
        plane3.normal.z
    );

    // Create the vector B using the constants of the planes
    target.set(-plane1.constant, -plane2.constant, -plane3.constant);

    // Solve for X by applying the inverse matrix to B
    target.applyMatrix3(A.invert());

    return target;
}

/**
 * ExtendedFrustum class that adds frustum point calculation to Three.js's Frustum
 *
 * This class extends the basic Frustum functionality by calculating and storing
 * the 8 corner points of the frustum volume. This is useful for visualization
 * and advanced intersection testing.
 */
class ExtendedFrustum extends Frustum {
    /** Array of 8 vectors representing the corner points of the frustum */
    public points: Vector3[];

    constructor() {
        super();
        // Initialize the 8 corner points
        this.points = Array(8)
            .fill(0)
            .map(() => new Vector3());
    }

    /**
     * Sets the frustum planes from a projection matrix and calculates corner points
     * @param m The projection matrix to create the frustum from
     * @param coordinateSystem The coordinate system (optional)
     * @returns This frustum instance
     */
    setFromProjectionMatrix(m: Matrix4, coordinateSystem?: CoordinateSystem): this {
        // Call parent class method to set up the planes
        super.setFromProjectionMatrix(m, coordinateSystem);

        // Calculate the corner points
        this.calculateFrustumPoints();
        return this;
    }

    /**
     * Calculates the 8 corner points of the frustum by finding intersections of planes
     *
     * The points are ordered as:
     * 0: Near top left
     * 1: Near top right
     * 2: Near bottom left
     * 3: Near bottom right
     * 4: Far top left
     * 5: Far top right
     * 6: Far bottom left
     * 7: Far bottom right
     */
    calculateFrustumPoints(): void {
        const { planes, points } = this;

        // Define which planes intersect to form each corner point
        const planeIntersections = [
            [planes[0], planes[3], planes[4]], // Near top left
            [planes[1], planes[3], planes[4]], // Near top right
            [planes[0], planes[2], planes[4]], // Near bottom left
            [planes[1], planes[2], planes[4]], // Near bottom right
            [planes[0], planes[3], planes[5]], // Far top left
            [planes[1], planes[3], planes[5]], // Far top right
            [planes[0], planes[2], planes[5]], // Far bottom left
            [planes[1], planes[2], planes[5]] // Far bottom right
        ];

        // Calculate each corner point by finding the intersection of three planes
        planeIntersections.forEach((planes, index) => {
            findIntersectionPoint(planes[0], planes[1], planes[2], points[index]);
        });
    }
}

export { ExtendedFrustum };
