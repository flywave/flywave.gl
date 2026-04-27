import { Range2d } from "../../geometry3d/range";
import { type LowAndHighXY } from "../../geometry3d/xyz-props";
import { type Range2dSearchInterface } from "./range2d-search-interface";
/**
 * Use GriddedRaggedRange2dSetWithOverflow for searching among many ranges for which:
 * * Most ranges are of somewhat consistent size.
 * * A modest number of oversizes.
 * * Maintain the smallish ones in a GriddedRaggedRange2dSet.
 * * Maintain the overflows in a Range2dSearchInterface.
 * @public
 */
export declare class GriddedRaggedRange2dSetWithOverflow<T> implements Range2dSearchInterface<T> {
    private readonly _gridSet;
    private readonly _overflowSet;
    private static _workRange?;
    private constructor();
    /**
     * Create an (empty) set of ranges.
     * @param range
     * @param numXEdge
     * @param numYEdge
     */
    static create<T>(range: Range2d, numXEdge: number, numYEdge: number): GriddedRaggedRange2dSetWithOverflow<T> | undefined;
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
    /** If possible, insert a range into the set.
     * * Decline to insert (and return false) if
     *   * range is null
     *   * range is not completely contained in the overall range of this set.
     *   * range x or y extent is larger than 2 grid blocks.
     */
    addRange(range: LowAndHighXY, tag: T): void;
    /** Return the overall range of all members. */
    totalRange(result?: Range2d): Range2d;
    /** Call the handler on the overflow set, and on each defined block in the grid. */
    visitChildren(initialDepth: number, handler: (depth: number, child: Range2dSearchInterface<T>) => void): void;
}
