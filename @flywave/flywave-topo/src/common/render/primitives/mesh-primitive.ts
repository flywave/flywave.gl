import { QPoint3dList } from "../../../common";
import { Point3d, Range3d } from "../../../core-geometry";

export enum MeshPrimitiveType {
    Mesh,
    Polyline,
    Point
}

export interface Point3dList extends Array<Point3d> {
    add(point: Point3d): void;
    range: Range3d;
}

export type MeshPointList = Point3dList | QPoint3dList;
