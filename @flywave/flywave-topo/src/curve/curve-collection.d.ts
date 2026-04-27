import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type Point3d, type Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range1d, type Range3d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { CurveLocationDetail } from "./curve-location-detail";
import { CurvePrimitive } from "./curve-primitive";
import { type RecursiveCurveProcessor } from "./curve-processor";
import { type AnyCurve, type AnyRegion } from "./curve-types";
import { GeometryQuery } from "./geometry-query";
import type { Loop } from "./loop";
import type { Path } from "./path";
import { type StrokeOptions } from "./stroke-options";
/** Note: CurveChain and BagOfCurves classes are located in this file to prevent circular dependency. */
/**
 * Describes the concrete type of a [[CurveCollection]]. Each type name maps to a specific subclass and can be
 * used in conditional statements for type-switching.
 *    - "loop" => [[Loop]]
 *    - "path" => [[Path]]
 *    - "unionRegion" => [[UnionRegion]]
 *    - "parityRegion" => [[ParityRegion]]
 *    - "bagOfCurves" => [[BagOfCurves]]
 * @public
 */
export type CurveCollectionType = "loop" | "path" | "unionRegion" | "parityRegion" | "bagOfCurves";
/**
 * A `CurveCollection` is an abstract (non-instantiable) class for various sets of curves with particular structures:
 * - [[CurveChain]] - a non-instantiable intermediate class for a sequence of [[CurvePrimitive]] joining head-to-tail.
 * The two instantiable forms of `CurveChain` are:
 *   - [[Path]] - a chain of curves. Does not have to be closed or planar. A closed `Path` is not treated as bounding a surface.
 *   - [[Loop]] - a closed and planar chain of curves. A `Loop` is treated as bounding a planar area.
 * - [[ParityRegion]] - a collection of coplanar `Loop`, with "in/out" classification by parity rules.
 * - [[UnionRegion]] - a collection of coplanar `Loop` and/or `ParityRegion`, with "in/out" classification by union rules.
 * - [[BagOfCurves]] - a collection of [[AnyCurve]] with no implied structure.
 *
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export declare abstract class CurveCollection extends GeometryQuery {
    /** String name for schema properties */
    readonly geometryCategory = "curveCollection";
    /** Type discriminator. */
    abstract readonly curveCollectionType: CurveCollectionType;
    /** Flag for inner loop status. Only used by `Loop`. */
    isInner: boolean;
    /** Return the curve children. */
    abstract get children(): AnyCurve[];
    /** Return the sum of the lengths of all contained curves. */
    sumLengths(): number;
    /** Return the closest point on the contained curves */
    closestPoint(spacePoint: Point3d): CurveLocationDetail | undefined;
    /**
     * Return the max gap between adjacent primitives in Path and Loop collections.
     * * In a Path, gaps are computed between consecutive primitives.
     * * In a Loop, gaps are computed between consecutive primitives and between last and first.
     * * Gaps are NOT computed between consecutive CurvePrimitives in "unstructured" collections. The type is
     * "unstructured" so gaps should not be semantically meaningful.
     */
    maxGap(): number;
    /** Return true if the curve collection has any primitives other than LineSegment3d and LineString3d  */
    checkForNonLinearPrimitives(): boolean;
    /** Apply transform recursively to children */
    tryTransformInPlace(transform: Transform): boolean;
    /** Return a deep copy. */
    clone(): CurveCollection;
    /** Create a deep copy of transformed curves. */
    cloneTransformed(transform: Transform): CurveCollection | undefined;
    /** Create a deep copy with all linestrings broken down into multiple LineSegment3d. */
    cloneWithExpandedLineStrings(): CurveCollection;
    /**
     * Push all CurvePrimitives contained in the instance onto the `results` array.
     * * This method is recursive. For example, if the CurveCollection contains a Loop, all CurvePrimitives
     * of the Loop are pushed onto `results`.
     */
    private collectCurvePrimitivesGo;
    /**
     * Return an array containing all CurvePrimitives in the instance.
     * * This method is recursive. For example, if the CurveCollection contains a Loop, all CurvePrimitives of
     * the Loop are pushed onto the returned array.
     * @param collectorArray optional array to receive primitives. If present, new primitives are ADDED (without
     * clearing the array).
     * @param smallestPossiblePrimitives if false, CurvePrimitiveWithDistanceIndex returns only itself. If true,
     * it recurses to its (otherwise hidden) children.
     */
    collectCurvePrimitives(collectorArray?: CurvePrimitive[], smallestPossiblePrimitives?: boolean, explodeLineStrings?: boolean): CurvePrimitive[];
    /**
     * Return true for planar region types:
     * * `Loop`
     * * `ParityRegion`
     * * `UnionRegion`
     * @see isAnyRegion
     */
    get isAnyRegionType(): boolean;
    /** Type guard for AnyRegion */
    isAnyRegion(): this is AnyRegion;
    /**
     * Return true for a `Path`, i.e. a chain of curves joined head-to-tail
     * @see isPath
     */
    get isOpenPath(): boolean;
    /** Type guard for Path */
    isPath(): this is Path;
    /**
     * Return true for a single-loop planar region type, i.e. `Loop`.
     * * This is NOT a test for physical closure of a `Path`.
     * @see isLoop
     */
    get isClosedPath(): boolean;
    /** Type guard for Loop */
    isLoop(): this is Loop;
    /** Return a CurveCollection with the same structure but all curves replaced by strokes. */
    abstract cloneStroked(options?: StrokeOptions): CurveCollection;
    /** Support method for ICurvePrimitive ... one line call to specific announce method . . */
    abstract announceToCurveProcessor(processor: RecursiveCurveProcessor): void;
    /** Clone an empty collection. */
    abstract cloneEmptyPeer(): CurveCollection;
    /**
     * Return the boundary type of a corresponding MicroStation CurveVector.
     * * Derived class must implement.
     */
    abstract topoBoundaryType(): number;
    /**
     * Try to add a child.
     * @param child child to add.
     * @return true if child is an acceptable type for this collection.
     */
    abstract tryAddChild(child: AnyCurve | undefined): boolean;
    /** Return a child identified by by index */
    abstract getChild(i: number): AnyCurve | undefined;
    /**
     * Extend (increase) the given range as needed to encompass all curves in the curve collection.
     * @param rangeToExtend the given range.
     * @param transform if supplied, the range is extended with transformed curves.
     */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /**
     * Find any CurvePrimitive in the source and evaluate it at the given fraction.
     * * The first CurvePrimitive found is evaluated. Any other CurvePrimitives are ignored.
     * @param source containing `CurvePrimitive` or `CurveCollection`
     * @param fraction fraction to use in `curve.fractionToPoint(fraction)`
     */
    static createCurveLocationDetailOnAnyCurvePrimitive(source: GeometryQuery | undefined, fraction?: number): CurveLocationDetail | undefined;
    /**
     * Project instance geometry (via dispatch) onto the given ray, and return the extreme fractional parameters
     * of projection.
     * @param ray ray onto which the instance is projected. A `Vector3d` is treated as a `Ray3d` with zero origin.
     * @param lowHigh optional receiver for output
     * @returns range of fractional projection parameters onto the ray, where 0.0 is start of the ray and 1.0 is the
     * end of the ray.
     */
    projectedParameterRange(ray: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
}
/**
 * Shared base class for use by both open and closed paths.
 * * A `CurveChain` contains only CurvePrimitives. No other paths, loops, or regions allowed.
 * * The specific derived classes are `Path` and `Loop`.
 * * `CurveChain` is an intermediate class. It is not instantiable on its own.
 * * The related class `CurveChainWithDistanceIndex` is a `CurvePrimitive` whose API presents well-defined mappings
 * from fraction to xyz over the entire chain, but in fact does all the calculations over multiple primitives.
 * @see [Curve Collections]($docs/learning/geometry/CurveCollection.md) learning article.
 * @public
 */
export declare abstract class CurveChain extends CurveCollection {
    /** The curve primitives in the chain. */
    protected _curves: CurvePrimitive[];
    /** Constructor */
    protected constructor();
    /** Return the array of `CurvePrimitive` */
    get children(): CurvePrimitive[];
    /**
     * Return the curve primitive at the given `index`, optionally using `modulo` to map `index` to the cyclic indexing.
     * * In particular, `-1` is the final curve.
     * @param index cyclic index
     */
    cyclicCurvePrimitive(index: number, cyclic?: boolean): CurvePrimitive | undefined;
    /**
     * Stroke the chain into a simple xyz array.
     * @param options tolerance parameters controlling the stroking.
     */
    getPackedStrokes(options?: StrokeOptions): GrowableXYZArray | undefined;
    /** Return a structural clone, with CurvePrimitive objects stroked. */
    abstract cloneStroked(options?: StrokeOptions): CurveChain;
    /**
     * Add a child curve.
     * * Returns false if the given child is not a CurvePrimitive.
     */
    tryAddChild(child: AnyCurve | undefined): boolean;
    /** Return a child by index */
    getChild(i: number): CurvePrimitive | undefined;
    /** Invoke `curve.extendRange(range, transform)` for each child  */
    extendRange(range: Range3d, transform?: Transform): void;
    /**
     * Reverse each child curve (in place)
     * Reverse the order of the children in the CurveChain array.
     */
    reverseChildrenInPlace(): void;
    /**
     * Return the index where target is found in the array of children.
     * @param alsoSearchProxies whether to also check proxy curves of the children
     */
    childIndex(target: CurvePrimitive | undefined, alsoSearchProxies?: boolean): number | undefined;
    /** Evaluate an indexed curve at a fraction. Return as a CurveLocationDetail that indicates the primitive. */
    primitiveIndexAndFractionToCurveLocationDetailPointAndDerivative(index: number, fraction: number, cyclic?: boolean, result?: CurveLocationDetail): CurveLocationDetail | undefined;
}
/**
 * * A `BagOfCurves` object is a collection of `AnyCurve` objects.
 * * A `BagOfCurves` has no implied properties such as being planar.
 * @public
 */
export declare class BagOfCurves extends CurveCollection {
    /** String name for schema properties */
    readonly curveCollectionType = "bagOfCurves";
    /** Test if `other` is an instance of `BagOfCurves` */
    isSameGeometryClass(other: GeometryQuery): boolean;
    /**
     * Array of children.
     * * No restrictions on type.
     */
    protected _children: AnyCurve[];
    /** Construct an empty `BagOfCurves` */
    constructor();
    /** Return the (reference to) array of children */
    get children(): AnyCurve[];
    /** Create with given curves. */
    static create(...data: AnyCurve[]): BagOfCurves;
    /** Return the boundary type (0) of a corresponding  MicroStation CurveVector */
    topoBoundaryType(): number;
    /** Invoke `processor.announceBagOfCurves(this, indexInParent);` */
    announceToCurveProcessor(processor: RecursiveCurveProcessor, indexInParent?: number): void;
    /** Clone all children in stroked form. */
    cloneStroked(options?: StrokeOptions): BagOfCurves;
    /** Return an empty `BagOfCurves` */
    cloneEmptyPeer(): BagOfCurves;
    /** Add a child  */
    tryAddChild(child: AnyCurve | undefined): boolean;
    /** Get a child by index */
    getChild(i: number): AnyCurve | undefined;
    /** Second step of double dispatch:  call `handler.handleBagOfCurves(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
}
