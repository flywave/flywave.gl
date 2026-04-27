import { type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { type Vector3d, Point3d } from "../../geometry3d/point3d-vector3d";
import { Ray3d } from "../../geometry3d/ray3d";
import { type VariantCurveExtendParameter } from "../curve-extend-mode";
import { CurveLocationDetail } from "../curve-location-detail";
import { type CurvePrimitive } from "../curve-primitive";
import { NewtonRtoRStrokeHandler } from "./newton-r-to-r-stroke-handler";
/**
 * Context for searching for the closest point to a CurvePrimitive.
 * @internal
 */
export declare class ClosestPointStrokeHandler extends NewtonRtoRStrokeHandler implements IStrokeHandler {
    private _curve;
    private _closestPoint;
    private readonly _spacePoint;
    private readonly _extend;
    private _fractionA;
    private _functionA;
    private _functionB;
    private _fractionB;
    private _numThisCurve;
    private _workPoint;
    private _workRay;
    private readonly _newtonSolver;
    constructor(spacePoint: Point3d, extend: VariantCurveExtendParameter, result?: CurveLocationDetail);
    claimResult(): CurveLocationDetail | undefined;
    needPrimaryGeometryForStrokes(): boolean;
    startCurvePrimitive(curve: CurvePrimitive | undefined): void;
    endCurvePrimitive(): void;
    announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
    private announceCandidate;
    announceSegmentInterval(cp: CurvePrimitive, point0: Point3d, point1: Point3d, _numStrokes: number, fraction0: number, fraction1: number): void;
    private searchInterval;
    private evaluateB;
    private announceSolutionFraction;
    evaluate(fraction: number): boolean;
    announceRay(fraction: number, data: Ray3d): void;
    announcePointTangent(point: Point3d, fraction: number, tangent: Vector3d): void;
}
