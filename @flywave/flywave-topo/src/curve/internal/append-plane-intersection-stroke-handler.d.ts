import { type PlaneAltitudeEvaluator } from "../../geometry";
import { type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { type Point3d, type Vector3d } from "../../geometry3d/point3d-vector3d";
import { CurveLocationDetail } from "../curve-location-detail";
import { type CurvePrimitive } from "../curve-primitive";
import { NewtonRtoRStrokeHandler } from "./newton-r-to-r-stroke-handler";
/**
 * Context for computing intersections of a CurvePrimitive with a plane.
 * @internal
 */
export declare class AppendPlaneIntersectionStrokeHandler extends NewtonRtoRStrokeHandler implements IStrokeHandler {
    private _curve;
    private readonly _plane;
    private readonly _intersections;
    private _fractionA;
    private _functionA;
    private _functionB;
    private _fractionB;
    private _derivativeB;
    private _numThisCurve;
    private _ray;
    private readonly _newtonSolver;
    effectiveCurve(): CurvePrimitive | undefined;
    get getDerivativeB(): number;
    constructor(plane: PlaneAltitudeEvaluator, intersections: CurveLocationDetail[]);
    startCurvePrimitive(curve: CurvePrimitive | undefined): void;
    endCurvePrimitive(): void;
    announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
    announceSegmentInterval(_cp: CurvePrimitive, point0: Point3d, point1: Point3d, _numStrokes: number, fraction0: number, fraction1: number): void;
    private announceSolutionFraction;
    evaluate(fraction: number): boolean;
    /**
     * * ASSUME both the "A" and "B"  evaluations (fraction, function, and derivative) are known.
     * * If function value changed sign between, interpolate an approximate root and improve it with
     *     the newton solver.
     */
    private searchInterval;
    /** Evaluate and save _functionB, _derivativeB, and _fractionB. */
    private evaluateB;
    /**
     * Announce point and tangent for evaluations.
     * * The function evaluation is saved as the "B" function point.
     * * The function point count is incremented
     * * If function point count is greater than 1, the current interval is searched.
     * * The just-evaluated point ("B") is saved as the "old" ("A") evaluation point.
     * @param xyz
     * @param fraction
     * @param tangent
     */
    announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void;
}
