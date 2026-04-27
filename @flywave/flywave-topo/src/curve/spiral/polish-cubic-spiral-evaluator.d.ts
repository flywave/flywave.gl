import { CubicEvaluator } from "./cubic-evaluator";
/**
 * Polish Cubic.
 * * Construction takes nominal length and end radius.
 * curve is  is y= m*x^3 with
 * * x any point on the x axis
 * * m is (1/6RL)
 * * Lx = x length is along the axis, determined by inversion of a distance series at nominal length
 * *
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export declare class PolishCubicEvaluator extends CubicEvaluator {
    nominalLength1: number;
    nominalRadius1: number;
    /** Constructor is private.  Caller responsible for cubicM validity. */
    private constructor();
    /** Compute the czech cubic constant. */
    static computeCubicM(length1: number, radius1: number): number;
    static create(length1: number, radius1: number): PolishCubicEvaluator | undefined;
    scaleInPlace(scaleFactor: number): void;
    /** return a deep copy of the evaluator */
    clone(): PolishCubicEvaluator;
    /** Member by member matchup ... */
    isAlmostEqual(other: any): boolean;
    /** Compute the coefficient of x^4 in the x-to-distance series expansion */
    static computeX4SeriesCoefficient(length1: number, radius1: number): number;
    /**
     * Evaluate a series approximation of distance along the true curve.
     * @param x distance along x axis
     * @param radius1 nominal end radius
     * @param length1 nominal length along curve
     * @returns
     */
    static xToApproximateDistance(x: number, radius1: number, length1: number): number;
    /**
     * Evaluate the derivative of the x-to-distance series.
     * @param x distance along x axis
     * @param radius1 nominal end radius
     * @param length1 nominal length along curve
     * @returns
     */
    static xToApproximateDistanceDerivative(x: number, radius1: number, length1: number): number;
    /** Invert the xToApproximateDistance function. */
    static approximateDistanceAlongToX(s: number, radius1: number, length1: number): number | undefined;
}
