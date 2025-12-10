/* Copyright (C) 2025 flywave.gl contributors */



import { type DisplayParams } from "../../common/render/primitives/display-params";
import { type Point3d } from "../../core-geometry";

// 辅助类型定义
export type PreparedGeometry =
    | PreparedPointGeometry
    | PreparedLineGeometry
    | PreparedMeshGeometry
    | PreparedSolidGeometry;

export interface PreparedPointGeometry {
    type: "point";
    points: Point3d[];
    params: DisplayParams;
}

export interface PreparedLineGeometry {
    type: "line";
    points: Point3d[];
    isLoop: boolean;
    params: DisplayParams;
}

export interface PreparedMeshGeometry {
    type: "mesh";
    vertices: Point3d[];
    indices: number[];
    normals?: Point3d[];
    uvs?: number[];
    params: DisplayParams;
}

export interface PreparedSolidGeometry {
    type: "solid";
    meshData: PreparedMeshGeometry;
}
