import { Range1d } from "../geometry3d/range";
/**
 * Accumulator for computing average and standard deviations.
 * * Usual usage pattern:
 *   * create with `sums = new UsageSums ()`
 *   * announce data values with any combination of
 *      * `sums.accumulate (x: number)`
 *      * `sums.accumulateArray (data: numberArray)`
 *   * query properties at any time:
 *      * `sums.mean`
 *      * `sums.count`
 *      * `sums.meanSquare`
 *      * `sums.standardDeviation`
 *      * `sums.minMax`
 * * Optional `origin`
 *   * if `origin` is nonzero:
 *      * when a value `x` is announced to the `accumulate(x)` method, the value used for sums is `(x-origin)`
 *   * All queries (mean, minMax, meanSquare, standardDeviation) return values relative to the origin.
 *   * The origin can be reset in two different ways:
 *     * `setOrigin(a)` sets the saved origin value to `a`, but leaves sums unchanged.
 *       * This affects subsequence how sums are changed by `announce(x)`
 *     * `shiftOriginAndSums` sets the origin (like `sums.setOrigin (a))` and also corrects all sums and minMax so they appear that the new origin had been in effect during all prior `accumulate(x)` calls.
 * @internal
 */
export declare class UsageSums {
    /** number of values accumulated. */
    private _count;
    /** Sum of values sent to `accumulate` (with origin subtracted away) */
    private _sumX;
    private _sumXX;
    private readonly _minMax;
    /** working origin.
     * * All other values -- sum0, sum1, sum2, min,max -- are "from this origin"
     */
    private _origin;
    /** Constructor:
     * * All sums 0
     * * min and max set to extreme values.
     * * origin assigned.
     */
    constructor(origin?: number);
    /** Return the number of samples seen */
    get count(): number;
    /** return the mean of all samples.
     * * Return 0 if no samples
     */
    get mean(): number;
    /** Return the mean of  squared samples.
     * * Return 0 if no samples.
     */
    get meanSquare(): number;
    get minMax(): Range1d;
    /**
     * Return the "biased standard deviation" (https://en.wikipedia.org/wiki/Standard_deviation)
     * * This is zero if count is zero.
     */
    get standardDeviation(): number;
    /** Reinitialize all sums.
     * * origin is unchanged
     */
    clearSums(): void;
    /**
     * return the origin being used in the `accumulate(x)` method.
     */
    get origin(): number;
    /**
     * Reset the origin.
     * * Former sums are unchanged !!
     * @param origin new origin
     */
    setOrigin(origin: number): void;
    /**
     * * reset the origin
     * * adjust all sums to what they would be if the new origin had been in effect.
     */
    shiftOriginAndSums(origin: number): void;
    /** Accumulate a single value */
    accumulate(x: number): void;
    /** Accumulate a single value */
    accumulateArray(xArray: number[]): void;
    /** Clone all content (origin, count, sums, minMax) */
    clone(result?: UsageSums): UsageSums;
    /** Compare all content. */
    isAlmostEqual(other: UsageSums): boolean;
}
