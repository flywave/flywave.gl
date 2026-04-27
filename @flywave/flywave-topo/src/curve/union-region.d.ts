import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { CurveCollection } from "./curve-collection";
import { type RecursiveCurveProcessor } from "./curve-processor";
import { type AnyCurve } from "./curve-types";
import { type GeometryQuery } from "./geometry-query";
import { Loop } from "./loop";
import { ParityRegion } from "./parity-region";
import { type StrokeOptions } from "./stroke-options";
/**
 * * A `UnionRegion` is a collection of other planar region types -- `Loop` and `ParityRegion`.
 * * The composite is the union of the contained regions.
 * * A point is "in" the composite if it is "in" one or more of the contained regions.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export declare class UnionRegion extends CurveCollection {
    /** String name for schema properties */
    readonly curveCollectionType = "unionRegion";
    /** Test if `other` is a `UnionRegion` */
    isSameGeometryClass(other: GeometryQuery): boolean;
    /** Collection of Loop and ParityRegion children. */
    protected _children: Array<ParityRegion | Loop>;
    /** Return the array of regions */
    get children(): Array<ParityRegion | Loop>;
    /** Constructor -- initialize with no children */
    constructor();
    /** Create a `UnionRegion` by capturing the given regions as children. */
    static create(...data: Array<ParityRegion | Loop>): UnionRegion;
    /** Return the boundary type (5) of a corresponding MicroStation CurveVector */
    topoBoundaryType(): number;
    /** Dispatch to more strongly typed `processor.announceUnionRegion(this, indexInParent)` */
    announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
    /** Return structural clone with stroked primitives. */
    cloneStroked(options?: StrokeOptions): UnionRegion;
    /** Return new empty `UnionRegion` */
    cloneEmptyPeer(): UnionRegion;
    /**
     * Try to add a child (by capturing it).
     * * Returns false if the `AnyCurve` child is not a region type.
     */
    tryAddChild(child: AnyCurve): boolean;
    /** Return a child identified by index. */
    getChild(i: number): Loop | ParityRegion | undefined;
    /** Second step of double dispatch:  call `handler.handleUnionRegion(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
}
