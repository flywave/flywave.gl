/** A string containing a well-formed string representation of an [Id64]($core-bentley).
 * See [Working with Ids]($docs/learning/common/Id64.md).
 * @public
 */
export type Id64String = string;
/** A string containing a well-formed string representation of a [Guid]($core-bentley).
 * @public
 */
export type GuidString = string;
/** A set of [[Id64String]]s.
 * @public
 */
export type Id64Set = Set<Id64String>;
/** An array of [[Id64String]]s.
 * @public
 */
export type Id64Array = Id64String[];
/** Used as an argument to a function that can accept one or more [[Id64String]]s.
 * @public
 */
export type Id64Arg = Id64String | Id64Set | Id64Array;
/**
 * The Id64 namespace provides facilities for working with 64-bit identifiers. These Ids are stored as 64-bit integers inside an [[IModelDb]], but must be represented
 * as strings in JavaScript because JavaScript does not intrinsically support 64-bit integers.
 *
 * The [[Id64String]] type alias is used to indicate function arguments, return types, and variables which are known to contain a well-formed representation of a 64-bit Id.
 *
 * See [Working with Ids]($docs/learning/common/Id64.md) for a detailed description and code examples.
 * @public
 */
export declare namespace Id64 {
    /** Extract the "local" Id portion of an Id64String, contained in the lower 40 bits of the 64-bit value. */
    function getLocalId(id: Id64String): number;
    /** Extract the briefcase Id portion of an Id64String, contained in the upper 24 bits of the 64-bit value. */
    function getBriefcaseId(id: Id64String): number;
    /** Create an Id64String from its JSON representation.
     * @param prop The JSON representation of an Id.
     * @returns A well-formed Id string.
     * @note if the input is undefined, the result is "0", indicating an invalid Id.
     * @note if the input is not undefined, the result is the same as that of [[Id64.fromString]].
     */
    function fromJSON(prop?: string): Id64String;
    /** Given a string value, attempt to normalize it into a well-formed Id string.
     * If the input is already a well-formed Id string, it is returned unmodified.
     * Otherwise, the input is trimmed of leading and trailing whitespace, converted to lowercase, and an attempt is made to parse it as a 64-bit hexadecimal integer.
     * If parsing succeeds the normalized result is returned; otherwise the result is "0", indicating an invalid Id.
     *
     * For a description of "well-formed", see [Working with Ids]($docs/learning/common/Id64.md).
     */
    function fromString(val: string): Id64String;
    /** Produce an Id string from a local and briefcase Id.
     * @param localId The non-zero local Id as an unsigned 40-bit integer.
     * @param briefcaseId The briefcase Id as an unsigned 24-bit integer.
     * @returns an Id64String containing the hexadecimal string representation of the unsigned 64-bit integer which would result from the
     * operation `localId | (briefcaseId << 40)`, or an invalid Id "0" if the inputs are invalid.
     */
    function fromLocalAndBriefcaseIds(localId: number, briefcaseId: number): Id64String;
    /** Create an Id64String from a pair of unsigned 32-bit integers.
     * @param lowBytes The lower 4 bytes of the Id
     * @param highBytes The upper 4 bytes of the Id
     * @returns an Id64String containing the hexadecimal string representation of the unsigned 64-bit integer which would result from the
     * operation `lowBytes | (highBytes << 32)`.
     * @see [[Id64.fromUint32PairObject]] if you have a [[Id64.Uint32Pair]] object.
     */
    function fromUint32Pair(lowBytes: number, highBytes: number): Id64String;
    /** Create an Id64String from a [[Id64.Uint32Pair]].
     * @see [[Id64.fromUint32Pair]].
     */
    function fromUint32PairObject(pair: Uint32Pair): Id64String;
    /** Returns true if the inputs represent two halves of a valid 64-bit Id.
     * @see [[Id64.Uint32Pair]].
     */
    function isValidUint32Pair(lowBytes: number, highBytes: number): boolean;
    /** Represents an [[Id64]] as a pair of unsigned 32-bit integers. Because Javascript lacks efficient support for 64-bit integers,
     * this representation can be useful in performance-sensitive code like the render loop.
     * @see [[Id64.getUint32Pair]] to convert an [[Id64String]] to a Uint32Pair.
     * @see [[Id64.fromUint32Pair]] to convert a Uint32Pair to an [[Id64String]].
     * @see [[Id64.Uint32Set]] and [[Id64.Uint32Map]] for collections based on Uint32Pairs.
     */
    interface Uint32Pair {
        /** The lower 4 bytes of the 64-bit integer. */
        lower: number;
        /** The upper 4 bytes of the 64-bit integer. */
        upper: number;
    }
    /** Convert an Id64String to a 64-bit unsigned integer represented as a pair of unsigned 32-bit integers.
     * @param id The well-formed string representation of a 64-bit Id.
     * @param out Used as the return value if supplied; otherwise a new object is returned.
     * @returns An object containing the parsed lower and upper 32-bit integers comprising the 64-bit Id.
     */
    function getUint32Pair(id: Id64String, out?: Uint32Pair): Uint32Pair;
    /** Extract an unsigned 32-bit integer from the lower 4 bytes of an Id64String. */
    function getLowerUint32(id: Id64String): number;
    /** Extract an unsigned 32-bit integer from the upper 4 bytes of an Id64String. */
    function getUpperUint32(id: Id64String): number;
    /** Convert an [[Id64Arg]] into an [[Id64Set]].
     *
     * This method can be used by functions that accept an Id64Arg to conveniently process the value(s). For example:
     * ```ts
     *   public addCategories(arg: Id64Arg) { Id64.toIdSet(arg).forEach((id) => this.categories.add(id)); }
     * ```
     *
     * Alternatively, to avoid allocating a new Id64Set, use [[Id64.iterable]].
     *
     * @param arg The Ids to convert to an Id64Set.
     * @param makeCopy If true, and the input is already an Id64Set, returns a deep copy of the input.
     * @returns An Id64Set containing the set of [[Id64String]]s represented by the Id64Arg.
     */
    function toIdSet(arg: Id64Arg, makeCopy?: boolean): Id64Set;
    /** Obtain iterator over the specified Ids.
     * @see [[Id64.iterable]].
     */
    function iterator(ids: Id64Arg): Iterator<Id64String>;
    /** Obtain an iterable over the specified Ids. Example usage:
     * ```ts
     *  const ids = ["0x123", "0xfed"];
     *  for (const id of Id64.iterable(ids))
     *    console.log(id);
     * ```
     */
    function iterable(ids: Id64Arg): Iterable<Id64String>;
    /** Return the first [[Id64String]] of an [[Id64Arg]]. */
    function getFirst(arg: Id64Arg): Id64String;
    /** Return the number of [[Id64String]]s represented by an [[Id64Arg]]. */
    function sizeOf(arg: Id64Arg): number;
    /** Returns true if the [[Id64Arg]] contains the specified Id. */
    function has(arg: Id64Arg, id: Id64String): boolean;
    /** The string representation of an invalid Id. */
    const invalid = "0";
    /** Determine if the supplied id string represents a transient Id.
     * @param id A well-formed Id string.
     * @returns true if the Id represents a transient Id.
     * @note This method assumes the input is a well-formed Id string.
     * @see [[Id64.isTransientId64]]
     * @see [[TransientIdSequence]]
     */
    function isTransient(id: Id64String): boolean;
    /** Determine if the input is a well-formed [[Id64String]] and represents a transient Id.
     * @see [[Id64.isTransient]]
     * @see [[Id64.isId64]]
     * @see [[TransientIdSequence]]
     */
    function isTransientId64(id: string): boolean;
    /** Determine if the input is a well-formed [[Id64String]].
     *
     * For a description of "well-formed", see [Working with Ids]($docs/learning/common/Id64.md).
     * @see [[Id64.isValidId64]]
     */
    function isId64(id: string): boolean;
    /** Returns true if the input is not equal to the representation of an invalid Id.
     * @note This method assumes the input is a well-formed Id string.
     * @see [[Id64.isInvalid]]
     * @see [[Id64.isValidId64]]
     */
    function isValid(id: Id64String): boolean;
    /** Returns true if the input is a well-formed [[Id64String]] representing a valid Id.
     * @see [[Id64.isValid]]
     * @see [[Id64.isId64]]
     */
    function isValidId64(id: string): boolean;
    /** Returns true if the input is a well-formed [[Id64String]] representing an invalid Id.
     * @see [[Id64.isValid]]
     */
    function isInvalid(id: Id64String): boolean;
    /** A specialized replacement for Set<Id64String> optimized for performance-critical code which represents large sets of [[Id64]]s as pairs of
     * 32-bit integers.
     * The internal representation is a Map<number, Set<number>> where the Map key is the upper 4 bytes of the IDs and the Set elements are the lower 4 bytes of the IDs.
     * Because the upper 4 bytes store the 24-bit briefcase ID plus the upper 8 bits of the local ID, there will be a very small distribution of unique Map keys.
     * To further optimize this data type, the following assumptions are made regarding the { lower, upper } inputs, and no validation is performed to confirm them:
     *  - The inputs are unsigned 32-bit integers;
     *  - The inputs represent a valid Id64String (e.g., local ID is not zero).
     * @see [[Id64.Uint32Map]] for a similarly-optimized replacement for Map<Id64String, T>
     * @public
     */
    class Uint32Set {
        protected readonly _map: Map<number, Set<number>>;
        /** Construct a new Uint32Set.
         * @param ids If supplied, all of the specified Ids will be added to the new set.
         */
        constructor(ids?: Id64Arg);
        /** Remove all contents of this set. */
        clear(): void;
        /** Add an Id to the set. */
        addId(id: Id64String): void;
        /** Add any number of Ids to the set. */
        addIds(ids: Id64Arg): void;
        /** Returns true if the set contains the specified Id. */
        hasId(id: Id64String): boolean;
        /** Add an Id to the set. */
        add(low: number, high: number): void;
        /** Remove an Id from the set. */
        deleteId(id: Id64String): void;
        /** Remove any number of Ids from the set. */
        deleteIds(ids: Id64Arg): void;
        /** Remove an Id from the set. */
        delete(low: number, high: number): void;
        /** Returns true if the set contains the specified Id. */
        has(low: number, high: number): boolean;
        /** Returns true if the set contains the Id specified by `pair`. */
        hasPair(pair: Uint32Pair): boolean;
        /** Returns true if the set contains no Ids. */
        get isEmpty(): boolean;
        /** Returns the number of Ids contained in the set. */
        get size(): number;
        /** Populates and returns an array of all Ids contained in the set. */
        toId64Array(): Id64Array;
        /** Populates and returns a set of all Ids contained in the set. */
        toId64Set(): Id64Set;
        /** Execute a function against each Id in this set. */
        forEach(func: (lo: number, hi: number) => void): void;
    }
    /** A specialized replacement for Map<Id64String, T> optimized for performance-critical code.
     * @see [[Id64.Uint32Set]] for implementation details.
     * @public
     */
    class Uint32Map<T> {
        protected readonly _map: Map<number, Map<number, T>>;
        /** Remove all entries from the map. */
        clear(): void;
        /** Find an entry in the map by Id. */
        getById(id: Id64String): T | undefined;
        /** Set an entry in the map by Id. */
        setById(id: Id64String, value: T): void;
        /** Set an entry in the map by Id components. */
        set(low: number, high: number, value: T): void;
        /** Get an entry from the map by Id components. */
        get(low: number, high: number): T | undefined;
        /** Returns true if the map contains no entries. */
        get isEmpty(): boolean;
        /** Returns the number of entries in the map. */
        get size(): number;
        /** Execute a function against each entry in this map. */
        forEach(func: (lo: number, hi: number, value: T) => void): void;
    }
}
/**
 * Generates unique [[Id64String]] values in sequence, which are guaranteed not to conflict with Ids associated with persistent elements or models.
 * This is useful for associating stable, non-persistent identifiers with things like [Decorator]($frontend)s.
 * A TransientIdSequence can generate a maximum of (2^40)-2 unique Ids.
 * @public
 */
export declare class TransientIdSequence {
    private _localId;
    /** Generate and return the next transient Id64String in the sequence.
     * @deprecated in 3.x. Use [[getNext]].
     */
    get next(): Id64String;
    /** Generate and return the next transient Id64String in the sequence. */
    getNext(): Id64String;
    /** Preview the transient Id64String that will be returned by the next call to [[getNext]].
     * This is primarily useful for tests.
     */
    peekNext(): Id64String;
}
/**
 * The Guid namespace provides facilities for working with GUID strings using the "8-4-4-4-12" pattern.
 *
 * The [[GuidString]] type alias is used to indicate function arguments, return types, and variables which are known to
 * be in the GUID format.
 * @public
 */
export declare namespace Guid {
    /** Represents the empty Guid 00000000-0000-0000-0000-000000000000 */
    const empty: GuidString;
    /** Determine whether the input string is "guid-like". That is, it follows the 8-4-4-4-12 pattern. This does not enforce
     *  that the string is actually in valid UUID format.
     */
    function isGuid(value: string): boolean;
    /** Determine whether the input string is a valid V4 Guid string */
    function isV4Guid(value: string): boolean;
    /** Create a new V4 Guid value */
    function createValue(): GuidString;
    /**
     * Normalize a Guid string if possible. Normalization consists of:
     * - Convert all characters to lower case
     * - Trim any leading or trailing whitespace
     * - Convert to the standard Guid format "8-4-4-4-12", repositioning the '-' characters as necessary, presuming there are exactly 32 hexadecimal digits.
     * @param value Input value that represents a Guid
     * @returns Normalized representation of the Guid string. If the normalization fails, return the *original* value unmodified (Note: it is *not* a valid Guid)
     */
    function normalize(value: GuidString): GuidString;
}
