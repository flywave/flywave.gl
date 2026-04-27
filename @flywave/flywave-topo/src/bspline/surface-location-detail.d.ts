import { type CurveLocationDetail } from "../curve/curve-location-detail";
import { type UVSurface } from "../geometry3d/geometry-handler";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d } from "../geometry3d/point3d-vector3d";
export declare class UVSurfaceLocationDetail {
    surface?: UVSurface;
    uv: Point2d;
    point: Point3d;
    a: number;
    constructor(surface?: UVSurface, uv?: Point2d, point?: Point3d);
    static createSurfaceUVPoint(surface: UVSurface | undefined, uv: Point2d, point: Point3d): UVSurfaceLocationDetail;
    static createSurfaceUVNumbersPoint(surface: UVSurface | undefined, u: number, v: number, point: Point3d): UVSurfaceLocationDetail;
}
export declare class CurveAndSurfaceLocationDetail {
    curveDetail: CurveLocationDetail;
    surfaceDetail: UVSurfaceLocationDetail;
    constructor(curveDetail: CurveLocationDetail, surfaceDetail: UVSurfaceLocationDetail);
}
