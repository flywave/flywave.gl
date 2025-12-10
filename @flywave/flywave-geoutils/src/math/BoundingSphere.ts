/* Copyright (C) 2025 flywave.gl contributors */

import { defined } from "@flywave/flywave-utils";
import { type Ray, Sphere as ThreeSphere, Vector3 } from "three";

// 重用向量对象以避免内存分配
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
     * 检查射线是否与球体相交
     * @param ray 要测试的射线
     * @returns 如果相交返回true，否则返回false
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
     * 从点数组创建包围球
     * @param positions 点数组
     * @param result 可选的结果对象
     * @returns 包含所有点的包围球
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

        // 第一遍：找到每个轴上的最小/最大点
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

        // 计算每个轴的跨度
        const xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
        const ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
        const zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

        // 找到最大跨度作为初始直径
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

        // 计算Ritter球中心点和半径
        const ritterCenter = fromPointsRitterCenter;
        ritterCenter.addVectors(diameter1, diameter2).multiplyScalar(0.5);
        const radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
        let ritterRadius = Math.sqrt(radiusSquared);

        // 计算简单包围盒中心点
        const minBoxPt = fromPointsMinBoxPt.set(xMin.x, yMin.y, zMin.z);
        const maxBoxPt = fromPointsMaxBoxPt.set(xMax.x, yMax.y, zMax.z);
        const naiveCenter = fromPointsNaiveCenterScratch
            .addVectors(minBoxPt, maxBoxPt)
            .multiplyScalar(0.5);

        // 第二遍：调整球体并计算简单半径
        let naiveRadius = 0;
        for (let i = 0; i < numPositions; i++) {
            currentPos.copy(positions[i]);

            // 更新简单半径
            const r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
            naiveRadius = Math.max(naiveRadius, r);

            // 如果需要，调整Ritter球
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

        // 使用两个球中较小的一个
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
     * 从顶点数组创建包围球
     * @param positions 顶点坐标数组 [x, y, z, x, y, z, ...]
     * @param center 可选的中心偏移
     * @param stride 每个顶点的组件数（默认为3）
     * @param result 可选的结果对象
     * @returns 包含所有顶点的包围球
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

        // 第一遍：找到每个轴上的最小/最大点
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

        // 计算每个轴的跨度
        const xSpan = fromPointsScratch.subVectors(xMax, xMin).lengthSq();
        const ySpan = fromPointsScratch.subVectors(yMax, yMin).lengthSq();
        const zSpan = fromPointsScratch.subVectors(zMax, zMin).lengthSq();

        // 找到最大跨度作为初始直径
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

        // 计算Ritter球中心点和半径
        const ritterCenter = fromPointsRitterCenter;
        ritterCenter.addVectors(diameter1, diameter2).multiplyScalar(0.5);
        const radiusSquared = fromPointsScratch.subVectors(diameter2, ritterCenter).lengthSq();
        let ritterRadius = Math.sqrt(radiusSquared);

        // 计算简单包围盒中心点
        const minBoxPt = fromPointsMinBoxPt.set(xMin.x, yMin.y, zMin.z);
        const maxBoxPt = fromPointsMaxBoxPt.set(xMax.x, yMax.y, zMax.z);
        const naiveCenter = fromPointsNaiveCenterScratch
            .addVectors(minBoxPt, maxBoxPt)
            .multiplyScalar(0.5);

        // 第二遍：调整球体并计算简单半径
        let naiveRadius = 0;
        for (let i = 0; i < numElements; i += stride) {
            currentPos.set(
                positions[i] + center.x,
                positions[i + 1] + center.y,
                positions[i + 2] + center.z
            );

            // 更新简单半径
            const r = fromPointsScratch.subVectors(currentPos, naiveCenter).length();
            naiveRadius = Math.max(naiveRadius, r);

            // 如果需要，调整Ritter球
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

        // 使用两个球中较小的一个
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
     * 从Three.js的Sphere对象创建BoundingSphere
     * @param threeSphere Three.js的Sphere对象
     * @param result 可选的结果对象
     * @returns 新的BoundingSphere实例
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
     * 转换为Three.js的Sphere对象
     * @param result 可选的结果对象
     * @returns Three.js的Sphere对象
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
     * 合并两个包围球
     * @param sphere 要合并的另一个包围球
     * @param result 可选的结果对象
     * @returns 包含两个球的新包围球
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
     * 复制另一个包围球的属性
     * @param sphere 要复制的源球体
     * @returns 当前球体实例
     */
    copy(sphere: BoundingSphere): this {
        this.center.copy(sphere.center);
        this.radius = sphere.radius;
        return this;
    }

    /**
     * 克隆当前包围球
     * @returns 新的BoundingSphere实例
     */
    clone(): BoundingSphere {
        return new BoundingSphere(this.center.clone(), this.radius);
    }

    /**
     * 检查是否与另一个包围球相交
     * @param sphere 要测试的另一个包围球
     * @returns 如果相交返回true，否则返回false
     */
    intersectsSphere(sphere: BoundingSphere): boolean {
        const radiusSum = this.radius + sphere.radius;
        const distanceSq = this.center.distanceToSquared(sphere.center);
        return distanceSq <= radiusSum * radiusSum;
    }

    /**
     * 检查点是否在球体内
     * @param point 要测试的点
     * @returns 如果点在球体内返回true，否则返回false
     */
    containsPoint(point: Vector3): boolean {
        return this.center.distanceToSquared(point) <= this.radius * this.radius;
    }

    /**
     * 扩展球体以包含指定点
     * @param point 要包含的点
     * @returns 当前球体实例
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

// 兼容性函数
export function makeBoundingSphereFromPoints(
    positions: Vector3[],
    result?: BoundingSphere
): BoundingSphere {
    return BoundingSphere.fromPoints(positions, result);
}
