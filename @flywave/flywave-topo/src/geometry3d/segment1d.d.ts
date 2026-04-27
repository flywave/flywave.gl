/**
 * * A Segment1d is an interval of an axis named x.
 * * The interval is defined by two values x0 and x1.
 * * The x0 and x1 values can be in either order.
 *   * if `x0 < x1` fractional coordinates within the segment move from left to right.
 *   * if `x0 > x1` fractional coordinates within the segment move from right to left.
 * * This differs from a Range1d in that:
 * * For a Range1d the reversed ordering of its limit values means "empty interval".
 * * For a Segment1d the reversed ordering is a real interval but fractional positions move backwards.
 * * The segment is parameterized with a fraction
 * * * Fraction 0 is the start (`x0`)
 * * * Fraction 1 is the end (`x1`)
 * * * The fraction equation is `x = x0 + fraction * (x1-x0)` or (equivalently) `x = (1-fraction) * x0 + fraction * x1`
 * @public
 */
export declare class Segment1d {
    /** start coordinate */
    x0: number;
    /** end coordinate */
    x1: number;
    private constructor();
    /**
     * replace both end values.
     * @param x0 new x0 value
     * @param x1 new y0 value
     */
    set(x0: number, x1: number): void;
    /**
     * shift (translate) the segment along its axis by adding `dx` to both `x0` and `x1`.
     * @param dx value to add to both x0 and x1
     */
    shift(dx: number): void;
    /**
     * create segment1d with given end values
     * @param x0 start value
     * @param x1 end value
     * @param result optional pre-existing result to be reinitialized.
     */
    static create(x0?: number, x1?: number, result?: Segment1d): Segment1d;
    /**
     * Copy both end values from other Segment1d
     * @param other source Segment1d
     */
    setFrom(other: Segment1d): void;
    /**
     * clone this Segment1d, return as a separate object.
     */
    clone(): Segment1d;
    /**
     * Returns true if both coordinates (`x0` and `x1`) are in the 0..1 range.
     */
    get isIn01(): boolean;
    /**
     * Evaluate the segment at fractional position
     * @returns position within the segment
     * @param fraction fractional position within this segment
     */
    fractionToPoint(fraction: number): number;
    /**
     * Return the signed start-to-end shift (aka signed distance)
     */
    signedDelta(): number;
    /**
     * Return the absolute start-to-end shift (aka distance)
     */
    absoluteDelta(): number;
    /**
     * * swap the x0 and x1 member values.
     * * This makes the fractionToPoint evaluates reverse direction.
     */
    reverseInPlace(): void;
    /**
     * * if `x1-x0` multiplied by the scale factor is (strictly) negative, swap the x0 and x1 member values.
     * * This makes the fractionToPoint evaluates reverse direction.
     */
    reverseIfNeededForDeltaSign(sign?: number): void;
    /**
     * Near equality test, using Geometry.isSameCoordinate for tolerances.
     */
    isAlmostEqual(other: Segment1d): boolean;
    /**
     * Return true if the segment limits are (exactly) 0 and 1
     */
    get isExact01(): boolean;
    /**
     * Return true if the segment limits are (exactly) 1 and 0
     */
    get isExact01Reversed(): boolean;
    /** On input, `this` is an interval of a line.  On output, the interval has been clipped to positive parts of a linear function
     * * f0 and f1 are values at parameter values 0 and 1 (which are in general NOT x0 and x1)
     * * From that determine where the segment crosses function value 0.
     * * The segment contains some interval in the same parameter space.
     * * Clip the segment to the positive part of the space.
     * * Return true (and modify the segment) if any of the segment remains.
     * * Return false (but without modifying the segment) if the active part is entirely out.
     */
    clipBy01FunctionValuesPositive(f0: number, f1: number): boolean;
    /**
     * * On input, (f0,f1) is a (directed) segment.
     * * On output, it is restricted to (0,1) while maintaining direction
     * * If the clip leaves nothing, leave this segment alone and return false.
     * * If the clip leaves something, update this segment and return true.
     * @param clamp0 whether to clamp the smaller number to 0. Default value is true.
     * @param clamp1 whether to clamp the larger number to 1. Default value is true.
     * @param allowSingleton whether to return true for an interval clipped to a single number (x0 === x1). Default value is false.
     * @return whether this interval was clipped
     */
    clampDirectedTo01(clamp0?: boolean, clamp1?: boolean, allowSingleton?: boolean): boolean;
}
