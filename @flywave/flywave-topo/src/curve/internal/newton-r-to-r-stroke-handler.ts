/* Copyright (C) 2025 flywave.gl contributors */



import { NewtonEvaluatorRtoR } from "../../numerics/newton";
import { type CurvePrimitive } from "../curve-primitive";

/** Intermediate class for managing the parentCurve announcements from an IStrokeHandler.
 * @internal
 */
export abstract class NewtonRtoRStrokeHandler extends NewtonEvaluatorRtoR {
    protected _parentCurvePrimitive: CurvePrimitive | undefined;

    constructor() {
        super();
        this._parentCurvePrimitive = undefined;
    }

    /** retain the parentCurvePrimitive.
     * * Calling this method tells the handler that the parent curve is to be used for detail searches.
     * * Example: Transition spiral search is based on linestring first, then the exact spiral.
     * * Example: CurveChainWithDistanceIndex does NOT do this announcement -- the constituents act independently.
     */
    public startParentCurvePrimitive(curve: CurvePrimitive | undefined) {
        this._parentCurvePrimitive = curve;
    }

    /** Forget the parentCurvePrimitive */
    public endParentCurvePrimitive(_curve: CurvePrimitive | undefined) {
        this._parentCurvePrimitive = undefined;
    }
}
