import { type AnyRegion } from "../curve/curve-types";
import { Loop } from "../curve/loop";
import { type IndexedXYZCollection, IndexedReadWriteXYZCollection } from "./indexed-xyz-collection";
import { type Point3d } from "./point3d-vector3d";
import { type Range3d } from "./range";
/**
 * A `SortablePolygon` carries a (single) loop with data useful for sorting for inner-outer structure.
 * @internal
 */
export declare class SortablePolygon {
    private readonly _loopCarrier;
    anyPoint?: Point3d;
    sortKey: number;
    range: Range3d;
    parentIndex?: number;
    isHole: boolean;
    outputSetIndex?: number;
    /**
     *
     * @param loop Loop to capture.
     */
    constructor(loop: IndexedReadWriteXYZCollection | Loop, range: Range3d);
    /** Push loop with sort data onto the array.
     * * No action if no clear normal.
     * * return true if pushed.
     */
    static pushPolygon(loops: SortablePolygon[], loop: IndexedReadWriteXYZCollection): boolean;
    /** Push loop with sort data onto the array.
     * * No action if no clear normal.
     * * return true if pushed.
     */
    static pushLoop(loops: SortablePolygon[], loop: Loop): boolean;
    /** Push loop with sort data onto the array.
     * * No action if no clear normal.
     * * return true if pushed.
     */
    private static assignParentsAndDepth;
    private static assemblePolygonSet;
    private static assembleLoopSet;
    static sortAsAnyRegion(loops: SortablePolygon[]): AnyRegion;
    static sortAsArrayOfArrayOfPolygons(loops: SortablePolygon[]): IndexedReadWriteXYZCollection[][];
    grabPolygon(): IndexedXYZCollection | undefined;
    grabLoop(): Loop | undefined;
    reverseForAreaSign(targetSign: number): void;
    getAnyInteriorPoint(): Point3d | undefined;
}
