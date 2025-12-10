/* Copyright (C) 2025 flywave.gl contributors */



import { type BSplineCurve3d } from "../../bspline/bspline-curve";
import { BSplineCurveOps } from "../../bspline/bspline-curve-ops";
import { InterpolationCurve3dOptions } from "../../bspline/interpolation-curve3d";
import { Geometry } from "../../geometry";
import { type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { Ray3d } from "../../geometry3d/ray3d";
import { type CurvePrimitive } from "../curve-primitive";

/**
 * Context for constructing the xy-offset of a CurvePrimitive by interpolating the xy-offsets of computed strokes.
 * @internal
 */
export class CurveOffsetXYHandler implements IStrokeHandler {
    private readonly _offsetDistance: number;
    private readonly _fitOptions: InterpolationCurve3dOptions;

    // temporary workspace
    private readonly _p0 = Point3d.createZero();
    private readonly _p1 = Point3d.createZero();
    private readonly _v0 = Vector3d.createZero();
    private readonly _v1 = Vector3d.createZero();
    private readonly _r0 = Ray3d.createZero();

    public constructor(cp: CurvePrimitive, offsetDistance: number) {
        this._offsetDistance = offsetDistance;
        this._fitOptions = new InterpolationCurve3dOptions();
        const startTangent = cp.fractionToPointAndUnitTangent(0.0, this._r0).direction.clone();
        const endTangent = cp.fractionToPointAndUnitTangent(1.0, this._r0).direction.negate(); // points into curve
        this._fitOptions.startTangent = startTangent;
        this._fitOptions.endTangent = endTangent;
        if (
            (this._fitOptions.closed =
                cp.startPoint(this._p0).isAlmostEqual(cp.endPoint(this._p1)) &&
                startTangent.isParallelTo(endTangent, true))
        ) {
            this._fitOptions.isChordLenKnots = 1;
        }
    }

    private pushOffsetPoint(xyz: Point3d, tangent: Vector3d) {
        if (
            !Geometry.isSmallMetricDistance(tangent.x) ||
            !Geometry.isSmallMetricDistance(tangent.y)
        ) {
            this._fitOptions.fitPoints.push(
                xyz.plusScaled(tangent.unitPerpendicularXY(this._v0), this._offsetDistance)
            );
        }
    }

    public needPrimaryGeometryForStrokes() {
        return true;
    }

    public startParentCurvePrimitive(_cp: CurvePrimitive) {}
    public startCurvePrimitive(_cp: CurvePrimitive) {}
    public endCurvePrimitive(_cp: CurvePrimitive) {}
    public endParentCurvePrimitive(_cp: CurvePrimitive) {}
    public announceIntervalForUniformStepStrokes(
        cp: CurvePrimitive,
        numStrokes: number,
        fraction0: number,
        fraction1: number
    ): void {
        // announce both start and end; adjacent duplicates will be filtered by c2 cubic fit logic
        for (let i = 0; i <= numStrokes; ++i) {
            const fraction = Geometry.interpolate(fraction0, i / numStrokes, fraction1);
            const ray = cp.fractionToPointAndDerivative(fraction, this._r0);
            this.pushOffsetPoint(ray.origin, ray.direction);
        }
    }

    public announceSegmentInterval(
        _cp: CurvePrimitive,
        point0: Point3d,
        point1: Point3d,
        numStrokes: number,
        _fraction0: number,
        _fraction1: number
    ): void {
        if (numStrokes > 0) {
            const tangent = Vector3d.createStartEnd(point0, point1, this._v1);
            // announce both start and end; adjacent duplicates will be filtered by c2 cubic fit logic
            for (let i = 0; i <= numStrokes; ++i) {
                this.pushOffsetPoint(point0.interpolate(i / numStrokes, point1, this._p0), tangent);
            }
        }
    }

    public announcePointTangent(xyz: Point3d, _fraction: number, tangent: Vector3d): void {
        this.pushOffsetPoint(xyz, tangent);
    }

    /**
     * Construct a C2 cubic interpolating B-spline curve through the collected xy-offset points.
     * @returns the xy-offset curve
     */
    public claimResult(): BSplineCurve3d | undefined {
        return BSplineCurveOps.createThroughPointsC2Cubic(this._fitOptions);
    }
}
