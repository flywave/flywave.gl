/* Copyright (C) 2025 flywave.gl contributors */

import { type Projection, GeoBox, GeoCoordinates, OrientedBox3 } from "@flywave/flywave-geoutils";
import { type Box3, type Frustum, type Matrix4, type Ray, MathUtils, Sphere, Vector3 } from "three";

// Temporary vectors for calculations
const _vecX = new Vector3();
const _vecY = new Vector3();
const _vecZ = new Vector3();
const _sphereVec = new Vector3();
const _obbVec = new Vector3();

/**
 * A composite bounding volume that can represent a tile's bounds using:
 * - Sphere
 * - Oriented Bounding Box (OBB)
 * - Ellipsoid Region
 *
 * Provides intersection testing against various geometric primitives.
 */
export class TileBoundingVolume {
    /** Bounding sphere (optional) */
    public sphere: Sphere | null = null;
    /** Oriented bounding box (optional) */
    public obb: OrientedBox3 | null = null;
    /** Ellipsoid region (optional) */
    public region: GeoBox | null = null;
    /** OBB representation of the region (derived) */
    public regionObb: OrientedBox3 | null = null;

    constructor() {}

    /**
     * Tests if a ray intersects this bounding volume
     * @param ray The ray to test against
     * @returns True if the ray intersects the volume
     */
    intersectsRay(ray: Ray): boolean {
        // Early out if we don't hit the sphere
        if (this.sphere && !ray.intersectsSphere(this.sphere)) {
            return false;
        }

        // Check against OBB (either primary or region-derived)
        const obb = this.obb || this.regionObb;
        if (obb && !obb.intersectsRay(ray)) {
            return false;
        }

        return true;
    }

    /**
     * Finds the intersection point of a ray with this bounding volume
     * @param ray The ray to test against
     * @param target Optional target vector to store result
     * @returns The intersection point or null if no intersection
     */
    intersectRay(ray: Ray, target: Vector3 | null = null): Vector3 | null {
        const sphere = this.sphere;
        const obb = this.obb || this.regionObb;

        let sphereDistSq = -Infinity;
        let obbDistSq = -Infinity;

        // Test sphere intersection
        if (sphere) {
            if (ray.intersectSphere(sphere, _sphereVec)) {
                sphereDistSq = sphere.containsPoint(ray.origin)
                    ? 0
                    : ray.origin.distanceToSquared(_sphereVec);
            }
        }

        // Test OBB intersection
        if (obb) {
            if (obb.intersectsRay(ray, _obbVec)) {
                obbDistSq = obb.containsPoint(ray.origin)
                    ? 0
                    : ray.origin.distanceToSquared(_obbVec);
            }
        }

        // No intersection case
        const furthestDist = Math.max(sphereDistSq, obbDistSq);
        if (furthestDist === -Infinity) {
            return null;
        }

        // Return the furthest hit point
        if (target) {
            ray.at(Math.sqrt(furthestDist), target);
            return target;
        }
        return ray.at(Math.sqrt(furthestDist), new Vector3());
    }

    /**
     * Calculates distance from a point to this bounding volume
     * @param point The point to measure from
     * @returns The distance (0 if inside the volume)
     */
    distanceToPoint(point: Vector3): number {
        let sphereDistance = -Infinity;
        let obbDistance = -Infinity;

        // Sphere distance (clipped to 0 inside)
        if (this.sphere) {
            sphereDistance = Math.max(this.sphere.distanceToPoint(point), 0);
        }

        // OBB distance (either primary or region-derived)
        const obb = this.obb || this.regionObb;
        if (obb) {
            obbDistance = obb.distanceToPoint(point);
        }

        // Return the larger distance (more conservative)
        return Math.max(sphereDistance, obbDistance);
    }

    /**
     * Tests if this volume intersects with a frustum
     * @param frustum The frustum to test against
     * @returns True if intersecting
     */
    intersectsFrustum(frustum: Frustum): boolean {
        const obb = this.obb || this.regionObb;

        // Test sphere first
        if (this.sphere && !frustum.intersectsSphere(this.sphere)) {
            return false;
        }

        // Test OBB
        if (obb && !obb.intersects(frustum)) {
            return false;
        }

        // If we have any volume, we intersected
        return Boolean(this.sphere || obb);
    }

    /**
     * Tests if this volume intersects with another sphere
     * @param otherSphere The sphere to test against
     * @returns True if intersecting
     */
    intersectsSphere(otherSphere: Sphere): boolean {
        const obb = this.obb || this.regionObb;

        if (this.sphere && !this.sphere.intersectsSphere(otherSphere)) {
            return false;
        }

        if (obb && !obb.intersectsSphere(otherSphere)) {
            return false;
        }

        return Boolean(this.sphere || obb);
    }

    /**
     * Tests if this volume intersects with another OBB
     * @param otherObb The OBB to test against
     * @returns True if intersecting
     */
    intersectsOBB(otherObb: OrientedBox3): boolean {
        const obb = this.obb || this.regionObb;

        if (this.sphere && !otherObb.intersectsSphere(this.sphere)) {
            return false;
        }

        if (obb && !obb.intersectsOrientedBox(otherObb)) {
            return false;
        }

        return Boolean(this.sphere || obb);
    }

    /**
     * Gets the OBB representation of this volume
     * @param targetBox Box to store the extent
     * @param targetMatrix Matrix to store the transform
     */
    getOBB(targetBox: Box3, targetMatrix: Matrix4): void {
        const obb = this.obb || this.regionObb;
        if (obb) {
            obb.getSize(targetBox.max);
            obb.getRotationMatrix(targetMatrix).setPosition(obb.position);
        }
    }

    /**
     * Gets the axis-aligned bounding box of this volume
     * @param target Box to store the result
     */
    getAABB(target: Box3): void {
        this.sphere.getBoundingBox(target);
    }

    /**
     * Gets the bounding sphere of this volume
     * @param target Sphere to store the result
     */
    getSphere(target: Sphere): void {
        target.copy(this.sphere);
    }

    /**
     * Sets up an oriented bounding box from data
     * @param data The OBB data array (12 elements)
     * @param transform Additional transform to apply
     */
    setObbData(
        projection: Projection,
        data: [
            centerX: number,
            centerY: number,
            centerZ: number,
            xAxisX: number,
            xAxisY: number,
            xAxisZ: number, // X-axis direction
            yAxisX: number,
            yAxisY: number,
            yAxisZ: number, // Y-axis direction
            zAxisX: number,
            zAxisY: number,
            zAxisZ: number // Z-axis direction
        ],
        transform: Matrix4
    ): void {
        // Create transform matrix from axes and position
        const obb = OrientedBox3.fromArray(data).premultiply(transform);
        this.obb = obb;
        this.sphere = obb.getBoundingSphere(new Sphere());
        if (!this.regionObb) {
            this.regionObb = obb;
        }
        if (!this.region) {
            this.region = obb.toGeoBox(projection);
        }
    }

    /**
     * Sets up a bounding sphere from data
     * @param x Sphere center x
     * @param y Sphere center y
     * @param z Sphere center z
     * @param radius Sphere radius
     * @param transform Additional transform to apply
     */
    setSphereData(
        projection: Projection,
        x: number,
        y: number,
        z: number,
        radius: number,
        transform: Matrix4
    ): void {
        const sphere = new Sphere();
        sphere.center.set(x, y, z);
        sphere.radius = radius;
        sphere.applyMatrix4(transform);
        this.sphere = sphere;
        if (!this.region) {
            // Convert sphere to GeoBox
            const centerGeo = projection.unprojectPoint(sphere.center);

            // Find the min/max latitude/longitude that would contain the sphere
            // This is an approximation since a sphere in world space isn't a perfect
            // rectangle in geo coordinates, especially near poles

            // Calculate angular size of the radius at this point's latitude
            const angularSize = Math.asin(
                sphere.radius / (projection.groundDistance(sphere.center) + projection.unitScale)
            );

            // Calculate min/max latitude
            const minLat = Math.max(-90, centerGeo.latitude - MathUtils.radToDeg(angularSize));
            const maxLat = Math.min(90, centerGeo.latitude + MathUtils.radToDeg(angularSize));

            // Calculate min/max longitude
            // Adjust angular size for longitude based on latitude
            const latRad = MathUtils.degToRad(centerGeo.latitude);
            const longitudeAngularSize = angularSize / Math.max(Math.cos(latRad), 0.0001);
            const minLon = centerGeo.longitude - MathUtils.radToDeg(longitudeAngularSize);
            const maxLon = centerGeo.longitude + MathUtils.radToDeg(longitudeAngularSize);

            // Calculate min/max altitude
            const centerDistance = projection.groundDistance(sphere.center);
            const minAlt = centerDistance - sphere.radius;
            const maxAlt = centerDistance + sphere.radius;

            this.region = new GeoBox(
                new GeoCoordinates(minLat, minLon, minAlt),
                new GeoCoordinates(maxLat, maxLon, maxAlt)
            );

            // Also create the region OBB
            if (!this.regionObb) {
                this.regionObb = new OrientedBox3();
                projection.projectBox(this.region, this.regionObb);
            }
        }
    }

    /**
     * Sets up an ellipsoid region bounding volume
     * @param ellipsoid The reference ellipsoid
     * @param west Western bound in radians
     * @param south Southern bound in radians
     * @param east Eastern bound in radians
     * @param north Northern bound in radians
     * @param minHeight Minimum height
     * @param maxHeight Maximum height
     */
    setRegionData(
        projection: Projection,
        west: number,
        south: number,
        east: number,
        north: number,
        minHeight: number,
        maxHeight: number
    ): void {
        // Create GeoBox from region
        const geoBox = new GeoBox(
            GeoCoordinates.fromRadians(south, west, minHeight),
            GeoCoordinates.fromRadians(north, east, maxHeight)
        );

        const obb = new OrientedBox3();
        projection.projectBox(geoBox, obb);
        this.sphere = obb.getBoundingSphere(new Sphere());

        this.region = geoBox;
        this.regionObb = obb;
    }
}
