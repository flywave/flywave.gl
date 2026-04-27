import { type OrderedComparator } from "./compare";
import { type CloneFunction } from "./sorted-array";
/** @public */
export type ComputePriorityFunction<T> = (value: T) => number;
/**
 * A [priority queue](https://en.wikipedia.org/wiki/Priority_queue) implemented as a heap array.
 * The queue is ordered by an [[OrderedComparator]] function supplied by the user such that the value in the queue that compares less than all other values is always located at the front of the queue.
 * @public
 */
export declare class PriorityQueue<T> implements Iterable<T> {
    protected _array: T[];
    protected readonly _compare: OrderedComparator<T>;
    protected readonly _clone: CloneFunction<T>;
    /**
     * Constructor
     * @param compare The function used to compare values in the queue. If `compare(x, y)` returns a negative value, then x is placed before y in the queue.
     * @param clone The function used to clone a value for insertion onto the queue. The default implementation simply returns its input.
     * @note If the criterion which control the result of the `compare` function changes, then [[PriorityQueue.sort]] should be used to reorder the queue according to the new criterion.
     */
    constructor(compare: OrderedComparator<T>, clone?: CloneFunction<T>);
    /** The number of values in the queue. */
    get length(): number;
    /** Returns true if the queue contains no values. */
    get isEmpty(): boolean;
    /** Returns an iterator over the contents of the heap suitable for use in `for-of` loops. */
    [Symbol.iterator](): Iterator<T>;
    protected _swap(a: number, b: number): void;
    protected _heapify(index: number): void;
    /**
     * Reorders the queue. This function should only (and *always*) be called when the criteria governing the ordering of items on the queue have changed.
     * For example, a priority queue containing graphics sorted by their distance from the camera would need to be reordered when the position of the camera changes.
     */
    sort(): void;
    /**
     * Pushes a value onto the queue according to the sorting criterion.
     * @param value The value to insert
     * @returns The inserted value, cloned according to the [[CloneFunction]] supplied to this queue's constructor.
     */
    push(value: T): T;
    /** Pushes a value onto the back of the queue without making any attempt to enforce ordering.
     * After using this function, you must manually invoke sort() to ensure the queue is sorted again.
     * @param value The value to append
     * @returns The appended value, cloned according to the [[CloneFunction]] supplied to this queue's constructor.
     */
    append(value: T): T;
    /** Returns the element at the front of the queue, or `undefined` if the queue is empty. */
    get front(): T | undefined;
    /**
     * Removes the front-most element off of the queue and returns it.
     * @returns The front-most element, or undefined if the queue is empty.
     */
    pop(): T | undefined;
    /** Removes all values from the queue. */
    clear(): void;
    /**
     * Removes the value at the specified index from the queue and reorders the queue.
     * @param index The index of the value to remove
     * @returns the value at the specified index, or undefined if the index is out of range.
     */
    protected _pop(index: number): T | undefined;
    /**
     * Returns the value at the specified index in the queue.
     * @param index The index of the value to retrieve
     * @returns the value at the specified index, or undefined if the index is out of range.
     */
    protected _peek(index: number): T | undefined;
}
