/**
 * `TaggedNumericConstants` defines enums with constant values for use in tags of [[TaggedNumericData]]
 * @public
 */
export declare namespace TaggedNumericConstants {
    /**  Reserved values for the "tagA" member of [[TaggedNumericData]]
     * @public
     *
     */
    enum TaggedNumericTagType {
        /** `tagA` value identifying a subdivision surface*/
        SubdivisionSurface = -1000
    }
    /**
     * `tagB` values for supported types of subdivision surfaces
     * @public
     */
    enum SubdivisionMethod {
        ChooseBasedOnFacets = 0,
        CatmullClark = 1,
        Loop = 2,
        DooSabin = 3
    }
    /**
     * numeric values for subdivision control.  These are entered in the intData array as first of a pair.
     * @public
     */
    enum SubdivisionControlCode {
        /** pair (FixedDepth, d) indicates subdivision to depth d */
        FixedDepth = -100,
        /** pair (FixedDepth, index) indicates absolute tolerance with value in doubleData[index] */
        AbsoluteTolerance = -101,
        /** pair (FixedDepth, index) indicates tolerance as a fraction of base mesh range is found in doubleData[index] */
        FractionOfRangeBoxTolerance = -102
    }
}
/**
 * Structure with 2 integer tags and optional arrays of integers, doubles, points, vectors, and geometry.
 * * In typescript/javascript, all integer numbers that can be non-integer.  Please do not insert non-integers in the integer array.
 * @public
 */
export declare class TaggedNumericData {
    /** Application specific primary tag.   See reserved values in  [[TaggedNumericConstants]] */
    tagA: number;
    /** Application specific secondary tag.   See reserved values in  [[TaggedNumericConstants]] */
    tagB: number;
    constructor(tagA?: number, tagB?: number, intData?: number[], doubleData?: number[]);
    /** Integer data with application-specific meaning */
    intData?: number[];
    /** Double data with application-specific meaning */
    doubleData?: number[];
    /**
     * push a pair of int values on the intData array.
     * @param intA
     * @param intB
     */
    pushIntPair(intA: number, intB: number): void;
    /**
     * push a pair of int values on the intData array.
     * @param intA int to push on the intData array, followed by index of valueB in the doubleData array.
     * @param valueB value to push on the doubleData array.
     */
    pushIndexedDouble(intA: number, valueB: number): void;
    /**
     * Search pairs in the intData array for a pair (targetTag, value).  Return the value, possibly restricted to (minValue,maxValue)
     * @param targetTag
     * @param minValue
     * @param maxValue
     * @param defaultValue
     */
    tagToInt(targetTag: number, minValue: number, maxValue: number, defaultValue: number): number;
    /**
     * Search pairs in the intData array for a pair (targetTag, index).  Return getDoubleData[index] value, possibly restricted to (minValue,maxValue)
     * @param targetTag
     * @param minValue
     * @param maxValue
     * @param defaultValue
     */
    tagToIndexedDouble(targetTag: number, minValue: number, maxValue: number, defaultValue: number): number;
    /**
     * get doubleData[index], or indicated default if the index is out of range
     * @param index
     * @param defaultValue
     */
    getDoubleData(index: number, defaultValue: number): number;
    /** Apply isAlmostEqual to all members. */
    isAlmostEqual(other: TaggedNumericData): boolean;
    static areAlmostEqual(dataA: TaggedNumericData | undefined, dataB: TaggedNumericData | undefined): boolean;
    /** Return a deep clone.  */
    clone(result?: TaggedNumericData): TaggedNumericData;
}
