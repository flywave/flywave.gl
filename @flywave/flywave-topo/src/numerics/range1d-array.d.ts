import { GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { Range1d } from "../geometry3d/range";
/**
 * A Range1d array is a set of intervals, such as occur when a line is clipped to a (nonconvex) polygon
 * @internal
 */
export declare class Range1dArray {
    /** Internal step: Caller supplies rangeA = interval from left operand of set difference {A - B}
     *  ib = lowest possible index of overlapping interval of {B}
     *  Output live parts of rangeA, advancing B over intervals that do not extend beyond {rangeA}
     *  iB is advanced to the first interval whose high is to the right of {rangeA.high}
     */
    private static advanceIntervalDifference;
    /** Intersect intervals in two pre-sorted sets. Output may NOT be the same as either input. */
    static differenceSorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
    /** Internal step: Caller ensures rangeA is the "lower" interval.
     *  Look rangeB to decide (a) what output interval to create and (b) which read index to advance.
     *  Returns true or false to indicate whether the value associated with rangeA or rangeB should be incremented after this function returns
     */
    private static advanceIntervalIntersection;
    /** Boolean intersection among the (presorted) input ranges */
    static intersectSorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
    /** Internal step: Read an interval from the array.
     *  If it overlaps the work interval, advance the work interval, and return true to notify caller to increment read index.
     */
    private static advanceIntervalUnion;
    /** Boolean union among the (presorted) input ranges */
    static unionSorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
    /** Boolean parity among the (presorted) input ranges */
    static paritySorted(dataA: Range1d[], dataB: Range1d[]): Range1d[];
    /** Uses the Range1d specific compare function `compareRange1dLexicalLowHigh` for sorting the array of ranges */
    static sort(data: Range1d[]): void;
    /** Cleans up the array, compressing any overlapping ranges. If removeZeroLengthRanges is set to true, will also remove any Ranges in the form (x, x) */
    static simplifySortUnion(data: Range1d[], removeZeroLengthRanges?: boolean): void;
    /** Apply parity logic among ranges which are not pre-sorted. */
    static simplifySortParity(data: Range1d[], removeZeroLengthRanges?: boolean): void;
    /** test if value is "in" by union rules.
     * * This considers all intervals-- i.e. does not expect or take advantage of sorting.
     */
    static testUnion(data: Range1d[], value: number): boolean;
    /** test if value is "in" by parity rules.
     * * This considers all intervals-- i.e. does not expect or take advantage of sorting.
     */
    static testParity(data: Range1d[], value: number): boolean;
    /** linear search to count number of intervals which contain `value`.
     */
    static countContainingRanges(data: Range1d[], value: number): number;
    /** return an array with all the low and high values of all the ranges.
     * @param data array of ranges.
     * @param sort optionally request immediate sort.
     * @param compress optionally request removal of duplicates.
     */
    static getBreaks(data: Range1d[], result?: GrowableFloat64Array, sort?: boolean, compress?: boolean, clear?: boolean): GrowableFloat64Array;
    /**  evaluate a point at an array of given fraction values
     * @param data array of ranges.
     * @param initialRangeFraction fraction coordinate applied only to first range. (typically negative)
     * @param rangeFraction fraction within each range.
     * @param includeDegenerateRange if false, skip rangeFraction for 0-length ranges.
     * @param gapFraction fraction within interval from each range high to successor low
     * @param includeDegenerateGap if false, skip rangeFraction for 0-length gaps.
     * @param finalRangeFraction fraction coordinate applied only to last range (typically an extrapolation above)
     * @param result array to receive values
     */
    static appendFractionalPoints(data: Range1d[], initialRangeFraction: number | undefined, rangeFraction: number | undefined, includeDegenerateRange: boolean, gapFraction: number | undefined, includeDegenerateGap: boolean, finalRangeFraction: number | undefined, result: GrowableFloat64Array | number[]): GrowableFloat64Array | number[];
    /** Return a single range constructed with the low of range 0 and high of final range in the set.  */
    static firstLowToLastHigh(data: Range1d[]): Range1d;
    /** sum the lengths of all ranges */
    static sumLengths(data: Range1d[]): number;
    /**
     * Test if the low,high values are sorted with no overlap.
     * @param data array of ranges.
     * @param strict if true, consider exact high-to-low match as overlap.
     */
    static isSorted(data: Range1d[], strict?: boolean): boolean;
}
/** Checks low's first, then high's
 * @internal
 */
export declare function compareRange1dLexicalLowHigh(a: Range1d, b: Range1d): number;
