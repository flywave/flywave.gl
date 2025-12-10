/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { type GeoBox } from "../coordinates/GeoBox";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { type GeoCoordinatesLike, isGeoCoordinatesLike } from "../coordinates/GeoCoordinatesLike";
import { type Box3Like, isBox3Like } from "../math/Box3Like";
import { MathUtils } from "../math/MathUtils";
import { type OrientedBox3Like, isOrientedBox3Like } from "../math/OrientedBox3Like";
import { type TransformLike } from "../math/TransformLike";
import { type Vector3Like } from "../math/Vector3Like";
import { EarthConstants } from "./EarthConstants";
import { mercatorProjection, webMercatorProjection } from "./MercatorProjection";
import { Projection, ProjectionType } from "./Projection";
import { SphereProjection } from "./SphereProjection";

/**
 * Transforms the given vector using the provided basis.
 */
function apply(
    xAxis: Vector3Like,
    yAxis: Vector3Like,
    zAxis: Vector3Like,
    v: Vector3Like
): Vector3Like {
    const x = xAxis.x * v.x + yAxis.x * v.y + zAxis.x * v.z;
    const y = xAxis.y * v.x + yAxis.y * v.y + zAxis.y * v.z;
    const z = xAxis.z * v.x + yAxis.z * v.y + zAxis.z * v.z;
    v.x = x;
    v.y = y;
    v.z = z;
    return v;
}

/**
 * Returns the quadrants for the given longitude. The quadrant is defined as:
 *  - quadrant(+Math.PI * -1.0) = 0
 *  - quadrant(+Math.PI * -0.5) = 1
 *  - quadrant(+Math.PI *  0.0) = 2
 *  - quadrant(+Math.PI *  0.5) = 3
 *  - quadrant(+Math.PI *  1.0) = 4
 *
 * @param longitude - The longitude in radians.
 */
function getLongitudeQuadrant(longitude: number) {
    const oneOverPI = 1 / Math.PI;
    const quadrantIndex = Math.floor(2 * (longitude * oneOverPI + 1));
    return THREE.MathUtils.clamp(quadrantIndex, 0, 4);
}

function lengthOfVector3(worldPoint: Vector3Like): number {
    const d = Math.sqrt(
        worldPoint.x * worldPoint.x + worldPoint.y * worldPoint.y + worldPoint.z * worldPoint.z
    );
    return d;
}

/**
 * Creates a Box3 enclosing the geobox.
 *
 * @param geoBox - Ghe given geobox
 * @param worldBox - The resulting axis aligned bounding box.
 */
function makeBox3<Bounds extends Box3Like>(
    geoBox: GeoBox,
    worldBox: Bounds,
    unitScale: number
): Bounds {
    const halfEquatorialRadius = (unitScale + (geoBox.maxAltitude ?? 0)) * 0.5;

    const minLongitude = THREE.MathUtils.degToRad(geoBox.west);
    const maxLongitude = THREE.MathUtils.degToRad(geoBox.east);

    const minLongitudeQuadrant = getLongitudeQuadrant(minLongitude);
    const maxLongitudeQuadrant = getLongitudeQuadrant(maxLongitude);

    let xMin = Math.cos(minLongitude);
    let xMax = xMin;
    let yMin = Math.sin(minLongitude);
    let yMax = yMin;

    for (
        let quadrantIndex = minLongitudeQuadrant + 1;
        quadrantIndex <= maxLongitudeQuadrant;
        quadrantIndex++
    ) {
        const x = ((quadrantIndex + 1) & 1) * ((quadrantIndex & 2) - 1);
        xMin = Math.min(x, xMin);
        xMax = Math.max(x, xMax);

        const y = (quadrantIndex & 1) * ((quadrantIndex & 2) - 1);
        yMin = Math.min(y, yMin);
        yMax = Math.max(y, yMax);
    }

    const cosMaxLongitude = Math.cos(maxLongitude);
    xMin = Math.min(cosMaxLongitude, xMin);
    xMax = Math.max(cosMaxLongitude, xMax);

    const sinMaxLongitude = Math.sin(maxLongitude);
    yMin = Math.min(sinMaxLongitude, yMin);
    yMax = Math.max(sinMaxLongitude, yMax);

    const xCenter = (xMax + xMin) * halfEquatorialRadius;
    const xExtent = (xMax - xMin) * halfEquatorialRadius;

    const yCenter = (yMax + yMin) * halfEquatorialRadius;
    const yExtent = (yMax - yMin) * halfEquatorialRadius;

    // Calculate Z boundaries.
    const minLatitude = THREE.MathUtils.degToRad(geoBox.south);
    const maxLatutide = THREE.MathUtils.degToRad(geoBox.north);

    const zMax = Math.sin(maxLatutide);
    const zMin = Math.sin(minLatitude);

    const zCenter = (zMax + zMin) * halfEquatorialRadius;
    const zExtent = (zMax - zMin) * halfEquatorialRadius;

    worldBox.min.x = xCenter - xExtent;
    worldBox.min.y = yCenter - yExtent;
    worldBox.min.z = zCenter - zExtent;
    worldBox.max.x = xCenter + xExtent;
    worldBox.max.y = yCenter + yExtent;
    worldBox.max.z = zCenter + zExtent;

    return worldBox;
}

/**
 * Computes the spherical projection of the given geo coordinates.
 *
 * @param geoPoint - The geo coordinates.
 * @param worldpoint - The resulting world coordinates.
 */
function project<WorldCoordinates extends Vector3Like>(
    geoPoint: GeoCoordinatesLike,
    worldpoint: WorldCoordinates,
    unitScale: number
): typeof worldpoint {
    const radius = unitScale + (geoPoint.altitude ?? 0);
    const latitude = THREE.MathUtils.degToRad(geoPoint.latitude);
    const longitude = THREE.MathUtils.degToRad(geoPoint.longitude);
    const cosLatitude = Math.cos(latitude);
    worldpoint.x = radius * cosLatitude * Math.cos(longitude);
    worldpoint.y = radius * cosLatitude * Math.sin(longitude);
    worldpoint.z = radius * Math.sin(latitude);
    return worldpoint;
}

class SphericalEarthProjection extends Projection implements SphereProjection {
    /** @override */
    readonly type: ProjectionType = ProjectionType.Spherical;

    /** @override */
    worldExtent<Bounds extends Box3Like>(
        _minElevation: number,
        maxElevation: number,
        result: Bounds = new THREE.Box3() as Box3Like as Bounds
    ): Bounds {
        const radius = this.unitScale + maxElevation;
        result.min.x = -radius;
        result.min.y = -radius;
        result.min.z = -radius;
        result.max.x = radius;
        result.max.y = radius;
        result.max.z = radius;
        return result;
    }

    /** @override */
    projectPoint<WorldCoordinates extends Vector3Like>(
        geoPoint: GeoCoordinatesLike,
        result: WorldCoordinates = MathUtils.newVector3(0, 0, 0) as WorldCoordinates
    ): WorldCoordinates {
        return project(geoPoint, result, this.unitScale);
    }

    /** @override */
    unprojectPoint(point: Vector3Like): GeoCoordinates {
        const parallelRadiusSq = point.x * point.x + point.y * point.y;
        const parallelRadius = Math.sqrt(parallelRadiusSq);
        const v = point.z / parallelRadius;

        if (isNaN(v)) {
            return GeoCoordinates.fromRadians(0, 0, -this.unitScale);
        }

        const radius = Math.sqrt(parallelRadiusSq + point.z * point.z);

        return GeoCoordinates.fromRadians(
            Math.atan(v),
            Math.atan2(point.y, point.x),
            radius - this.unitScale
        );
    }

    /** @override */
    unprojectAltitude(point: Vector3Like): number {
        const parallelRadiusSq = point.x * point.x + point.y * point.y + point.z * point.z;
        return Math.sqrt(parallelRadiusSq) - EarthConstants.EQUATORIAL_RADIUS;
    }

    /** @override */
    projectBox<Bounds extends Box3Like | OrientedBox3Like>(
        geoBox: GeoBox,
        result: Bounds = new THREE.Box3() as Box3Like as Bounds
    ): Bounds {
        if (isBox3Like(result)) {
            return makeBox3(geoBox, result, this.unitScale);
        } else if (isOrientedBox3Like(result)) {
            if (geoBox.longitudeSpan >= 90) {
                const bounds = makeBox3(geoBox, new THREE.Box3() as Box3Like, this.unitScale);
                MathUtils.newVector3(1, 0, 0, result.xAxis);
                MathUtils.newVector3(0, 1, 0, result.yAxis);
                MathUtils.newVector3(0, 0, 1, result.zAxis);
                result.position.x = (bounds.max.x + bounds.min.x) * 0.5;
                result.position.y = (bounds.max.y + bounds.min.y) * 0.5;
                result.position.z = (bounds.max.z + bounds.min.z) * 0.5;
                result.extents.x = (bounds.max.x - bounds.min.x) * 0.5;
                result.extents.y = (bounds.max.y - bounds.min.y) * 0.5;
                result.extents.z = (bounds.max.z - bounds.min.z) * 0.5;
                return result;
            }

            const { south, west, north, east, center: mid } = geoBox;
            const midX = mid.longitude;
            const midY = mid.latitude;
            const cosSouth = Math.cos(THREE.MathUtils.degToRad(south));
            const sinSouth = Math.sin(THREE.MathUtils.degToRad(south));
            const cosWest = Math.cos(THREE.MathUtils.degToRad(west));
            const sinWest = Math.sin(THREE.MathUtils.degToRad(west));
            const cosNorth = Math.cos(THREE.MathUtils.degToRad(north));
            const sinNorth = Math.sin(THREE.MathUtils.degToRad(north));
            const cosEast = Math.cos(THREE.MathUtils.degToRad(east));
            const sinEast = Math.sin(THREE.MathUtils.degToRad(east));
            const cosMidX = Math.cos(THREE.MathUtils.degToRad(midX));
            const sinMidX = Math.sin(THREE.MathUtils.degToRad(midX));
            const cosMidY = Math.cos(THREE.MathUtils.degToRad(midY));
            const sinMidY = Math.sin(THREE.MathUtils.degToRad(midY));

            // Build the orientation of the OBB using the normal vector and its partial derivates.

            // the sperical coordinates of the mid point of the geobox.
            MathUtils.newVector3(cosMidX * cosMidY, sinMidX * cosMidY, sinMidY, result.zAxis);

            // the partial derivates of the normal vector.
            MathUtils.newVector3(-sinMidX, cosMidX, 0, result.xAxis);
            MathUtils.newVector3(-cosMidX * sinMidY, -sinMidX * sinMidY, cosMidY, result.yAxis);

            let width: number;
            let minY: number;
            let maxY: number;

            if (south >= 0) {
                // abs(dot(southWest - southEast, xAxis))
                width = Math.abs(
                    cosSouth * (cosMidX * (sinWest - sinEast) + sinMidX * (cosEast - cosWest))
                );

                // dot(south, yAxis)
                minY = cosMidY * sinSouth - sinMidY * cosSouth;

                // dot(northEast, zAxis)
                maxY =
                    cosMidY * sinNorth -
                    sinMidY * cosNorth * (cosMidX * cosEast + sinMidX * sinEast);
            } else {
                if (north <= 0) {
                    // abs(dot(northWest - northEast, xAxis))
                    width = Math.abs(
                        cosNorth * (cosMidX * (sinWest - sinEast) + sinMidX * (cosEast - cosWest))
                    );

                    // dot(north, yAxis)
                    maxY = cosMidY * sinNorth - sinMidY * cosNorth;
                } else {
                    // abs(dot(west - east, xAxis))
                    width = Math.abs(cosMidX * (sinWest - sinEast) + sinMidX * (cosEast - cosWest));

                    // dot(northEast, yAxis)
                    maxY =
                        cosMidY * sinNorth -
                        sinMidY * cosNorth * (sinMidX * sinEast + cosMidX * cosEast);
                }

                // dot(southEast, yAxis)
                minY =
                    cosMidY * sinSouth -
                    sinMidY * cosSouth * (cosMidX * cosEast + sinMidX * sinEast);
            }

            const rMax = (this.unitScale + (geoBox.maxAltitude ?? 0)) * 0.5;
            const rMin = (this.unitScale + (geoBox.minAltitude ?? 0)) * 0.5;

            // min(dot(southEast, zAxis), dot(northEast, zAxis))

            const d = cosMidY * (cosMidX * cosEast + sinMidX * sinEast);

            const minZ = Math.min(
                cosNorth * d + sinNorth * sinMidY,
                cosSouth * d + sinSouth * sinMidY
            );

            MathUtils.newVector3(
                width * rMax,
                (maxY - minY) * rMax,
                rMax - minZ * rMin,
                result.extents
            );

            MathUtils.newVector3(0, (minY + maxY) * rMax, rMax + rMax, result.position);

            apply(result.xAxis, result.yAxis, result.zAxis, result.position);

            result.position.x = result.position.x - result.zAxis.x * result.extents.z;
            result.position.y = result.position.y - result.zAxis.y * result.extents.z;
            result.position.z = result.position.z - result.zAxis.z * result.extents.z;

            return result;
        }

        throw new Error("Invalid bounding box");
    }

    /** @override */
    unprojectBox(_worldBox: Box3Like): GeoBox {
        throw new Error("Method not implemented.");
    }

    /** @override */
    getScaleFactor(_worldPoint: Vector3Like): number {
        return 1;
    }

    /** @override */
    groundDistance(worldPoint: Vector3Like): number {
        return lengthOfVector3(worldPoint) - this.unitScale;
    }

    /** @override */
    scalePointToSurface(worldPoint: Vector3Like): Vector3Like {
        const scale = this.unitScale / (lengthOfVector3(worldPoint) || 1);
        worldPoint.x *= scale;
        worldPoint.y *= scale;
        worldPoint.z *= scale;
        return worldPoint;
    }

    /** @override */
    surfaceNormal(worldPoint: Vector3Like, normal?: Vector3Like) {
        if (normal === undefined) {
            normal = { x: 0, y: 0, z: 0 };
        }
        const scale = 1 / (lengthOfVector3(worldPoint) || 1);
        normal.x = worldPoint.x * scale;
        normal.y = worldPoint.y * scale;
        normal.z = worldPoint.z * scale;
        return normal;
    }

    /** @override */
    reprojectPoint(
        sourceProjection: Projection,
        worldPos: Vector3Like,
        result?: Vector3Like
    ): Vector3Like {
        if (sourceProjection === mercatorProjection || sourceProjection === webMercatorProjection) {
            const { x, y, z } = worldPos;
            const r = this.unitScale;
            const mx = x / r - Math.PI;
            const my = y / r - Math.PI;
            const w = Math.exp(my);
            const d = w * w;
            const gx = (2 * w) / (d + 1);
            const gy = (d - 1) / (d + 1);
            const scale = r + z;

            if (result === undefined) {
                result = {} as Vector3Like;
            }

            result.x = Math.cos(mx) * gx * scale;
            result.y = Math.sin(mx) * gx * scale;
            result.z = gy * scale;

            if (sourceProjection === webMercatorProjection) {
                result.z = -result.z;
            }

            return result;
        }

        return super.reprojectPoint(sourceProjection, worldPos, result!);
    }

    localTangentSpace(
        point: GeoCoordinatesLike | Vector3Like,
        result: TransformLike
    ): TransformLike {
        let geoPoint: GeoCoordinatesLike;
        if (isGeoCoordinatesLike(point)) {
            this.projectPoint(point, result.position);
            geoPoint = point;
        } else {
            MathUtils.copyVector3(point, result.position);
            geoPoint = this.unprojectPoint(point);
        }

        const latitude = THREE.MathUtils.degToRad(geoPoint.latitude);
        const longitude = THREE.MathUtils.degToRad(geoPoint.longitude);

        const cosLongitude = Math.cos(longitude);
        const sinLongitude = Math.sin(longitude);
        const cosLatitude = Math.cos(latitude);
        const sinLatitude = Math.sin(latitude);

        MathUtils.newVector3(
            cosLongitude * cosLatitude,
            sinLongitude * cosLatitude,
            sinLatitude,
            result.zAxis
        );

        MathUtils.newVector3(-sinLongitude, cosLongitude, 0, result.xAxis);

        MathUtils.newVector3(
            -cosLongitude * sinLatitude,
            -sinLongitude * sinLatitude,
            cosLatitude,
            result.yAxis
        );
        return result;
    }

    /**
     * Performs ray casting to the sphere surface
     * @param result Intersection point in world coordinates (output)
     * @param rayOrigin Ray origin in world coordinates
     * @param rayTarget Ray target point in world coordinates (used to calculate direction)
     * @param altitude Altitude above sphere surface (meters, default = 0)
     * @returns Distance from ray origin to intersection point, or -1 if no intersection
     */
    rayCast(
        result: Vector3Like,
        rayOrigin: Vector3Like,
        rayTarget: Vector3Like,
        altitude: number = 0
    ): number {
        // 使用THREE.js向量进行计算
        const origin = new THREE.Vector3(rayOrigin.x, rayOrigin.y, rayOrigin.z);
        const target = new THREE.Vector3(rayTarget.x, rayTarget.y, rayTarget.z);

        // 计算射线方向
        const direction = new THREE.Vector3().subVectors(target, origin);

        if (direction.lengthSq() < 1e-30) {
            return -1; // 点太接近
        }

        direction.normalize();

        // 创建射线
        const ray = new THREE.Ray(origin, direction);

        // 计算球体半径
        const sphereRadius = this.unitScale + altitude;
        const sphereCenter = new THREE.Vector3(0, 0, 0);
        const sphere = new THREE.Sphere(sphereCenter, sphereRadius);

        // 使用THREE.js的相交测试 - 返回交点向量或null
        const intersectionPoint = new THREE.Vector3();
        // 没有正方向的交点，检查是否在球体内部
        const distanceToCenter = origin.distanceTo(sphereCenter);
        const isInsideSphere = distanceToCenter < sphereRadius;

        if (isInsideSphere) {
            // 在球体内部，反转方向尝试
            const reversedDirection = direction.clone().negate();
            const reversedRay = new THREE.Ray(origin, reversedDirection);
            const reversedIntersection = reversedRay.intersectSphere(sphere, intersectionPoint);

            if (reversedIntersection !== null) {
                // 计算距离
                const distance = origin.distanceTo(intersectionPoint);

                result.x = intersectionPoint.x;
                result.y = intersectionPoint.y;
                result.z = intersectionPoint.z;
                return distance;
            }
        }
 
        const intersectionResult = ray.intersectSphere(sphere, intersectionPoint);

        if (intersectionResult !== null) {
            // 有交点，计算距离
            const distance = origin.distanceTo(intersectionPoint);

            // 检查交点是否在射线正方向
            const toIntersection = new THREE.Vector3().subVectors(intersectionPoint, origin);
            const dot = toIntersection.dot(direction);

            if (dot > 0) {
                // 交点在射线正方向
                result.x = intersectionPoint.x;
                result.y = intersectionPoint.y;
                result.z = intersectionPoint.z;
                return distance;
            }
        }


        return -1; // 没有有效的交点
    }
}

export const sphereProjection: SphericalEarthProjection = new SphericalEarthProjection(EarthConstants.EQUATORIAL_RADIUS);