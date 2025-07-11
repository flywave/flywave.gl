/*
 * Complete ECEF (Earth-Centered, Earth-Fixed) Projection
 * Implements Projection interface for EPSG:4979 with WGS84 ellipsoid
 */
import * as THREE from "three";
import { GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoCoordinatesLike, isGeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { Box3Like, isBox3Like } from "../math/Box3Like";
import { isOrientedBox3Like, OrientedBox3Like } from "../math/OrientedBox3Like";
import { TransformLike } from "../math/TransformLike";
import { Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { Projection, ProjectionType } from "./Projection";

export class ECEFProjection extends Projection {
    /** @override */
    readonly type: ProjectionType = ProjectionType.Spherical;

    // WGS84 Ellipsoid Parameters
    private readonly a: number = EarthConstants.EQUATORIAL_RADIUS; // Semi-major axis (6378137.0 m)
    private readonly f: number = 1 / 298.257223563; // Flattening
    private readonly b: number = this.a * (1 - this.f); // Semi-minor axis (~6356752.3142 m)
    private readonly e2: number = 2 * this.f - this.f * this.f; // First eccentricity squared
    private readonly ep2: number = this.e2 / (1 - this.e2); // Second eccentricity squared

    constructor() {
        super(1); // ECEF coordinates are in meters
    }

    /** @override */
    getScaleFactor(_worldPoint: Vector3Like): number {
        return 1; // No scaling needed for ECEF
    }

    /** @override */
    worldExtent<WorldBoundingBox extends Box3Like>(
        minAltitude: number,
        maxAltitude: number,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        if (!result) {
            result = { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } } as WorldBoundingBox;
        }

        const maxRadius = this.a + maxAltitude;
        result.min.x = -maxRadius;
        result.min.y = -maxRadius;
        result.min.z = -this.b - maxAltitude;
        result.max.x = maxRadius;
        result.max.y = maxRadius;
        result.max.z = this.b + maxAltitude;

        return result;
    }

    /** @override */
    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result?: WorldCoordinates
    ): WorldCoordinates {
        if (!result) {
            result = { x: 0, y: 0, z: 0 } as WorldCoordinates;
        }

        const φ = THREE.MathUtils.degToRad(geoPoint.latitude);
        const λ = THREE.MathUtils.degToRad(geoPoint.longitude);
        const h = geoPoint.altitude ?? 0;

        const sinφ = Math.sin(φ);
        const cosφ = Math.cos(φ);
        const sinλ = Math.sin(λ);
        const cosλ = Math.cos(λ);

        // Prime vertical radius of curvature
        const N = this.a / Math.sqrt(1 - this.e2 * sinφ * sinφ);

        result.x = (N + h) * cosφ * cosλ;
        result.y = (N + h) * cosφ * sinλ;
        result.z = (N * (1 - this.e2) + h) * sinφ;

        return result;
    }

    /** @override */
    unprojectPoint(worldPoint: Vector3Like): GeoCoordinates {
        const x = worldPoint.x;
        const y = worldPoint.y;
        const z = worldPoint.z;
        const p = Math.sqrt(x * x + y * y);

        // Longitude (no iteration needed)
        const λ = Math.atan2(y, x);

        // Latitude (requires iteration)
        let φ = Math.atan2(z, p * (1 - this.e2));
        let φPrev = Infinity;
        let N = this.a;
        let sinφ = 0;

        // Bowring's method (typically converges in 2-4 iterations)
        for (let i = 0; i < 10 && Math.abs(φ - φPrev) > 1e-12; i++) {
            φPrev = φ;
            sinφ = Math.sin(φ);
            N = this.a / Math.sqrt(1 - this.e2 * sinφ * sinφ);
            φ = Math.atan2(z + this.ep2 * N * sinφ, p);
        }

        // Height
        const h = p / Math.cos(φ) - N;

        return GeoCoordinates.fromRadians(φ, λ, h);
    }

    /** @override */
    unprojectAltitude(worldPoint: Vector3Like): number {
        return this.unprojectPoint(worldPoint).altitude ?? 0;
    }

    /** @override */
    projectBox<WorldBoundingBox extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result?: WorldBoundingBox
    ): WorldBoundingBox {
        // Create default result if not provided
        if (!result) {
            if (isOrientedBox3Like(result)) {
                result = {
                    position: { x: 0, y: 0, z: 0 },
                    xAxis: { x: 1, y: 0, z: 0 },
                    yAxis: { x: 0, y: 1, z: 0 },
                    zAxis: { x: 0, y: 0, z: 1 },
                    extents: { x: 0, y: 0, z: 0 }
                } as WorldBoundingBox;
            } else {
                result = {
                    min: { x: 0, y: 0, z: 0 },
                    max: { x: 0, y: 0, z: 0 }
                } as WorldBoundingBox;
            }
        }

        // Sample key points
        const points = [
            new GeoCoordinates(geoBox.north, geoBox.west),
            new GeoCoordinates(geoBox.north, geoBox.east),
            new GeoCoordinates(geoBox.south, geoBox.west),
            new GeoCoordinates(geoBox.south, geoBox.east)
        ];

        // Include poles if they're within the box
        if (geoBox.north > 85) points.push(new GeoCoordinates(90, 0));
        if (geoBox.south < -85) points.push(new GeoCoordinates(-90, 0));

        // Calculate bounds
        const min = { x: Infinity, y: Infinity, z: Infinity };
        const max = { x: -Infinity, y: -Infinity, z: -Infinity };

        points.forEach(point => {
            const pos = this.projectPoint(point);
            min.x = Math.min(min.x, pos.x);
            min.y = Math.min(min.y, pos.y);
            min.z = Math.min(min.z, pos.z);
            max.x = Math.max(max.x, pos.x);
            max.y = Math.max(max.y, pos.y);
            max.z = Math.max(max.z, pos.z);
        });

        if (isBox3Like(result)) {
            result.min.x = min.x;
            result.min.y = min.y;
            result.min.z = min.z;
            result.max.x = max.x;
            result.max.y = max.y;
            result.max.z = max.z;
        } else if (isOrientedBox3Like(result)) {
            // Center position
            result.position.x = (min.x + max.x) * 0.5;
            result.position.y = (min.y + max.y) * 0.5;
            result.position.z = (min.z + max.z) * 0.5;

            // Extents (half sizes)
            result.extents.x = (max.x - min.x) * 0.5;
            result.extents.y = (max.y - min.y) * 0.5;
            result.extents.z = (max.z - min.z) * 0.5;

            // Default axes (identity rotation)
            result.xAxis.x = 1;
            result.xAxis.y = 0;
            result.xAxis.z = 0;
            result.yAxis.x = 0;
            result.yAxis.y = 1;
            result.yAxis.z = 0;
            result.zAxis.x = 0;
            result.zAxis.y = 0;
            result.zAxis.z = 1;
        }

        return result;
    }

    /** @override */
    unprojectBox(worldBox: Box3Like): GeoBox {
        const minGeo = this.unprojectPoint(worldBox.min);
        const maxGeo = this.unprojectPoint(worldBox.max);
        return GeoBox.fromCoordinates(minGeo, maxGeo);
    }

    /** @override */
    groundDistance(worldPoint: Vector3Like): number {
        return this.unprojectAltitude(worldPoint);
    }

    /** @override */
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        const geo = this.unprojectPoint(worldPoint);
        const surfacePos = this.projectPoint(new GeoCoordinates(geo.latitude, geo.longitude, 0));
        worldPoint.x = surfacePos.x;
        worldPoint.y = surfacePos.y;
        worldPoint.z = surfacePos.z;
        return worldPoint;
    }

    /** @override */
    surfaceNormal(worldPoint: Vector3Like, normal?: Vector3Like): Vector3Like {
        if (!normal) {
            normal = { x: 0, y: 0, z: 0 };
        }

        const geo = this.unprojectPoint(worldPoint);
        const φ = THREE.MathUtils.degToRad(geo.latitude);
        const λ = THREE.MathUtils.degToRad(geo.longitude);

        normal.x = Math.cos(φ) * Math.cos(λ);
        normal.y = Math.cos(φ) * Math.sin(λ);
        normal.z = Math.sin(φ);

        return normal;
    }

    /** @override */
    localTangentSpace(
        point: GeoCoordinatesLike | Vector3Like,
        result: TransformLike
    ): TransformLike {
        let geoPoint: GeoCoordinates;
        if (isGeoCoordinatesLike(point)) {
            geoPoint = new GeoCoordinates(point.latitude, point.longitude, point.altitude);
            this.projectPoint(geoPoint, result.position);
        } else {
            geoPoint = this.unprojectPoint(point);
            result.position.x = point.x;
            result.position.y = point.y;
            result.position.z = point.z;
        }

        const φ = THREE.MathUtils.degToRad(geoPoint.latitude);
        const λ = THREE.MathUtils.degToRad(geoPoint.longitude);
        const sinφ = Math.sin(φ);
        const cosφ = Math.cos(φ);
        const sinλ = Math.sin(λ);
        const cosλ = Math.cos(λ);

        // East tangent vector (-sinλ, cosλ, 0)
        result.xAxis.x = -sinλ;
        result.xAxis.y = cosλ;
        result.xAxis.z = 0;

        // North tangent vector (-sinφ·cosλ, -sinφ·sinλ, cosφ)
        result.yAxis.x = -sinφ * cosλ;
        result.yAxis.y = -sinφ * sinλ;
        result.yAxis.z = cosφ;

        // Up (normal) vector (cosφ·cosλ, cosφ·sinλ, sinφ)
        result.zAxis.x = cosφ * cosλ;
        result.zAxis.y = cosφ * sinλ;
        result.zAxis.z = sinφ;

        return result;
    }
}

// Singleton instance
export const ecefProjection = new ECEFProjection();
