import { type UsageSums } from "../../numerics/usage-sums";
import { type RangeLengthData } from "../range-length-data";
import { type Range2dSearchInterface } from "./range2d-search-interface";
/** Class with static members to work with various range searchers. */
export declare class RangeSearch {
    static readonly smallCountLimit = 40;
    /** Target size for grid block size divided by representative per-entry range size. */
    static readonly defaultRangesPerBlockEdge = 4;
    /** the "representative range size"is the mean range size plus this number of standard deviations */
    static readonly defaultStandardDeviationAdjustment = 1;
    /** Based on range count and distribution, return an object which can answer 2d range queries */
    static create2dSearcherForRangeLengthData<T>(rangeLengthData: RangeLengthData, rangesPerBlockEdge?: number, standardDeviationAdjustment?: number): Range2dSearchInterface<T> | undefined;
    /** Return the number of grid bocks (in one direction) for
     * * The total range length in this direction
     * * individual ranges whose count, mean and standard deviation are available in the sums.
     * @param totalRange the total range being searched (in this direction)
     * @param sums source for mean, count, and standard deviation of individual ranges
     * @param rangesPerBlockEdge target ratio of edge length in search blocks divided by representative length of individual range edges
     * @param standardDeviationAdjustment the number of standard deviations above the mean to be applied to convert mean to representative length.  Typically 0 to 1.
     * @returns number of blocks in grid.
     */
    static estimateGridBlockCount(totalLength: number, sums: UsageSums, rangesPerBlockEdge?: number, standardDeviationAdjustment?: number): number;
}
