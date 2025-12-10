/* Copyright (C) 2025 flywave.gl contributors */



import { type Transform, Point3d } from "../../core-geometry";

export class BoundingSphere {
    public center: Point3d;
    public radius: number;

    constructor(center: Point3d = Point3d.createZero(), radius = 0) {
        this.center = center;
        this.radius = radius;
    }

    public init(center: Point3d, radius: number): void {
        this.center = center;
        this.radius = radius;
    }

    public transformBy(transform: Transform, result?: BoundingSphere): BoundingSphere {
        result = result ?? new BoundingSphere();
        transform.multiplyPoint3d(this.center, result.center);
        result.radius =
            this.radius *
            Math.max(
                transform.matrix.columnXMagnitude(),
                Math.max(transform.matrix.columnYMagnitude(), transform.matrix.columnZMagnitude())
            );
        return result;
    }

    public transformInPlace(transform: Transform): void {
        this.transformBy(transform, this);
    }
}
