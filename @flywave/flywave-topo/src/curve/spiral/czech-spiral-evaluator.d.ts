import { CubicEvaluator } from "./cubic-evaluator";
/**
 * Czech cubic.
 * This is y= m*x^3 with
 * * x any point on the x axis
 * * `fraction` along the spiral goes to `x = fraction * L`
 * * m is gamma / (6RL)
 *    * 1/(6RL) is the leading term of the sine series.
 *    * `gamma = 2R/sqrt (4RR-LL)` pushes y down a little bit to simulate the lost series terms.
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export declare class CzechSpiralEvaluator extends CubicEvaluator {
    nominalLength1: number;
    nominalRadius1: number;
    /** Constructor is private.  Caller responsible for cubicM validity. */
    private constructor();
    /**
     * Return the scale factor between simple x^3 / (6RL) cubic and the czech correction.
     * * For typical case with l1/R1 smallish, this is just less than 1.0:
     *   (0.25==>0.99215), (0.15==>0.997184), (0.10==>0.998749), (0.05==>999687)
     * @param length1
     * @param radius1
     */
    static gammaConstant(length1: number, radius1: number): number | undefined;
    /** Compute the czech cubic constant. */
    static computeCubicM(length1: number, radius1: number): number | undefined;
    static create(length1: number, radius1: number): CzechSpiralEvaluator | undefined;
    scaleInPlace(scaleFactor: number): void;
    /** return a deep copy of the evaluator */
    clone(): CzechSpiralEvaluator;
    /** Member by member matchup ... */
    isAlmostEqual(other: any): boolean;
    /**
     * Return a (fast but mediocre) approximation of spiral length as a function of x axis position.
     * * This x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
     * * It is supported here for users interested in replicating the Czech distance mapping rather than the more accurate CurvePrimitive measurements.
     * @param x distance along the x axis.
     */
    xToCzechApproximateDistance(x: number): number;
    /**
     * Return the inverse of the `forwardL2R2Map` function.
     * * The undefined result can only occur for distances outside the usual spirals.
     * @param s (approximate) distance along the spiral.
     *
     */
    czechApproximateDistanceToX(d: number): number | undefined;
    /**
     * evaluate a series expansion that is used with varying signs (plus or minus 1) in czech and italian spirals.
     * @param x distance along the x axis.
     */
    static forwardL2R2Map(x: number, sign: number, length: number, radius: number): number;
    /**
     * Return the inverse of the `forwardL2R2Map` function.
     * * The undefined result can only occur for distances outside the usual spirals.
     * @param s (approximate) distance along the spiral.
     *
     */
    static inverseL2R2Map(b: number, sign: number, length: number, radius: number): number | undefined;
}
/**
 * Italian cubic.
 * This is y= m*x^3 with
 * * x any point on the x axis
 * * `fraction` along the spiral goes to `x = fraction * L`
 * * m is gamma / (6RL)
 *    * 1/(6RL) is the leading term of the sine series.
 *    * `gamma = 2R/sqrt (4RR-LL)` pushes y down a little bit to simulate the lost series terms.
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export declare class ItalianSpiralEvaluator extends CubicEvaluator {
    nominalLength1: number;
    nominalRadius1: number;
    /** Compute the czech cubic constant.
     * ** funky mixture of lengths ....
     */
    private static computeCubicM;
    /** Constructor is private.  Caller responsible for cubicM validity. */
    private constructor();
    static create(length1: number, radius1: number): ItalianSpiralEvaluator | undefined;
    scaleInPlace(scaleFactor: number): void;
    /** return a deep copy of the evaluator */
    clone(): ItalianSpiralEvaluator;
    /** Member by member matchup ... */
    isAlmostEqual(other: any): boolean;
    /**
     * Return a (fast but mediocre) approximation of spiral length as a function of x axis position.
     * * This x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
     * * It is supported here for users interested in replicating the Czech distance mapping rather than the more accurate CurvePrimitive measurements.
     * @param x distance along the x axis.
     */
    distanceToItalianApproximateX(x: number): number;
    /**
     * Return the inverse of the `forwardL2R2Map` function.
     * * The undefined result can only occur for distances outside the usual spirals.
     * @param s (approximate) distance along the spiral.
     *
     */
    xToItalianApproximateDistance(d: number): number | undefined;
}
