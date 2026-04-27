/**
 * Type for a OptionalGrowableFloat64Array or undefined.
 * @public
 */
export type OptionalGrowableFloat64Array = GrowableFloat64Array | undefined;
/**
 * Signature for a function which does lexical comparison of `blockSize` consecutive values as 2 starting indices.
 * @public
 */
export type BlockComparisonFunction = (data: Float64Array, blockSize: number, index0: number, index1: number) => number;
/**
 * A `GrowableFloat64Array` is Float64Array accompanied by a count of how many of the array's entries are considered in use.
 * * In C++ terms, this is like an std::vector
 * * As entries are added to the array, the buffer is reallocated as needed to accommodate.
 * * The reallocations leave unused space to accept further additional entries without reallocation.
 * * The `length` property returns the number of entries in use.
 * * the `capacity` property returns the (usually larger) length of the (over-allocated) Float64Array.
 * @public
 */
export declare class GrowableFloat64Array {
    private _data;
    private _inUse;
    private readonly _growthFactor;
    /** Construct a GrowableFloat64Array.
     * @param initialCapacity initial capacity (default 8)
     * @param growthFactor used by ensureCapacity to expand requested reallocation size (default 1.5)
     */
    constructor(initialCapacity?: number, growthFactor?: number);
    /** Copy data from source array. Does not reallocate or change active entry count.
     * @param source array to copy from
     * @param sourceCount copy the first sourceCount entries; all entries if undefined
     * @param destOffset copy to instance array starting at this index; zero if undefined
     * @return count and offset of entries copied
     */
    protected copyData(source: Float64Array | number[], sourceCount?: number, destOffset?: number): {
        count: number;
        offset: number;
    };
    /**
     * Create a GrowableFloat64Array with given contents.
     * @param contents data to copy into the array
     */
    static create(contents: Float64Array | number[]): GrowableFloat64Array;
    /** sort-compatible comparison.
     * * Returns `(a-b)` which is
     *   * negative if `a<b`
     *   * zero if `a === b` (with exact equality)
     *   * positive if `a>b`
     */
    static compare(a: any, b: any): number;
    /** Return a new array with
     * * All active entries copied from this instance
     * * optionally trimmed capacity to the active length or replicate the capacity and unused space.
     */
    clone(maintainExcessCapacity?: boolean): GrowableFloat64Array;
    /**
     * Returns the number of entries in use.
     * * Note that this is typically smaller than the length of the length of the supporting `Float64Array`
     */
    get length(): number;
    /**
     * Set the value at specified index.
     * @param index index of entry to set
     * @param value value to set
     */
    setAtUncheckedIndex(index: number, value: number): void;
    /**
     * Move the value at index i to index j.
     * @param i source index
     * @param j destination index.
     */
    move(i: number, j: number): void;
    /**
     * swap the values at indices i and j
     * @param i first index
     * @param j second index
     */
    swap(i: number, j: number): void;
    /**
     * append a single value to the array.
     * @param toPush value to append to the active array.
     */
    push(toPush: number): void;
    /**
     * Push each value from an array.
     * @param data array of values to push
     */
    pushArray(data: Float64Array | number[]): void;
    /** Push `numToCopy` consecutive values starting at `copyFromIndex`. */
    pushBlockCopy(copyFromIndex: number, numToCopy: number): void;
    /** Clear the array to 0 length.  The underlying memory remains allocated for reuse. */
    clear(): void;
    /**
     * Returns the number of entries in the supporting Float64Array buffer.
     * * This number can be larger than the `length` property.
     */
    capacity(): number;
    /**
     * * If the capacity (Float64Array length) is less than or equal to the requested newCapacity, do nothing.
     * * If the requested newCapacity is larger than the existing capacity, reallocate to larger capacity, and copy existing values.
     * @param newCapacity size of new array
     * @param applyGrowthFactor whether to apply the growth factor to newCapacity when reallocating
     */
    ensureCapacity(newCapacity: number, applyGrowthFactor?: boolean): void;
    /**
     * * If newLength is less than current length, just reset current length to newLength, effectively trimming active entries but preserving original capacity.
     * * If newLength is greater than current length, reallocate to (exactly) newLength, copy existing entries, and pad with padValue up to newLength.
     * @param newLength new data count
     * @param padValue value to use for padding if the length increases.
     */
    resize(newLength: number, padValue?: number): void;
    /**
     * * Reduce the length by one.
     * * Note that there is no method return value -- use `back` to get that value before `pop()`
     * * (As with std::vector, separating the `pop` from the value access eliminates error testing from `pop` call)
     */
    pop(): void;
    /** Access by index, without bounds check */
    atUncheckedIndex(index: number): number;
    /** Access the 0-index member, without bounds check */
    front(): number;
    /** Access the final member, without bounds check */
    back(): number;
    /** set a value by index */
    reassign(index: number, value: number): void;
    /**
     * * Sort the array entries.
     * * Uses insertion sort -- fine for small arrays (less than 30), slow for larger arrays
     * @param compareMethod comparison method
     */
    sort(compareMethod?: (a: any, b: any) => number): void;
    /**
     * * compress out values not within the [a,b] interval.
     * * Note that if a is greater than b all values are rejected.
     * @param a low value for accepted interval
     * @param b high value for accepted interval
     */
    restrictToInterval(a: number, b: number): void;
    /**
     * * compress out multiple copies of values.
     * * this is done in the current order of the array.
     */
    compressAdjacentDuplicates(tolerance?: number): void;
}
