/**
 * NormalizedTransition is the (abstract) base class for clothoid, bloss, biquadratic, sine, and cosine transition functions.
 * * Each function maps fractional progress to a curvature value.
 *   * f(0) === 0
 *   * f(1) === 1
 *   * f(u) === 1 - f (1-u)
 * * Each implementation provides:
 *   * fractionToCurvature -- the f(u) function described above
 *   * fractionToCurvatureDerivative -- df(u)/du
 *   * fractionToArea -- integral of the area under f(u) from 0 to u.
 * * the symmetry condition ensures that the integral from 0 to 1 is 1/2
 * @internal
 */
export declare abstract class NormalizedTransition {
    /** Constructor initializes with 0..1 values .. call "setBearingCurvatureLengthCurvature" to apply real values */
    constructor();
    /** At fractional position on the x axis, return the (normalized) curvature fraction. */
    abstract fractionToCurvatureFraction(fractionX: number): number;
    /** Return the derivative of the (normalized) curvature fraction */
    abstract fractionToCurvatureFractionDerivative(fractionX: number): number;
    /** Return the integrated area under the curve
     * * This is equal to the accumulated angle change.
     */
    abstract fractionToArea(fractionX: number): number;
    private static _clothoidEvaluator?;
    private static _biquadraticEvaluator?;
    private static _blossEvaluator?;
    private static _sineEvaluator?;
    private static _cosineEvaluator?;
    /**
     * Return a standard evaluator identified by string as:
     * * clothoid
     * * bloss
     * * biquadratic
     * * sine
     * * cosine
     * Each of these types
     * * is instantiated (only once) as a single static object within the NormalizedTransition class.
     * * has no instance data or mutator methods.
     * @param name string name of the transition.
     */
    static findEvaluator(name: string): NormalizedTransition | undefined;
}
/**
 * Transition functions for clothoid spiral.
 * * curvature variation is linear from (0,0) to (1,1)
 * @internal
 */
export declare class NormalizedClothoidTransition extends NormalizedTransition {
    constructor();
    /** At fractional position on the x axis, return the (normalized) curvature fraction. */
    fractionToCurvatureFraction(fractionX: number): number;
    /** Return the derivative of the (normalized) curvature fraction */
    fractionToCurvatureFractionDerivative(_u: number): number;
    /** Return the integrated area under the curve.
     * * This fraction is the angular change fraction.
     */
    fractionToArea(fractionX: number): number;
}
/**
 * Transition functions for bloss spiral.
 * * curvature variation is cubic from (0,0) with slope 0 to (1,1) with slope 1
 * @internal
 */
export declare class NormalizedBlossTransition extends NormalizedTransition {
    constructor();
    /** At fractional position on the x axis, return the (normalized) curvature fraction. */
    fractionToCurvatureFraction(u: number): number;
    /** Return the derivative of the (normalized) curvature fraction */
    fractionToCurvatureFractionDerivative(u: number): number;
    /** Return the integrated area under the curve.
     * * This fraction is the angular change fraction.
     */
    fractionToArea(u: number): number;
}
/**
 * Transition functions for biquadratic transition
 * * Curvature is a pair of joining quadratics.
 * * In lower half of the interval, the quadratic is from (0,0) to (0.5, 0.5) with zero slope at origin
 * * In upper half of the interval, the quadratic is from (0.5,0.5) to (1,1) with zero slope at 1
 * @internal
 */
export declare class NormalizedBiQuadraticTransition extends NormalizedTransition {
    constructor();
    private integratedBasis;
    private basis;
    private basisDerivative;
    /** At fractional position on the x axis, return the (normalized) curvature fraction.
     *  * * For [u <= 0.5, u >= 0.5]
     *   * f(u) = [2 u^2, 1 - 2 (1-u)^2]
     *   * f'(u) = [4 u, 4 (1-u)]
     *   * If(u) = [2 u^3 / 3, 0.5 (1 -u )^3/3]
     */
    fractionToCurvatureFraction(u: number): number;
    /** Return the derivative of the (normalized) curvature fraction */
    fractionToCurvatureFractionDerivative(u: number): number;
    /** Return the integrated area under the curve.
     * * This fraction is the angular change fraction.
     */
    fractionToArea(u: number): number;
}
/**
 * Transition functions for sine transition
 * * curvature variation is the sum of
 *   * straight line from (0,0) to (1,1), like clothoid
 *   * additional full period of a sine wave, producing 0 slope at both ends
 * @internal
 */
export declare class NormalizedSineTransition extends NormalizedTransition {
    constructor();
    /** At fractional position on the x axis, return the (normalized) curvature fraction. */
    fractionToCurvatureFraction(u: number): number;
    /** Return the derivative of the (normalized) curvature fraction */
    fractionToCurvatureFractionDerivative(u: number): number;
    /** Return the integrated area under the curve.
     * * This fraction is the angular change fraction.
     */
    fractionToArea(u: number): number;
}
/**
 * Transition functions for cosine
 * * curvature variation is a half period of a cosine
 * @internal
 */
export declare class NormalizedCosineTransition extends NormalizedTransition {
    constructor();
    /** At fractional position on the x axis, return the (normalized) curvature fraction. */
    fractionToCurvatureFraction(u: number): number;
    /** Return the derivative of the (normalized) curvature fraction */
    fractionToCurvatureFractionDerivative(u: number): number;
    /** Return the integrated area under the curve.
     * * This fraction is the angular change fraction.
     */
    fractionToArea(u: number): number;
}
