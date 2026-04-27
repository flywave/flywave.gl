/**
 * Class to accumulate statistics about a stream of signed numbers with tag items.
 * * All sums, counts, extrema, and item values are initialized to zero in the constructor.
 * * Each call to `announceItem (item, value)` updates the various sums, counts, and extrema.
 */
export declare class SignedDataSummary<T> {
    /** sum of all positive area items */
    positiveSum: number;
    /** number of positive area items */
    numPositive: number;
    /** sum of negative area items */
    negativeSum: number;
    /** number of negative area items */
    numNegative: number;
    /** number of zero area items */
    numZero: number;
    /** the tag item item with the largest positive data */
    largestPositiveItem?: T;
    /** the tag item item with the most negative data */
    largestNegativeItem?: T;
    largestPositiveValue: number;
    largestNegativeValue: number;
    /** array of all negative area items */
    negativeItemArray?: T[];
    /** array of zero area items */
    zeroItemArray?: T[];
    /** array of positive area items */
    positiveItemArray?: T[];
    /** setup with zero sums and optional arrays */
    constructor(createArrays: boolean);
    /** update with an item and its data value. */
    announceItem(item: T, data: number): void;
}
