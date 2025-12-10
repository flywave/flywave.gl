/* Copyright (C) 2025 flywave.gl contributors */



import { type CurveLocationDetail } from "../curve/curve-location-detail";
import { type UVSurface } from "../geometry3d/geometry-handler";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d } from "../geometry3d/point3d-vector3d";

export class UVSurfaceLocationDetail {
    public surface?: UVSurface;
    public uv: Point2d;
    public point: Point3d;
    public a: number;

    public constructor(surface?: UVSurface, uv?: Point2d, point?: Point3d) {
        this.surface = surface;
        this.point = point ? point : Point3d.createZero();
        this.uv = uv ? uv : Point2d.createZero();
        this.a = 0.0;
    }

    public static createSurfaceUVPoint(
        surface: UVSurface | undefined,
        uv: Point2d,
        point: Point3d
    ): UVSurfaceLocationDetail {
        const detail = new UVSurfaceLocationDetail(surface);
        if (uv) detail.uv.setFrom(uv);
        detail.point.setFromPoint3d(point);
        return detail;
    }

    public static createSurfaceUVNumbersPoint(
        surface: UVSurface | undefined,
        u: number,
        v: number,
        point: Point3d
    ): UVSurfaceLocationDetail {
        const detail = new UVSurfaceLocationDetail(surface);
        detail.uv.x = u;
        detail.uv.y = v;
        detail.point.setFromPoint3d(point);
        return detail;
    }
}

export class CurveAndSurfaceLocationDetail {
    public curveDetail: CurveLocationDetail;
    public surfaceDetail: UVSurfaceLocationDetail;

    public constructor(curveDetail: CurveLocationDetail, surfaceDetail: UVSurfaceLocationDetail) {
        this.curveDetail = curveDetail;
        this.surfaceDetail = surfaceDetail;
    }
}
