import { XYCurveEvaluator } from "./xy-curve-evaluator";
/**
 * Methods to evaluate caller-specified number of terms of the x and y series for a clothoid.
 * Each instance has
 * * Number of x and y terms to use.
 * * constant for theta=c * x * x
 *    * This value is c=1/(2 R L)  for curve length L measured from inflection to point with radius R.
 * @internal
 */
export declare class ClothoidSeriesRLEvaluator extends XYCurveEvaluator {
    numXTerms: number;
    numYTerms: number;
    constantDiv2LR: number;
    nominalLength1: number;
    constructor(nominalLength1: number, constantDiv2LR: number, numXTerms?: number, numYTerms?: number);
    /** Return a deep clone. */
    clone(): ClothoidSeriesRLEvaluator;
    scaleInPlace(scaleFactor: number): void;
    /** Member by member matchup ... */
    isAlmostEqual(other: any): boolean;
    /**
     * Evaluate the X series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     */
    fractionToX(fraction: number): number;
    /**
     * Evaluate the Y series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     */
    fractionToY(fraction: number): number;
    /**
     * Evaluate the derivative of the X series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     */
    fractionToDX(fraction: number): number;
    /**
     * Evaluate the derivative of the Y series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     */
    fractionToDY(fraction: number): number;
    /**
     * Evaluate the derivative of the X series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     */
    fractionToDDX(fraction: number): number;
    /**
     * Evaluate the derivative of the Y series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     */
    fractionToDDY(fraction: number): number;
    /**
     * Evaluate the X series at a nominal distance along the curve.
     * @param fraction fractional position along the curve.
     * @param numTerms number of terms to use.
     */
    fractionToXGo(fraction: number, numTerms: number): number;
    fractionToYGo(fraction: number, numTerms: number): number;
    fractionToDXGo(fraction: number, numTerms: number): number;
    fractionToDYGo(fraction: number, numTerms: number): number;
    fractionToDDXGo(fraction: number, numTerms: number): number;
    fractionToDDYGo(fraction: number, numTerms: number): number;
    fractionToD3X(fraction: number): number;
    fractionToD3Y(fraction: number): number;
    xToFraction(x: number): number | undefined;
}
