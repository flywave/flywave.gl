/* Copyright (C) 2025 flywave.gl contributors */

import { type Plane, Vector3 } from "three";

export enum Intersect {
    OUTSIDE,
    INSIDE,
    INTERSECTING
}

export class AxisAlignedBox3 {
    /**
     * The minimum point defining the bounding box.
     */
    readonly minimum = new Vector3();

    /**
     * The maximum point defining the bounding box.
     */
    readonly maximum = new Vector3();

    /**
     * The center point of the bounding box.
     */
    readonly center = new Vector3();

    constructor(minimum: Vector3 = new Vector3(), maximum: Vector3 = new Vector3()) {
        this.minimum.copy(minimum);
        this.maximum.copy(maximum);
        this.center.addVectors(minimum, maximum).multiplyScalar(0.5);
    }

    /**
     * Creates a bounding box from an array of points.
     */
    static fromPoints(points: Vector3[]): AxisAlignedBox3 {
        const box = new AxisAlignedBox3();
        if (!points || points.length === 0) {
            return box;
        }

        const min = box.minimum;
        const max = box.maximum;
        min.copy(points[0]);
        max.copy(points[0]);

        for (let i = 1; i < points.length; i++) {
            const p = points[i];
            min.min(p);
            max.max(p);
        }

        box.center.addVectors(min, max).multiplyScalar(0.5);
        return box;
    }

    /**
     * Creates a copy of this bounding box.
     */
    clone(): AxisAlignedBox3 {
        return new AxisAlignedBox3(this.minimum, this.maximum);
    }

    /**
     * Copies values from another bounding box.
     */
    copy(box: AxisAlignedBox3): this {
        this.minimum.copy(box.minimum);
        this.maximum.copy(box.maximum);
        this.center.copy(box.center);
        return this;
    }

    /**
     * Checks if this box equals another box.
     */
    equals(box: AxisAlignedBox3): boolean {
        return this.minimum.equals(box.minimum) && this.maximum.equals(box.maximum);
    }

    /**
     * Gets the size of this box.
     */
    getSize(target = new Vector3()): Vector3 {
        return target.subVectors(this.maximum, this.minimum);
    }

    /**
     * Checks intersection with a plane.
     */
    intersectsPlane(plane: Plane): Intersect {
        const halfSize = this.getSize().multiplyScalar(0.5);
        const e =
            halfSize.x * Math.abs(plane.normal.x) +
            halfSize.y * Math.abs(plane.normal.y) +
            halfSize.z * Math.abs(plane.normal.z);
        const s = plane.distanceToPoint(this.center);

        if (s - e > 0) return Intersect.INSIDE;
        if (s + e < 0) return Intersect.OUTSIDE;
        return Intersect.INTERSECTING;
    }

    /**
     * Checks if this box contains a point.
     */
    containsPoint(point: Vector3): boolean {
        return (
            point.x >= this.minimum.x &&
            point.x <= this.maximum.x &&
            point.y >= this.minimum.y &&
            point.y <= this.maximum.y &&
            point.z >= this.minimum.z &&
            point.z <= this.maximum.z
        );
    }

    /**
     * Computes the distance to a point.
     */
    distanceToPoint(point: Vector3): number {
        return Math.sqrt(this.distanceToPointSquared(point));
    }

    /**
     * Computes the squared distance to a point.
     */
    distanceToPointSquared(point: Vector3): number {
        let result = 0;
        const min = this.minimum;
        const max = this.maximum;

        if (point.x < min.x) {
            const d = min.x - point.x;
            result += d * d;
        } else if (point.x > max.x) {
            const d = point.x - max.x;
            result += d * d;
        }

        if (point.y < min.y) {
            const d = min.y - point.y;
            result += d * d;
        } else if (point.y > max.y) {
            const d = point.y - max.y;
            result += d * d;
        }

        if (point.z < min.z) {
            const d = min.z - point.z;
            result += d * d;
        } else if (point.z > max.z) {
            const d = point.z - max.z;
            result += d * d;
        }

        return result;
    }

    /**
     * Expands this box to include the given point.
     */
    expandByPoint(point: Vector3): this {
        this.minimum.min(point);
        this.maximum.max(point);
        this.center.addVectors(this.minimum, this.maximum).multiplyScalar(0.5);
        return this;
    }

    /**
     * Expands this box by a scalar in all directions.
     */
    expandByScalar(scalar: number): this {
        this.minimum.addScalar(-scalar);
        this.maximum.addScalar(scalar);
        this.center.addVectors(this.minimum, this.maximum).multiplyScalar(0.5);
        return this;
    }
}

export default AxisAlignedBox3;
