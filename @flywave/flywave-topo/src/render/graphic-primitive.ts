/* Copyright (C) 2025 flywave.gl contributors */



import {
    type Arc3d,
    type Loop,
    type Path,
    type Point2d,
    type Point3d,
    type Polyface,
    type SolidPrimitive
} from "../core-geometry";

export interface GraphicPrimitive2d {
    zDepth: number;
}

export interface GraphicLineString {
    type: "linestring";
    points: Point3d[];
}

export interface GraphicLineString2d extends GraphicPrimitive2d {
    type: "linestring2d";
    points: Point2d[];
}

export interface GraphicPointString {
    type: "pointstring";
    points: Point3d[];
}

export interface GraphicPointString2d extends GraphicPrimitive2d {
    type: "pointstring2d";
    points: Point2d[];
}

export interface GraphicShape {
    type: "shape";
    points: Point3d[];
}

export interface GraphicShape2d extends GraphicPrimitive2d {
    type: "shape2d";
    points: Point2d[];
}

export interface GraphicArc {
    type: "arc";
    arc: Arc3d;
    isEllipse?: boolean;
    filled?: boolean;
}

export interface GraphicArc2d {
    type: "arc2d";
    arc: Arc3d;
    isEllipse?: boolean;
    filled?: boolean;
    zDepth: number;
}

export interface GraphicPath {
    type: "path";
    path: Path;
}

export interface GraphicLoop {
    type: "loop";
    loop: Loop;
}

export interface GraphicPolyface {
    type: "polyface";
    polyface: Polyface;
    filled?: boolean;
}

export interface GraphicSolidPrimitive {
    type: "solidPrimitive";
    solidPrimitive: SolidPrimitive;
}

export type GraphicPrimitive =
    | GraphicLineString
    | GraphicLineString2d
    | GraphicPointString
    | GraphicPointString2d
    | GraphicShape
    | GraphicShape2d
    | GraphicArc
    | GraphicArc2d
    | GraphicPath
    | GraphicLoop
    | GraphicPolyface
    | GraphicSolidPrimitive;
