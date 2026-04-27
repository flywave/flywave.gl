import { type BSplineCurve3d } from "../../bspline/bspline-curve";
import { type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { type CurvePrimitive } from "../curve-primitive";
/**
 * Context for constructing the xy-offset of a CurvePrimitive by interpolating the xy-offsets of computed strokes.
 * @internal
 */
export declare class CurveOffsetXYHandler implements IStrokeHandler {
    private readonly _offsetDistance;
    private readonly _fitOptions;
    private readonly _p0;
    private readonly _p1;
    private readonly _v0;
    private readonly _v1;
    private readonly _r0;
    constructor(cp: CurvePrimitive, offsetDistance: number);
    private pushOffsetPoint;
    needPrimaryGeometryForStrokes(): boolean;
    startParentCurvePrimitive(_cp: CurvePrimitive): void;
    startCurvePrimitive(_cp: CurvePrimitive): void;
    endCurvePrimitive(_cp: CurvePrimitive): void;
    endParentCurvePrimitive(_cp: CurvePrimitive): void;
    announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
    announceSegmentInterval(_cp: CurvePrimitive, point0: Point3d, point1: Point3d, numStrokes: number, _fraction0: number, _fraction1: number): void;
    announcePointTangent(xyz: Point3d, _fraction: number, tangent: Vector3d): void;
    /**
     * Construct a C2 cubic interpolating B-spline curve through the collected xy-offset points.
     * @returns the xy-offset curve
     */
    claimResult(): BSplineCurve3d | undefined;
}
