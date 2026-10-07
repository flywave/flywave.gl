/* Copyright (C) 2025 flywave.gl contributors */

/**
 * @file FrustumGeoAreaTester.ts
 * @description Test intersection between geometric objects and a geographical frustum area
 * @license MIT
 */

import { Matrix3, Matrix4, Plane, Vector3 } from "three/webgpu";

import { type GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { type Projection, ProjectionType } from "../projection/Projection";
import { FrustumTester } from "./FrustumTester";

/**
 * Represents a geographical frustum area with altitude bounds
 */
export interface FrustumGeoArea {
    /** Maximum altitude of the frustum */
    topAltitude: number;
    /** Minimum altitude of the frustum */
    bottomAltitude: number;
    /** Geographical area definition, either as a GeoBox or polygon coordinates */
    geoArea: GeoBox | GeoCoordinates[];
}

/**
 * Tests intersection between geometric objects and a geographical frustum area
 * Extends BaseFrustumTester with geographical coordinate support
 */
export class FrustumGeoAreaTester extends FrustumTester {
    private readonly projection: Projection;
    private readonly worldOrigin: Vector3;

    /**
     * Creates a new FrustumGeoAreaTester instance
     * @param frustumGeoArea - The geographical frustum area to test against
     * @param projection - The projection system to use for coordinate conversion
     * @param epsilon - Tolerance value for floating-point comparisons (default: 1e-6)
     * @throws {TypeError} If projection is invalid
     * @throws {Error} If geoArea is empty or invalid
     */
    constructor(
        frustumGeoArea: FrustumGeoArea,
        origin: Vector3,
        projection: Projection,
        epsilon: number = 1e-6
    ) {
        if (!projection) {
            throw new TypeError("Projection must be provided");
        }

        // Calculate world origin for local coordinate system
        const centerGeo = FrustumGeoAreaTester.calculateGeoAreaCenter(frustumGeoArea.geoArea);
        centerGeo.altitude = (frustumGeoArea.topAltitude + frustumGeoArea.bottomAltitude) / 2;

        const planes = FrustumGeoAreaTester.createFrustumFromGeoArea(
            frustumGeoArea,
            projection,
            origin
        );

        super(planes, epsilon, origin);

        this.projection = projection;
        this.worldOrigin = origin;
    }

    /**
     * Gets the projection system used by this tester
     * @returns The projection system
     */
    public getProjection(): Projection {
        return this.projection;
    }

    /**
     * Gets the world origin used for local coordinate system
     * @returns The world origin point
     */
    public getWorldOrigin(): Vector3 {
        return this.worldOrigin.clone();
    }

    /**
     * Creates a frustum from a geographical area with local coordinate optimization
     */
    private static createFrustumFromGeoArea(
        frustumGeoArea: FrustumGeoArea,
        projection: Projection,
        localOrigin: Vector3
    ): Plane[] {
        const { topAltitude, bottomAltitude, geoArea } = frustumGeoArea;

        if (!geoArea || (Array.isArray(geoArea) && geoArea.length === 0)) {
            throw new Error("GeoArea must not be empty");
        }

        const planes: Plane[] = [];
        const transformMatrix = new Matrix4().setPosition(localOrigin).invert();

        if (projection.type === ProjectionType.Planar) {
            FrustumGeoAreaTester.createPlanarFrustumPlanes(
                topAltitude,
                bottomAltitude,
                planes,
                transformMatrix
            );
        } else {
            FrustumGeoAreaTester.createSphericalFrustumPlanes(
                topAltitude,
                bottomAltitude,
                geoArea,
                projection,
                planes,
                transformMatrix
            );
        }

        const coordinates = Array.isArray(geoArea)
            ? geoArea
            : FrustumGeoAreaTester.createCoordinatesFromGeoBox(geoArea, topAltitude);

        FrustumGeoAreaTester.createSidePlanes(
            coordinates,
            topAltitude,
            bottomAltitude,
            projection,
            planes,
            transformMatrix
        );

        return planes;
    }

    /**
     * Creates frustum planes for planar projections with local coordinate transformation
     */
    private static createPlanarFrustumPlanes(
        topAltitude: number,
        bottomAltitude: number,
        planes: Plane[],
        transformMatrix: Matrix4
    ): void {
        // Create planes in world coordinates
        const topPlaneWorld = new Plane(new Vector3(0, 0, -1), topAltitude);
        const bottomPlaneWorld = new Plane(new Vector3(0, 0, 1), -bottomAltitude);

        // Transform to local coordinates
        const topPlane = FrustumGeoAreaTester.transformPlaneToLocal(topPlaneWorld, transformMatrix);
        const bottomPlane = FrustumGeoAreaTester.transformPlaneToLocal(
            bottomPlaneWorld,
            transformMatrix
        );

        planes.push(topPlane, bottomPlane);
    }

    /**
     * Creates frustum planes for spherical projections with local coordinate transformation
     *
     * The top/bottom planes approximate a spherical shell: the normal is the radial
     * direction at the area center, and `constant` takes the most conservative value
     * over the radial projections of all corners. Using the tangent plane at the
     * center directly (constant = ±R_center) makes the plane noticeably tilted for
     * large-extent areas, so regions away from the center are judged to be outside
     * the shell (a false OUTSIDE that wrongly clips StratumTileCliper terrain tiles).
     */
    private static createSphericalFrustumPlanes(
        topAltitude: number,
        bottomAltitude: number,
        geoArea: GeoBox | GeoCoordinates[],
        projection: Projection,
        planes: Plane[],
        transformMatrix: Matrix4
    ): void {
        const centerGeo = FrustumGeoAreaTester.calculateGeoAreaCenter(geoArea);

        const centerTop = centerGeo.clone();
        centerTop.altitude = topAltitude;
        const centerTopWorld = projection.projectPoint(centerTop, new Vector3());
        const radial = centerTopWorld.clone().normalize();

        // Sample points: vertices + the midpoint of every edge. The extrema of the
        // linear function p̂·x over a spherical region lie on the boundary and often
        // at edge midpoints (the four corners are actually closer to the center),
        // so sampling only the corners is not conservative enough
        const outlineCoords: GeoCoordinates[] = Array.isArray(geoArea)
            ? geoArea
            : FrustumGeoAreaTester.createCoordinatesFromGeoBox(geoArea, 0);
        const sampleCoords: GeoCoordinates[] = [];
        for (let i = 0; i < outlineCoords.length - 1; ++i) {
            const a = outlineCoords[i];
            const b = outlineCoords[i + 1];
            sampleCoords.push(a);
            sampleCoords.push(
                new GeoCoordinates(
                    (a.latitude + b.latitude) / 2,
                    (a.longitude + b.longitude) / 2,
                    0
                )
            );
        }

        let minBottomProjection = Number.POSITIVE_INFINITY;
        let maxTopProjection = Number.NEGATIVE_INFINITY;
        for (const sample of sampleCoords) {
            const topWorld = projection.projectPoint(
                new GeoCoordinates(sample.latitude, sample.longitude, topAltitude),
                new Vector3()
            );
            maxTopProjection = Math.max(maxTopProjection, radial.dot(topWorld));

            const bottomWorld = projection.projectPoint(
                new GeoCoordinates(sample.latitude, sample.longitude, bottomAltitude),
                new Vector3()
            );
            minBottomProjection = Math.min(minBottomProjection, radial.dot(bottomWorld));
        }

        // Bottom plane: d = radial·x − minBottomProjection ≥ 0 (radial projection of
        // points inside the region ≥ the minimum over the sampled points)
        const bottomPlaneWorld = new Plane(radial, -minBottomProjection);
        // Top plane: d = −radial·x + maxTopProjection ≥ 0
        const topPlaneWorld = new Plane(radial.clone().negate(), maxTopProjection);

        // Transform to local coordinates
        const topPlane = FrustumGeoAreaTester.transformPlaneToLocal(topPlaneWorld, transformMatrix);
        const bottomPlane = FrustumGeoAreaTester.transformPlaneToLocal(
            bottomPlaneWorld,
            transformMatrix
        );

        planes.push(topPlane, bottomPlane);
    }

    /**
     * Transforms a plane from world to local coordinates
     */
    private static transformPlaneToLocal(plane: Plane, transformMatrix: Matrix4): Plane {
        const normalMatrix = new Matrix3().getNormalMatrix(transformMatrix);

        // Transform plane normal
        const localNormal = plane.normal.clone().applyMatrix3(normalMatrix).normalize();

        // Transform a point on the plane
        const pointOnPlane = plane.normal.clone().multiplyScalar(-plane.constant);
        const localPoint = pointOnPlane.applyMatrix4(transformMatrix);

        // Calculate new constant
        const localConstant = -localNormal.dot(localPoint);

        return new Plane(localNormal, localConstant);
    }

    /**
     * Creates coordinates array from a GeoBox
     */
    private static createCoordinatesFromGeoBox(
        geoBox: GeoBox,
        topAltitude: number
    ): GeoCoordinates[] {
        const { south, west, north, east } = geoBox;

        return [
            new GeoCoordinates(south, west, topAltitude),
            new GeoCoordinates(north, west, topAltitude),
            new GeoCoordinates(north, east, topAltitude),
            new GeoCoordinates(south, east, topAltitude),
            new GeoCoordinates(south, west, topAltitude) // Close the polygon
        ];
    }

    private static createSidePlanes(
        coordinates: GeoCoordinates[],
        topAltitude: number,
        bottomAltitude: number,
        projection: Projection,
        planes: Plane[],
        transformMatrix: Matrix4
    ): void {
        const worldPointsTop: Vector3[] = [];
        const worldPointsBottom: Vector3[] = [];

        // Project all points to world coordinates
        for (let i = 0; i < coordinates.length; i++) {
            const coord = coordinates[i];
            worldPointsTop.push(
                projection.projectPoint(
                    new GeoCoordinates(coord.latitude, coord.longitude, topAltitude),
                    new Vector3()
                )
            );
            worldPointsBottom.push(
                projection.projectPoint(
                    new GeoCoordinates(coord.latitude, coord.longitude, bottomAltitude),
                    new Vector3()
                )
            );
        }

        // Transform points to local coordinates
        const localPointsTop = worldPointsTop.map(point => point.applyMatrix4(transformMatrix));
        const localPointsBottom = worldPointsBottom.map(point =>
            point.applyMatrix4(transformMatrix)
        );

        // Interior reference point (polygon centroid, altitude at the mid-height of
        // top/bottom): used to orient the side normals edge by edge. The global
        // shoelace winding test is sensitive to closing noise/corners at the seam and
        // has been observed to produce reversed normals on individual edges (falsely
        // judging the interior as OUTSIDE); centroid-based per-edge orientation is a
        // local correction that is robust for the convex / near-convex outlines of
        // FrustumGeoArea.
        const centroidGeo = FrustumGeoAreaTester.calculateGeoAreaCenter(coordinates);
        const centroidWorld = projection.projectPoint(
            new GeoCoordinates(
                centroidGeo.latitude,
                centroidGeo.longitude,
                (topAltitude + bottomAltitude) / 2
            ),
            new Vector3()
        );
        const localCentroid = centroidWorld.applyMatrix4(transformMatrix);

        // Create side planes in local coordinates
        for (let i = 0; i < coordinates.length - 1; i++) {
            const j = (i + 1) % coordinates.length;

            const top1 = localPointsTop[i];
            const top2 = localPointsTop[j];
            const bottom1 = localPointsBottom[i];

            if (top1.distanceTo(top2) < 1e-6) {
                continue;
            }

            const edge = new Vector3().subVectors(top2, top1);
            const vertical = new Vector3().subVectors(bottom1, top1);
            const normal = new Vector3().crossVectors(edge, vertical).normalize();

            // The normal must place the interior of the region (the centroid) on the
            // positive side; flip it if it does not
            if (normal.dot(new Vector3().subVectors(localCentroid, top1)) < 0) {
                normal.negate();
            }

            const constant = -normal.dot(top1);
            const sidePlane = new Plane(normal, constant);

            planes.push(sidePlane);
        }
    }

    /**
     * Calculates the geographical center of an area
     */
    private static calculateGeoAreaCenter(geoArea: GeoBox | GeoCoordinates[]): GeoCoordinates {
        if (Array.isArray(geoArea)) {
            return FrustumGeoAreaTester.calculatePolygonCenter(geoArea);
        }

        return geoArea.center;
    }

    /**
     * Calculates the center point of a polygon
     */
    private static calculatePolygonCenter(coordinates: GeoCoordinates[]): GeoCoordinates {
        if (coordinates.length === 0) {
            throw new Error("Cannot calculate center of empty polygon");
        }

        let latSum = 0;
        let lngSum = 0;

        for (const coord of coordinates) {
            latSum += coord.latitude;
            lngSum += coord.longitude;
        }

        return new GeoCoordinates(latSum / coordinates.length, lngSum / coordinates.length);
    }
}
