import { type BlockComparisonFunction } from "./growable-float64-array";
/**
 * Array of contiguous doubles, indexed by block number and index within block.
 * * This is essentially a rectangular matrix (two dimensional array), with each block being a row of the matrix.
 * @public
 */
export declare class GrowableBlockedArray {
    /** underlying contiguous, oversized buffer. */
    protected _data: Float64Array;
    /** Number of blocks (matrix rows) in use. */
    protected _inUse: number;
    /** number of numbers per block in the array.
     * * If viewing the array as a two dimensional array, this is the row size.
     */
    protected _blockSize: number;
    /**
     * multiplier used by ensureBlockCapacity to expand requested reallocation size
     */
    protected _growthFactor: number;
    /**
     * Construct an array whose contents are in blocked (row-major) order, possibly with extra capacity.
     * * Total capacity is `this._data.length`
     * * Actual in-use count is `this._inUse * this._blockSize`
     * @param blockSize number of entries in each block, i.e., row size
     * @param initialBlocks initial capacity in blocks (default 8)
     * @param growthFactor used by ensureBlockCapacity to expand requested reallocation size (default 1.5)
     */
    constructor(blockSize: number, initialBlocks?: number, growthFactor?: number);
    /** Copy data from source array. Does not reallocate or change active block count.
     * @param source array to copy from
     * @param sourceCount copy the first sourceCount blocks; all blocks if undefined
     * @param destOffset copy to instance array starting at this block index; zero if undefined
     * @return count and offset of blocks copied
     */
    protected copyData(source: Float64Array | number[], sourceCount?: number, destOffset?: number): {
        count: number;
        offset: number;
    };
    /**
     * Make a copy of the (active) blocks in this array.
     * (The clone does NOT get excess capacity)
     */
    clone(): GrowableBlockedArray;
    /** computed property: length (in blocks, not doubles) */
    get length(): number;
    /** computed property: length (in blocks, not doubles) */
    get numBlocks(): number;
    /** property: number of data values per block */
    get numPerBlock(): number;
    /**
     * Return a single value indexed within a block. Indices are unchecked.
     * @param blockIndex index of block to read
     * @param indexInBlock  offset within the block
     */
    getWithinBlock(blockIndex: number, indexWithinBlock: number): number;
    /** clear the block count to zero, but maintain the allocated memory */
    clear(): void;
    /** Return the capacity in blocks (not doubles) */
    blockCapacity(): number;
    /** ensure capacity (in blocks, not doubles) */
    ensureBlockCapacity(blockCapacity: number, applyGrowthFactor?: boolean): void;
    /** Add a new block of data.
     * * If newData has fewer than numPerBlock entries, the remaining part of the new block is zeros.
     * * If newData has more entries, only the first numPerBlock are taken.
     */
    addBlock(newData: number[]): void;
    /**
     * Return the starting index of a block of (zero-initialized) doubles at the end.
     *
     * * this.data is reallocated if needed to include the new block.
     * * The inUse count is incremented to include the new block.
     * * The returned block is an index to the Float64Array (not a block index)
     */
    protected newBlockIndex(): number;
    /** reduce the block count by one. */
    popBlock(): void;
    /** convert a block index to the simple index to the underlying Float64Array. */
    protected blockIndexToDoubleIndex(blockIndex: number): number;
    /** Access a single double at offset within a block, with index checking and return undefined if indexing is invalid. */
    checkedComponent(blockIndex: number, componentIndex: number): number | undefined;
    /** Access a single double at offset within a block.  This has no index checking. */
    component(blockIndex: number, componentIndex: number): number;
    /** compare two blocks in simple lexical order.
     * @param data data array
     * @param blockSize number of items to compare
     * @param ia raw index (not block index) of first block
     * @param ib raw index (not block index) of second block
     */
    static compareLexicalBlock(data: Float64Array, blockSize: number, ia: number, ib: number): number;
    /** Return an array of block indices sorted per compareLexicalBlock function */
    sortIndicesLexical(compareBlocks?: BlockComparisonFunction): Uint32Array;
    /** Return the distance (hypotenuse=sqrt(summed squares)) between indicated blocks */
    distanceBetweenBlocks(blockIndexA: number, blockIndexB: number): number;
    /** Return the distance (hypotenuse=sqrt(summed squares)) between block entries `iBegin <= i < iEnd` of indicated blocks */
    distanceBetweenSubBlocks(blockIndexA: number, blockIndexB: number, iBegin: number, iEnd: number): number;
}
