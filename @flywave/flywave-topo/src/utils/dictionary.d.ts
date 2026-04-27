import { type OrderedComparator } from "./compare";
import { type CloneFunction } from "./sorted-array";
/**
 * Represents an entry in a [[Dictionary]].
 * @public
 */
export interface DictionaryEntry<K, V> {
    /** The key used for lookup in the Dictionary. */
    key: K;
    /** The value associated with the key in the Dictionary. */
    value: V;
}
/**
 * Maintains a mapping of keys to values.
 * Unlike the standard Map<K, V>, a Dictionary<K, V> supports custom comparison logic for keys of object type (and for any other type).
 * The user supplies a key comparison function to the constructor, that must meet the following criteria given 'lhs' and 'rhs' of type K:
 *  - If lhs is equal to rhs, returns 0
 *  - If lhs is less than rhs, returns a negative value
 *  - If lhs is greater than rhs, returns a positive value
 *  - If compare(lhs, rhs) returns 0, then compare(rhs, lhs) must also return 0
 *  - If compare(lhs, rhs) returns a negative value, then compare(rhs, lhs) must return a positive value, and vice versa.
 *
 * Modifying a key in a way that affects the comparison function will produce unpredictable results, the
 * most likely of which is that keys will cease to map to the values with which they were initially inserted.
 * @public
 */
export declare class Dictionary<K, V> implements Iterable<DictionaryEntry<K, V>> {
    protected _keys: K[];
    protected readonly _compareKeys: OrderedComparator<K>;
    protected readonly _cloneKey: CloneFunction<K>;
    protected _values: V[];
    protected readonly _cloneValue: CloneFunction<V>;
    /**
     * Construct a new Dictionary<K, V>.
     * @param compareKeys The function used to compare keys within the dictionary.
     * @param cloneKey The function invoked to clone a key for insertion into the dictionary. The default implementation simply returns its input.
     * @param cloneValue The function invoked to clone a value for insertion into the dictionary. The default implementation simply returns its input.
     */
    constructor(compareKeys: OrderedComparator<K>, cloneKey?: CloneFunction<K>, cloneValue?: CloneFunction<V>);
    /** The number of entries in the dictionary. */
    get size(): number;
    /** Returns an iterator over the key-value pairs in the Dictionary suitable for use in `for-of` loops. Entries are returned in sorted order by key. */
    [Symbol.iterator](): Iterator<DictionaryEntry<K, V>>;
    /** Provides iteration over the keys in this Dictionary, in sorted order. */
    keys(): Iterable<K>;
    /** Provides iteration over the values in this Dictionary, in sorted order by the corresponding keys. */
    values(): Iterable<V>;
    /** Removes all entries from this dictionary */
    clear(): void;
    /**
     * Looks up a value by its key.
     * @param key The key to search for
     * @returns the value associated with the key, or undefined if the key is not present in the dictionary.
     */
    get(key: K): V | undefined;
    /**
     * Determines if an entry exists for the specified key
     * @param key The key to search for
     * @returns true if an entry exists in this dictionary corresponding to the specified key.
     */
    has(key: K): boolean;
    /**
     * Deletes a value using its key.
     * @param key The key to delete
     * @returns true if the key was found and deleted.
     */
    delete(key: K): boolean;
    /**
     * Attempts to insert a new entry into the dictionary. If an entry with an equivalent key exists, the dictionary is unmodified.
     * If the new entry is in fact inserted, both the key and value will be cloned using the functions supplied to the dictionary's constructor.
     * @param key The key to associate with the value
     * @param value The value to associate with the key
     * @returns true if the new entry was inserted, false if an entry with an equivalent key already exists.
     */
    insert(key: K, value: V): boolean;
    /** Obtains the value associated with the specified key, or inserts it if the specified key does not yet exist.
     * @param key The key to search for.
     * @param value The value to associate with `key` if `key` does not yet exist in the dictionary.
     * @returns The found or inserted value and a flag indicating whether the new value was inserted.
     */
    findOrInsert(key: K, value: V): {
        value: V;
        inserted: boolean;
    };
    /**
     * Sets the value associated with the specified key in the dictionary.
     * If no such key already exists, this is equivalent to insert(key, value); otherwise, the existing value associated with the key is replaced.
     * In either case, the value will be cloned using the function supplied to the dictionary's constructor.
     */
    set(key: K, value: V): void;
    /**
     * Extracts the contents of this dictionary as an array of { key, value } pairs, and empties this dictionary.
     * @returns An array of { key, value } pairs sorted by key.
     */
    extractPairs(): Array<{
        key: K;
        value: V;
    }>;
    /**
     * Extracts the contents of this dictionary as a pair of { keys, values } arrays, and empties this dictionary.
     * The array of keys is sorted according to the comparison criterion.
     * The position of each value in the array of values corresponds the the position of the corresponding key in the array of keys.
     * @returns a pair of { keys, values } arrays in which key[i] corresponds to value[i] in this dictionary and the keys are in sorted order.
     */
    extractArrays(): {
        keys: K[];
        values: V[];
    };
    /** Apply a function to each (key, value) pair in the dictionary, in sorted order.
     * @param func The function to be applied.
     */
    forEach(func: (key: K, value: V) => void): void;
    /**
     * Computes the position at which the specified key should be inserted to maintain sorted order.
     * @param key The key whose position is to be computed.
     * @returns an object with 'index' corresponding to the computed position and 'equal' set to true if an equivalent key already exists at that index.
     */
    protected lowerBound(key: K): {
        index: number;
        equal: boolean;
    };
}
