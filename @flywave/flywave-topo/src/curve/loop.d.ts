import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { CurveChain } from "./curve-collection";
import { type CurvePrimitive } from "./curve-primitive";
import { type RecursiveCurveProcessor } from "./curve-processor";
import { type GeometryQuery } from "./geometry-query";
import { type StrokeOptions } from "./stroke-options";
/**
 * A `Loop` is a curve chain that is the boundary of a closed (planar) loop.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export declare class Loop extends CurveChain {
    /** String name for schema properties */
    readonly curveCollectionType = "loop";
    /** Tag value that can be set to true for user code to mark inner and outer loops. */
    isInner: boolean;
    /** Test if `other` is a `Loop` */
    isSameGeometryClass(other: GeometryQuery): boolean;
    /** Test if `other` is an instance of `Loop` */
    constructor();
    /**
     * Create a loop from variable length list of CurvePrimitives
     * @param curves array of individual curve primitives
     */
    static create(...curves: CurvePrimitive[]): Loop;
    /**
     * Create a loop from an array of curve primitives
     * @param curves array of individual curve primitives
     */
    static createArray(curves: CurvePrimitive[]): Loop;
    /** Create a loop from an array of points */
    static createPolygon(points: IndexedXYZCollection | Point3d[]): Loop;
    /** Create a loop with the stroked form of this loop. */
    cloneStroked(options?: StrokeOptions): Loop;
    /** Return the boundary type (2) of a corresponding  MicroStation CurveVector */
    topoBoundaryType(): number;
    /** Invoke `processor.announceLoop(this, indexInParent)` */
    announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
    /** Create a new `Loop` with no children */
    cloneEmptyPeer(): Loop;
    /** Second step of double dispatch:  call `handler.handleLoop(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
}
/**
 * Structure carrying a pair of loops with curve geometry.
 * @public
 */
export declare class LoopCurveLoopCurve {
    /** First loop */
    loopA?: Loop;
    /** A curve (typically an edge of loopA) */
    curveA?: CurvePrimitive;
    /** second loop */
    loopB?: Loop;
    /** A curve (typically an edge of loopB) */
    curveB?: CurvePrimitive;
    /** Constructor */
    constructor(loopA: Loop | undefined, curveA: CurvePrimitive | undefined, loopB: Loop | undefined, curveB: CurvePrimitive | undefined);
    /** Set the loopA and curveA members */
    setA(loop: Loop, curve: CurvePrimitive): void;
    /** Set the loopB and curveB members */
    setB(loop: Loop, curve: CurvePrimitive): void;
}
/**
 * Carrier object for loops characterized by area sign
 * @public
 */
export interface SignedLoops {
    /** Array of loops that have positive area sign (i.e. counterclockwise loops). */
    positiveAreaLoops: Loop[];
    /** Array of loops that have negative area sign (i.e. clockwise loops). */
    negativeAreaLoops: Loop[];
    /** Slivers where there are coincident sections of input curves. */
    slivers: Loop[];
    /** Array indicating edges between loops */
    edges?: LoopCurveLoopCurve[];
}
