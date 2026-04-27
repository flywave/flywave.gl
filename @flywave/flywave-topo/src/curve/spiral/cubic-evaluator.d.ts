import { XYCurveEvaluator } from "./xy-curve-evaluator";
/** Intermediate class for evaluation of bare cubic spirals `y = m ^x^3` with x axis from [0..xLength]
 * * This implements all the computations among fraction, x, and y.
 * * Derived classes implement specialized logic such as (a) precomputing `m` and (b) domain-specific fraction-to-distance approximations.
 * @internal
 */
export declare abstract class CubicEvaluator extends XYCurveEvaluator {
    protected _cubicM: number;
    protected _axisLength: number;
    protected constructor(axisLength: number, cubicM: number);
    /** Update both constants. */
    setConstants(axisLength: number, cubicM: number): void;
    get axisLength(): number;
    get cubicM(): number;
    /**
     * Apply `scaleFactor` to the xLength and cubicM.
     * * Derived classes commonly call this as `super.scaleInPlace()`, and additionally apply the scale to their members.
     * @param scaleFactor
     */
    scaleInPlace(scaleFactor: number): void;
    /** Evaluate X at fraction. */
    fractionToX(fraction: number): number;
    /** Evaluate derivative of X with respect to fraction */
    fractionToDX(_fraction: number): number;
    /** Evaluate second derivative of X with respect to fraction */
    fractionToDDX(_fraction: number): number;
    /** Evaluate third derivative of X with respect to fraction */
    fractionToD3X(_fraction: number): number;
    /** Evaluate Y at fraction. */
    fractionToY(fraction: number): number;
    /** Evaluate derivative of Y with respect to fraction. */
    fractionToDY(fraction: number): number;
    /** Evaluate second derivative of Y with respect to fraction. */
    fractionToDDY(fraction: number): number;
    /** Evaluate third derivative of Y with respect to fraction. */
    fractionToD3Y(_fraction: number): number;
    /** Evaluate fraction at x. */
    xToFraction(x: number): number;
}
