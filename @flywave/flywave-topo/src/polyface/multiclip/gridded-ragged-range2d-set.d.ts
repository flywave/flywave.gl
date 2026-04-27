import { type Range3d, Range2d } from "../../geometry3d/range";
import { type LowAndHighXY } from "../../geometry3d/xyz-props";
import { type Range2dSearchInterface } from "./range2d-search-interface";
/**
 * Type abbreviation to allow undefined as a Range2dSearchInterface parameter.
 * @internal
 */
export type OptionalRange2dSearchInterface<T> = Range2dSearchInterface<T> | undefined;
/**
 * A GriddedRaggedRange2dSet is:
 * * A doubly dimensioned array of Range2dSearchInterface.
 * * Each entry represents a block in a uniform grid within the master range.
 * * Member ranges are noted in the grid block containing the range's lower left corner.
 * * Member ranges larger than twice the grid size are rejected by the insert method.
 * * Hence a search involving a point in grid block (i,j) must examine ranges in grid blocks left and below, i.e. (i-1,j-1), (i-1,j), (i,j-1)
 * @public
 */
export declare class GriddedRaggedRange2dSet<T> implements Range2dSearchInterface<T> {
    private readonly _range;
    private readonly _numXEdge;
    private readonly _numYEdge;
    /** Each grid block is a simple linear search set */
    private readonly _rangesInBlock;
    private static _workRange?;
    private constructor();
    /**
     * Create an (empty) set of ranges.
     * @param range master range
     * @param numXEdge size of grid in x direction
     * @param numYEdge size of grid in y direction
     */
    static create<T>(range: Range2d, numXEdge: number, numYEdge: number): GriddedRaggedRange2dSet<T> | undefined;
    private xIndex;
    private yIndex;
    private getBlock;
    /** If possible, insert a range into the set.
     * * Decline to insert (and return false) if:
     *    * range is null
     *    * range is not completely contained in the overall range of this set
     *    * range x or y extent is larger than 2 grid blocks
     */
    conditionalInsert(range: Range2d | Range3d | LowAndHighXY, tag: T): boolean;
    /** Add a range to the search set. */
    addRange(range: LowAndHighXY, tag: T): void;
    /**
     * * Search a single block
     * * Pass each range and tag to handler
     * * and return false if bad cell or if handler returns false.
     * @param testRange search range.
     * @param handler function to receive range and tag hits.
     * @return false if search terminated by handler.  Return true if no handler returned false.
     */
    private searchXYInIndexedBlock;
    /**
     * * Search a single block
     * * Pass each range and tag to handler
     * * and return false if bad cell or if handler returns false.
     * @param testRange search range.
     * @param handler function to receive range and tag hits.
     * @return false if search terminated by handler.  Return true if no handler returned false.
     */
    private searchRange2dInIndexedBlock;
    /**
     * * Search for ranges containing testRange
     * * Pass each range and tag to handler
     * * terminate search if handler returns false.
     * @param testRange search range.
     * @param handler function to receive range and tag hits.
     * @return false if search terminated by handler.  Return true if no handler returned false.
     */
    searchXY(x: number, y: number, handler: (range: Range2d, tag: T) => boolean): boolean;
    /**
     * * Search for ranges overlapping testRange
     * * Pass each range and tag to handler
     * * terminate search if handler returns false.
     * @param testRange search range.
     * @param handler function to receive range and tag hits.
     * @return false if search terminated by handler.  Return true if no handler returned false.
     */
    searchRange2d(testRange: LowAndHighXY, handler: (range: Range2d, tag: T) => boolean): boolean;
    /** Return the overall range of all members. */
    totalRange(result?: Range2d): Range2d;
    /** Call the handler on each defined block in the grid. */
    visitChildren(initialDepth: number, handler: (depth: number, child: Range2dSearchInterface<T>) => void): void;
}
