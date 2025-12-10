/* Copyright (C) 2025 flywave.gl contributors */

/**
 * @file FrustumGeoAreaTester.ts
 * @description Test intersection between geometric objects and a geographical frustum area
 * @license MIT
 */

import { Matrix3, Matrix4, Plane, Vector3 } from "three";

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

        const topGeo = centerGeo.clone();
        topGeo.altitude = topAltitude;

        const bottomGeo = centerGeo.clone();
        bottomGeo.altitude = bottomAltitude;

        const topGeoWorld = projection.projectPoint(topGeo, new Vector3());
        const topGeoNormal = topGeoWorld.clone().normalize();
        const bottomGeoWorld = projection.projectPoint(bottomGeo, new Vector3());
        const bottomGeoNormal = bottomGeoWorld.clone().normalize();

        const topPlaneWorld = new Plane(topGeoNormal.negate(), topGeoWorld.length());
        const bottomPlaneWorld = new Plane(bottomGeoNormal, -bottomGeoWorld.length());

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

        // Determine polygon winding order
        const isClockwise = this.isPolygonClockwise(coordinates);

        // Create side planes in local coordinates
        for (let i = 0; i < coordinates.length - 1; i++) {
            const j = (i + 1) % coordinates.length;

            const top1 = localPointsTop[i];
            const top2 = localPointsTop[j];
            const bottom1 = localPointsBottom[i];

            if (top1.distanceTo(top2) < 1e-6) {
                continue;
            }

            // Calculate normal based on winding order
            const normal = this.calculateNormalWithWinding(top1, top2, bottom1, isClockwise);

            const constant = -normal.dot(top1);
            const sidePlane = new Plane(normal, constant);

            planes.push(sidePlane);
        }
    }

    /**
     * 判断多边形是否是顺时针方向
     */
    private static isPolygonClockwise(coordinates: GeoCoordinates[]): boolean {
        let area = 0;
        for (let i = 0; i < coordinates.length - 1; i++) {
            const j = (i + 1) % coordinates.length;
            area +=
                (coordinates[j].longitude - coordinates[i].longitude) *
                (coordinates[j].latitude + coordinates[i].latitude);
        }
        return area > 0;
    }

    /**
     * 根据缠绕顺序计算法线
     */
    private static calculateNormalWithWinding(
        top1: Vector3,
        top2: Vector3,
        bottom1: Vector3,
        isClockwise: boolean
    ): Vector3 {
        const edge = new Vector3().subVectors(top2, top1);
        const vertical = new Vector3().subVectors(bottom1, top1);

        const normal = new Vector3().crossVectors(edge, vertical).normalize();

        // 根据缠绕顺序调整法线方向
        if (isClockwise) {
            normal.negate();
        }

        return normal;
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
