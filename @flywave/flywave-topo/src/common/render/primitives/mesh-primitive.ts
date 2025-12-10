/* Copyright (C) 2025 flywave.gl contributors */



import { type QPoint3dList } from "../../../common";
import { type Point3d, type Range3d } from "../../../core-geometry";

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
