import { type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { type Point3d, type Vector3d } from "../../geometry3d/point3d-vector3d";
import { type CurvePrimitive } from "../curve-primitive";
/**
 * Context for computing the length of a CurvePrimitive.
 * @internal
 */
export declare class CurveLengthContext implements IStrokeHandler {
    private _curve;
    private _summedLength;
    private _ray;
    private readonly _fraction0;
    private readonly _fraction1;
    private readonly _gaussMapper;
    private tangentMagnitude;
    /** Return the fraction0 installed at construction time. */
    get getFraction0(): number;
    /** Return the fraction1 installed at construction time. */
    get getFraction1(): number;
    getSum(): number;
    constructor(fraction0?: number, fraction1?: number, numGaussPoints?: number);
    startCurvePrimitive(curve: CurvePrimitive | undefined): void;
    startParentCurvePrimitive(_curve: CurvePrimitive): void;
    endParentCurvePrimitive(_curve: CurvePrimitive): void;
    endCurvePrimitive(): void;
    announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
    announceSegmentInterval(_cp: CurvePrimitive, point0: Point3d, point1: Point3d, _numStrokes: number, fraction0: number, fraction1: number): void;
    announcePointTangent(_xyz: Point3d, _fraction: number, _tangent: Vector3d): void;
}
