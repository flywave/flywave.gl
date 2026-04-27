import { CubicEvaluator } from "./cubic-evaluator";
/**
 * AustralianRailCorp spiral (also known as New South Wales spiral)
 * * The ultimate curve is a cubic `y = m * x^3`.
 * * `m` is a constant throughout the curve.
 * * Computation of m from the R and L is an complicated sequence, but is only done at construction time.
 * @internal
 */
export declare class AustralianRailCorpXYEvaluator extends CubicEvaluator {
    private _nominalLength1;
    private _nominalRadius1;
    private constructor();
    get nominalLength1(): number;
    get nominalRadius1(): number;
    clone(): AustralianRailCorpXYEvaluator;
    static create(nominalLength1: number, nominalRadius1: number): AustralianRailCorpXYEvaluator | undefined;
    /**
     * Compute the phi constant for AustralianRail spiral with given end radius and length along axis.
     * @param nominalRadius1
     * @param axisLength
     */
    static radiusAndAxisLengthToPhi(nominalRadius1: number, axisLength: number): number;
    scaleInPlace(scaleFactor: number): void;
    /** Compute length along axis for AustralianRail spiral nominal radius and length.
     *
     */
    static radiusAndNominalLengthToAxisLength(nominalRadius1: number, nominalLength1: number, tolerance?: number, requiredConvergenceCount?: number): number;
    isAlmostEqual(other: any): boolean;
    /**
     * Return a (quite good approximation) of fraction along x axis for given distance along spiral.
     * * The AustralianRailSpiral has a supporting power series to approximately map distance along the spiral to an x coordinate.
     * * The `xToFraction(x)` method quickly (with a single divide) converts this x to fraction used fro this.fractionToX (fraction), this.fractionToY(fraction) etc to get coordinates and derivatives.
     * * The x-to-distance relation is not as precise as the CurvePrimitive method moveSignedDistanceFromFraction.
     * * It is supported here for users interested in replicating the AustralianRail distance mapping rather than the more accurate CurvePrimitive measurements.
     * * Round tripping distance through (a) distanceAlongSpiralToAustralianApproximateX, (b) xToFraction, and (c) curveLengthBetweenFractions has
     *   * 10 digit accuracy for L/R = 4, 12 digit accuracy for L/R = 10
     * @param s distance along the axis.
     */
    distanceAlongSpiralToAustralianApproximateX(s: number): number;
}
