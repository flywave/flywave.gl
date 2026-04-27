import { type IndexedXYZCollection } from "./indexed-xyz-collection";
interface CollectionWithLength {
    length: number;
}
/**
 * Object describing a (contiguous) subset of indices to an IndexedXYZCollection
 * @public
 */
export declare class IndexedCollectionInterval<T extends CollectionWithLength> {
    /** Any collection that has a .length member or property */
    points: T;
    /** lower limit of index range */
    begin: number;
    /** upper limit (beyond) index range. */
    end: number;
    protected constructor(points: T, base: number, limit: number);
    /** Create an interval which matches a complete indexed collection. */
    static createComplete<T extends CollectionWithLength>(points: T): IndexedCollectionInterval<T>;
    /** Create an interval which matches a collection from `start <= i < end`. */
    static createBeginEnd<T extends CollectionWithLength>(points: T, begin: number, end: number): IndexedCollectionInterval<T>;
    /** Create an interval which matches a collection from `start <= i < end`. */
    static createBeginLength<T extends CollectionWithLength>(points: T, begin: number, length: number): IndexedCollectionInterval<T>;
    /** Add one to this.begin.  Return true if the interval is still live. */
    advanceBegin(): boolean;
    /** advance this.end (but do not go beyond this.points.length)   return true if the interval is still live. */
    advanceEnd(): boolean;
    /** Return (if possible) the parent index corresponding to `localIndex` */
    localIndexToParentIndex(localIndex: number): number | undefined;
    /** Return true if
     * * the interval is empty (the empty set is a subset of all sets!)
     * * all indices in its range are valid.
     */
    get isValidSubset(): boolean;
    /** restrict this.end to this.points.length */
    restrictEnd(): void;
    /** Return true if length is 1 or more */
    get isNonEmpty(): boolean;
    /** Advance this.begin to (other.end-1), i.e. catch the last member of other. */
    advanceToTail(other: IndexedCollectionInterval<T>): boolean;
    /** Advance this.begin to (other.begin), i.e. catch the first member of other. */
    advanceToHead(other: IndexedCollectionInterval<T>): boolean;
    /** Set this interval from another, with conditional replacements:
     * * Always reference the same points as other.
     * * use optional begin and end arguments if present; if not take begin and and from other.
     * * cap end at points.length.
     */
    setFrom(other: IndexedCollectionInterval<T>, base?: number, limit?: number): void;
    /** Return the number of steps possible with current begin and end */
    get length(): number;
    /** Return true if the length is exactly 1 */
    get isSingleton(): boolean;
}
/**
 * Reference to an interval of the indices of an IndexedXYZCollection.
 * @public
 */
export declare class IndexedXYZCollectionInterval extends IndexedCollectionInterval<IndexedXYZCollection> {
}
export {};
