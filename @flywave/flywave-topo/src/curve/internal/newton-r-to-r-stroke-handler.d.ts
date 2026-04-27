import { NewtonEvaluatorRtoR } from "../../numerics/newton";
import { type CurvePrimitive } from "../curve-primitive";
/** Intermediate class for managing the parentCurve announcements from an IStrokeHandler.
 * @internal
 */
export declare abstract class NewtonRtoRStrokeHandler extends NewtonEvaluatorRtoR {
    protected _parentCurvePrimitive: CurvePrimitive | undefined;
    constructor();
    /** retain the parentCurvePrimitive.
     * * Calling this method tells the handler that the parent curve is to be used for detail searches.
     * * Example: Transition spiral search is based on linestring first, then the exact spiral.
     * * Example: CurveChainWithDistanceIndex does NOT do this announcement -- the constituents act independently.
     */
    startParentCurvePrimitive(curve: CurvePrimitive | undefined): void;
    /** Forget the parentCurvePrimitive */
    endParentCurvePrimitive(_curve: CurvePrimitive | undefined): void;
}
