import { type OrderedComparator } from "./compare";
import { type CloneFunction } from "./sorted-array";
/** Associates a value of type T with an index representing its insertion order in an IndexMap<T>
 * @public
 */
export declare class IndexedValue<T> {
    readonly value: T;
    readonly index: number;
    constructor(value: T, index: number);
}
/**
 * Maintains a set of unique elements in sorted order and retains the insertion order of each.
 * The uniqueness of the elements is determined by a comparison routine supplied by the user.
 * The user may also supply a maximum size, beyond which insertions will fail.
 * @public
 */
export declare class IndexMap<T> {
    protected _array: Array<IndexedValue<T>>;
    protected readonly _compareValues: OrderedComparator<T>;
    protected readonly _clone: CloneFunction<T>;
    protected readonly _maximumSize: number;
    /**
     * Construct a new IndexMap<T>.
     * @param compare The function used to compare elements within the map.
     * @param maximumSize The maximum number of elements permitted in the IndexMap. The maximum index of an element is maximumSize-1.
     * @param clone The function invoked to clone a new element for insertion into the array. The default implementation simply returns its input.
     */
    constructor(compare: OrderedComparator<T>, maximumSize?: number, clone?: CloneFunction<T>);
    /** The number of elements in the map. */
    get length(): number;
    /** Returns true if the maximum number of elements have been inserted. */
    get isFull(): boolean;
    /** Returns true if the map contains no elements. */
    get isEmpty(): boolean;
    /** Removes all elements from the map. */
    clear(): void;
    /** Attempt to insert a new value into the map.
     * If an equivalent element already exists in the map, the corresponding index is returned.
     * If the map is full, nothing is inserted and -1 is returned.
     * Otherwise:
     *  The new element is mapped to the next-available index (that is, the length of the map prior to insertion of this new element);
     *  the value is cloned using the function supplied to the IndexMap constructor;
     *  the cloned result is inserted into the map; and
     *  the index of the new element is returned.
     * @param value The value to insert
     * @param onInsert The optional callback method to call if insertion occurs with the inserted value
     * @returns the index of the equivalent element in the map, or -1 if the map is full and no equivalent element exists.
     */
    insert(value: T, onInsert?: (value: T) => any): number;
    /**
     * Finds the index of an element equivalent to the supplied value.
     * @param value the value to find
     * @returns the index of an equivalent element in the map, or -1 if no such element exists.
     */
    indexOf(value: T): number;
    protected lowerBound(value: T): {
        index: number;
        equal: boolean;
    };
    /** Return an array of the elements in this map in which the array index of each element corresponds to the index assigned to it by the map. */
    toArray(): T[];
}
