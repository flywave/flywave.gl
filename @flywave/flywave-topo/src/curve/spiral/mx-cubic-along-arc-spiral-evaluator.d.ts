import { CubicEvaluator } from "./cubic-evaluator";
/**
 * MX Cubic along arc.
 * This is y= m*x^3 with
 * * x any point on the x axis
 * * `fraction` along the spiral goes to `x = fraction * Lx`
 * * m is (1/6RL)
 * * construction length L is nominal along the curve.
 * * x length Lx is along the axis, determined by two terms of the clothoid x series.
 * *
 * @param localToWorld
 * @param nominalL1
 * @param nominalR1
 * @param activeInterval
 * @internal
 */
export declare class MXCubicAlongArcEvaluator extends CubicEvaluator {
    nominalLength1: number;
    nominalRadius1: number;
    /** Constructor is private.  Caller responsible for cubicM validity. */
    private constructor();
    /** Compute the cubic constant. */
    static computeCubicM(length1: number, radius1: number): number | undefined;
    static create(length1: number, radius1: number): MXCubicAlongArcEvaluator | undefined;
    scaleInPlace(scaleFactor: number): void;
    /** return a deep copy of the evaluator */
    clone(): MXCubicAlongArcEvaluator;
    /** Member by member matchup ... */
    isAlmostEqual(other: any): boolean;
    /**
     * Return a (fast but mediocre) approximation of spiral x position as function of approximate distance along the curve.
     * * This x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
     * * It is supported here for users interested in replicating the Czech distance mapping rather than the more accurate CurvePrimitive measurements.
     * @param x distance along the x axis.
     */
    static approximateDistanceAlongToX(nominalLength1: number, nominalRadius1: number, nominalDistanceAlong: number): number;
}
