import { type Transform, Point3d } from "../../core-geometry";
export declare class BoundingSphere {
    center: Point3d;
    radius: number;
    constructor(center?: Point3d, radius?: number);
    init(center: Point3d, radius: number): void;
    transformBy(transform: Transform, result?: BoundingSphere): BoundingSphere;
    transformInPlace(transform: Transform): void;
}
