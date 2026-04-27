import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { CurveCollection } from "./curve-collection";
import { type RecursiveCurveProcessor } from "./curve-processor";
import { type AnyCurve } from "./curve-types";
import { type GeometryQuery } from "./geometry-query";
import { Loop } from "./loop";
import { type StrokeOptions } from "./stroke-options";
/**
 * * A `ParityRegion` is a collection of `Loop` objects.
 * * The loops collectively define a planar region.
 * * A point is "in" the composite region if it is "in" an odd number of the loops.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export declare class ParityRegion extends CurveCollection {
    /** String name for schema properties */
    readonly curveCollectionType = "parityRegion";
    /** Test if `other` is an instance of `ParityRegion` */
    isSameGeometryClass(other: GeometryQuery): boolean;
    /** Array of loops in this parity region. */
    protected _children: Loop[];
    /** Return the array of loops in this parity region. */
    get children(): Loop[];
    /** Construct parity region with empty loop array */
    constructor();
    /** Add loops (recursively) to this region's children */
    addLoops(data?: Loop | Loop[] | Loop[][]): void;
    /**
     * Return a single loop or parity region with given loops.
     * * The returned structure CAPTURES the loops.
     * * The loops are NOT reorganized by hole analysis.
     */
    static createLoops(data?: Loop | Loop[] | Loop[][]): Loop | ParityRegion;
    /** Create a parity region by capturing the given loops as children. */
    static create(...data: Loop[]): ParityRegion;
    /** Return the boundary type (4) of a corresponding  MicroStation CurveVector */
    topoBoundaryType(): number;
    /** Invoke `processor.announceParityRegion(this, indexInParent)` */
    announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
    /** Return a deep copy. */
    clone(): ParityRegion;
    /** Stroke these curves into a new ParityRegion. */
    cloneStroked(options?: StrokeOptions): ParityRegion;
    /** Create a new empty parity region. */
    cloneEmptyPeer(): ParityRegion;
    /**
     * Add `child` to this parity region (by capturing it).
     * * Any child type other than `Loop` is ignored.
     */
    tryAddChild(child: AnyCurve | undefined): boolean;
    /** Get child `i` by index. */
    getChild(i: number): Loop | undefined;
    /** Second step of double dispatch:  call `handler.handleRegion(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
}
