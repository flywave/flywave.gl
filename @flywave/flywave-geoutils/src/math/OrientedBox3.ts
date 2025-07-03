/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { Frustum, Matrix4, Plane, Quaternion, Ray, Sphere, Vector3 } from "three";

import { OrientedBox3Like } from "./OrientedBox3Like";
import { GeoCoordinates } from "../coordinates/GeoCoordinates";
import { GeoBox } from "../coordinates/GeoBox";
import { Projection } from "../projection/Projection";

function intersectsSlab(
    rayDir: Vector3,
    p: Vector3,
    axis: Vector3,
    extent: number,
    t: { min: number; max: number }
): boolean {
    const epsilon = 1e-20;
    const e = axis.dot(p);
    const f = axis.dot(rayDir);
    if (Math.abs(f) < epsilon) {
        // ray parallel to near/far slab lines.
        return Math.abs(e) <= extent;
    }

    // ray intersects near/far slab lines.
    const finv = 1 / f;
    const t1 = (e + extent) * finv;
    const t2 = (e - extent) * finv;
    if (t1 > t2) {
        // t1 is far intersect, t2 is near.
        if (t2 > t.min) {
            t.min = t2;
        }
        if (t1 < t.max) {
            t.max = t1;
        }
    } else {
        // t1 is near intersect, t2 is far.
        if (t1 > t.min) {
            t.min = t1;
        }
        if (t2 < t.max) {
            t.max = t2;
        }
    }
    return t.min <= t.max && t.max >= 0;
}

const tmpVec = new Vector3();
const tmpT = { min: -Infinity, max: Infinity };

export class OrientedBox3 implements OrientedBox3Like {
    /**
     * The position of the center of this `OrientedBox3`.
     */
    readonly position = new Vector3();

    /**
     * The x-axis of this `OrientedBox3`.
     */
    readonly xAxis = new Vector3(1, 0, 0);

    /**
     * The y-axis of this `OrientedBox3`.
     */
    readonly yAxis = new Vector3(0, 1, 0);

    /**
     * The z-axis of this `OrientedBox3`.
     */
    readonly zAxis = new Vector3(0, 0, 1);

    /**
     * The extents of this `OrientedBox3`.
     */
    readonly extents = new Vector3();

    /**
     * Creates a new `OrientedBox3`.
     */
    constructor();

    /**
     * Creates a new `OrientedBox3` with the given position, orientation and extents.
     *
     * @param position - The position of the center of the `OrientedBox3`.
     * @param rotationMatrix - The rotation of the `OrientedBox3`.
     * @param extents - The extents of the `OrientedBox3`.
     */
    constructor(position: Vector3, rotationMatrix: Matrix4, extents: Vector3);

    /**
     * Creates a new `OrientedBox3`.
     *
     * @hideconstructor
     */
    constructor(position?: Vector3, rotationMatrix?: Matrix4, extents?: Vector3) {
        if (position !== undefined) {
            this.position.copy(position);
        }

        if (rotationMatrix !== undefined) {
            rotationMatrix.extractBasis(this.xAxis, this.yAxis, this.zAxis);
        }

        if (extents !== undefined) {
            this.extents.copy(extents);
        }
    }

    /**
     * Create a copy of this [[OrientedBoundingBox]].
     */
    clone(): OrientedBox3 {
        const newBox = new OrientedBox3();
        newBox.copy(this);
        return newBox;
    }

    /**
     * Copies the values of `other` to this {@link OrientedBox3}.
     * @param other - The other {@link OrientedBox3} to copy.
     */
    copy(other: OrientedBox3) {
        this.position.copy(other.position);
        this.xAxis.copy(other.xAxis);
        this.yAxis.copy(other.yAxis);
        this.zAxis.copy(other.zAxis);
        this.extents.copy(other.extents);
    }

    /**
     * Gets the center position of this {@link OrientedBox3}.
     *
     * @param center - The returned center position.
     */
    getCenter(center = new Vector3()): Vector3 {
        return center.copy(this.position);
    }

    /**
     * Gets the size of this {@link OrientedBox3}.
     *
     * @param size - The returned size.
     */
    getSize(size = new Vector3()): Vector3 {
        return size.copy(this.extents).multiplyScalar(2);
    }

    /**
     * Gets the orientation matrix of this `OrientedBox3`.
     * @param matrix - The output orientation matrix.
     */
    getRotationMatrix(matrix: Matrix4 = new Matrix4()): Matrix4 {
        return matrix.makeBasis(this.xAxis, this.yAxis, this.zAxis);
    }

    /**
     * Checks intersection with the given `THREE.Frustum` or array of `THREE.Plane`s.
     *
     * @param frustumOrPlanes - Frustum or array of planes.
     */
    intersects(frustumOrPlanes: Plane[] | Frustum): boolean {
        const planes: Plane[] = Array.isArray(frustumOrPlanes)
            ? frustumOrPlanes
            : frustumOrPlanes.planes;

        for (const plane of planes) {
            const r =
                Math.abs(plane.normal.dot(this.xAxis) * this.extents.x) +
                Math.abs(plane.normal.dot(this.yAxis) * this.extents.y) +
                Math.abs(plane.normal.dot(this.zAxis) * this.extents.z);

            const d = plane.distanceToPoint(this.position);

            if (d + r < 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Checks intersection with the given ray.
     *
     * @param ray - The ray to test.
     * @returns distance from ray origin to intersection point if it exist, undefined otherwise.
     */
    intersectsRay(ray: Ray, point?: Vector3): number | undefined {
        // Slabs intersection algorithm.
        tmpT.min = -Infinity;
        tmpT.max = Infinity;
        tmpVec.copy(this.position).sub(ray.origin);
        if (!intersectsSlab(ray.direction, tmpVec, this.xAxis, this.extents.x, tmpT)) {
            return undefined;
        }
        if (!intersectsSlab(ray.direction, tmpVec, this.yAxis, this.extents.y, tmpT)) {
            return undefined;
        }
        if (!intersectsSlab(ray.direction, tmpVec, this.zAxis, this.extents.z, tmpT)) {
            return undefined;
        }

        let distance = tmpT.min > 0 ? tmpT.min : tmpT.max;
        if (point) {
            point.copy(ray.origin).addScaledVector(ray.direction, distance);
        }
        return distance;
    }

    /**
     * Returns true if this {@link OrientedBox3} contains the given point.
     *
     * @param point - A valid point.
     */
    contains(point: Vector3): boolean {
        const dx = point.x - this.position.x;
        const dy = point.y - this.position.y;
        const dz = point.z - this.position.z;
        const x = Math.abs(dx * this.xAxis.x + dy * this.xAxis.y + dz * this.xAxis.z);
        const y = Math.abs(dx * this.yAxis.x + dy * this.yAxis.y + dz * this.yAxis.z);
        const z = Math.abs(dx * this.zAxis.x + dy * this.zAxis.y + dz * this.zAxis.z);
        if (x > this.extents.x || y > this.extents.y || z > this.extents.z) {
            return false;
        }
        return true;
    }

    /**
     * Returns the distance from this {@link OrientedBox3} and the given `point`.
     *
     * @param point - A point.
     */
    distanceToPoint(point: Vector3): number {
        return Math.sqrt(this.distanceToPointSquared(point));
    }

    /**
     * Returns the squared distance from this {@link OrientedBox3} and the given `point`.
     *
     * @param point - A point.
     */
    distanceToPointSquared(point: Vector3): number {
        const d = new Vector3();
        d.subVectors(point, this.position);

        const lengths = [d.dot(this.xAxis), d.dot(this.yAxis), d.dot(this.zAxis)];

        let result = 0;

        for (let i = 0; i < 3; ++i) {
            const length = lengths[i];
            const extent = this.extents.getComponent(i);
            if (length < -extent) {
                const dd = extent + length;
                result += dd * dd;
            } else if (length > extent) {
                const dd = length - extent;
                result += dd * dd;
            }
        }

        return result;
    }

    /**
     * Gets a bounding sphere that tightly contains this oriented box.
     * @param result - Optional sphere to store the result.
     * @returns The bounding sphere.
     */
    getBoundingSphere(result?: Sphere): Sphere {
        const sphere = result || new Sphere();

        // The center of the oriented box is the center of the sphere
        sphere.center.copy(this.position);

        // The radius is the distance from center to the farthest corner
        sphere.radius = this.extents.length();

        return sphere;
    }

    /**
     * 将OrientedBox3转换为GeoBox
     * @param orientedBox 要转换的定向包围盒
     * @param projection 使用的投影系统
     * @returns 转换后的地理包围盒
     */
    toGeoBox(projection: Projection): GeoBox {
        // 1. 获取定向包围盒的8个角点
        const corners = this.getOrientedBoxCorners(this);

        // 2. 初始化地理坐标范围
        let minLat = Infinity;
        let maxLat = -Infinity;
        let minLng = Infinity;
        let maxLng = -Infinity;
        let minAlt = Infinity;
        let maxAlt = -Infinity;

        // 3. 将每个角点转换为地理坐标并计算范围
        corners.forEach(corner => {
            const geoCoord = projection.unprojectPoint(corner);

            minLat = Math.min(minLat, geoCoord.latitude);
            maxLat = Math.max(maxLat, geoCoord.latitude);
            minLng = Math.min(minLng, geoCoord.longitude);
            maxLng = Math.max(maxLng, geoCoord.longitude);

            if (geoCoord.altitude !== undefined) {
                minAlt = Math.min(minAlt, geoCoord.altitude);
                maxAlt = Math.max(maxAlt, geoCoord.altitude);
            }
        });

        // 4. 创建并返回GeoBox
        const southWest = new GeoCoordinates(minLat, minLng, isFinite(minAlt) ? minAlt : undefined);
        const northEast = new GeoCoordinates(maxLat, maxLng, isFinite(maxAlt) ? maxAlt : undefined);

        return new GeoBox(southWest, northEast);
    }

    /**
     * 获取定向包围盒的8个角点
     * @param box 定向包围盒
     * @returns 8个角点的世界坐标数组
     */
    private getOrientedBoxCorners(box: OrientedBox3): Vector3[] {
        const corners: Vector3[] = [];
        const { position, xAxis, yAxis, zAxis, extents } = box;

        // 计算8个角点的相对位置
        const dx = new Vector3().copy(xAxis).multiplyScalar(extents.x);
        const dy = new Vector3().copy(yAxis).multiplyScalar(extents.y);
        const dz = new Vector3().copy(zAxis).multiplyScalar(extents.z);

        // 生成所有组合
        for (let x = -1; x <= 1; x += 2) {
            for (let y = -1; y <= 1; y += 2) {
                for (let z = -1; z <= 1; z += 2) {
                    const corner = new Vector3()
                        .copy(position)
                        .add(dx.clone().multiplyScalar(x))
                        .add(dy.clone().multiplyScalar(y))
                        .add(dz.clone().multiplyScalar(z));
                    corners.push(corner);
                }
            }
        }

        return corners;
    }
    /**
     * 从3D Tiles orientedBox数组初始化OrientedBox3
     * @param array 12元素数组 [中心X,Y,Z, X轴X,Y,Z, Y轴X,Y,Z, Z轴X,Y,Z]
     */
    static fromArray(array: number[]): OrientedBox3 {
        const position = new Vector3(array[0], array[1], array[2]);

        const xAxis = new Vector3(array[3], array[4], array[5]);
        const yAxis = new Vector3(array[6], array[7], array[8]);
        const zAxis = new Vector3(array[9], array[10], array[11]);

        // 创建临时矩阵用于提取缩放值
        const matrix = new Matrix4();
        matrix.makeBasis(xAxis, yAxis, zAxis);
        const scale = new Vector3();
        matrix.decompose(new Vector3(), new Quaternion(), scale);

        // 标准化轴向向量
        xAxis.normalize();
        yAxis.normalize();
        zAxis.normalize();

        const orientedBox = new OrientedBox3(
            position,
            matrix,
            new Vector3(scale.x, scale.y, scale.z)
        );

        return orientedBox;
    }

    /**
     * 转换为3D Tiles orientedBox数组格式
     * @returns 12元素数组 [中心X,Y,Z, X轴X,Y,Z, Y轴X,Y,Z, Z轴X,Y,Z]
     */
    toArray(): number[] {
        const matrix = this.getRotationMatrix();
        matrix.scale(this.extents); // 将缩放值应用到轴向

        return [
            this.position.x,
            this.position.y,
            this.position.z,
            matrix.elements[0],
            matrix.elements[4],
            matrix.elements[8],
            matrix.elements[1],
            matrix.elements[5],
            matrix.elements[9],
            matrix.elements[2],
            matrix.elements[6],
            matrix.elements[10]
        ];
    }
}
