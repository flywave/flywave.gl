import { XYCurveEvaluator } from "./xy-curve-evaluator";
/**
 * @internal
 */
export declare class DirectHalfCosineSpiralEvaluator extends XYCurveEvaluator {
    nominalLength1: number;
    nominalRadius1: number;
    private _c;
    private readonly _c1;
    private readonly _c2;
    constructor(length1: number, radius1: number);
    private updateConstants;
    scaleInPlace(scaleFactor: number): void;
    /** return a deep copy of the evaluator */
    clone(): DirectHalfCosineSpiralEvaluator;
    /** Member by member matchup ... */
    isAlmostEqual(other: any): boolean;
    /** Evaluate X at fractional position. */
    fractionToX(fraction: number): number;
    /** Evaluate Y at fractional position. */
    fractionToY(fraction: number): number;
    /** Evaluate derivative of X with respect to fraction at fractional position. */
    fractionToDX(_fraction: number): number;
    /** Evaluate derivative of Y with respect to fraction at fractional position. */
    fractionToDY(fraction: number): number;
    /** Evaluate second derivative of X with respect to fraction at fractional position. */
    fractionToDDX(_fraction: number): number;
    /** Evaluate third derivative of Y with respect to fraction at fractional position. */
    fractionToDDY(fraction: number): number;
    /** Evaluate second derivative of X with respect to fraction at fractional position. */
    fractionToD3X(_fraction: number): number;
    /** Evaluate third derivative of Y with respect to fraction at fractional position. */
    fractionToD3Y(fraction: number): number;
    /** Return the magnitude of the first vector at fractional coordinate. */
    fractionToTangentMagnitude(fraction: number): number;
    /** Invert the fractionToX function for given X. */
    xToFraction(x: number): number | undefined;
}
