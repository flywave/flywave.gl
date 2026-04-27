import { type QPoint3dList } from "../../../common";
import { type Point3d, type Range3d } from "../../../core-geometry";
export declare enum MeshPrimitiveType {
    Mesh = 0,
    Polyline = 1,
    Point = 2
}
export interface Point3dList extends Array<Point3d> {
    add(point: Point3d): void;
    range: Range3d;
}
export type MeshPointList = Point3dList | QPoint3dList;
