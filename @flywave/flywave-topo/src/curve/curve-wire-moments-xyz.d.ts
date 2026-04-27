import { type IStrokeHandler } from "../geometry3d/geometry-handler";
import { type Point3d, type Vector3d } from "../geometry3d/point3d-vector3d";
import { MomentData } from "../geometry4d/moment-data";
import { CurvePrimitive } from "./curve-primitive";
import { type AnyCurve } from "./curve-types";
/**
 * Class to visit curve primitives and accumulate wire moment integrations.
 * @internal
 */
export declare class CurveWireMomentsXYZ implements IStrokeHandler {
    private readonly _activeMomentData;
    private readonly _gaussMapper;
    constructor(numGaussPoints?: number);
    get momentData(): MomentData;
    startParentCurvePrimitive(_cp: CurvePrimitive): void;
    startCurvePrimitive(_cp: CurvePrimitive): void;
    endCurvePrimitive(_cp: CurvePrimitive): void;
    endParentCurvePrimitive(_cp: CurvePrimitive): void;
    announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
    announceSegmentInterval(_cp: CurvePrimitive, point0: Point3d, point1: Point3d, _numStrokes: number, _fraction0: number, _fraction1: number): void;
    announcePointTangent(_xyz: Point3d, _fraction: number, _tangent: Vector3d): void;
    /** Recurse to leaf-level primitives */
    visitLeaves(root: AnyCurve): void;
}
