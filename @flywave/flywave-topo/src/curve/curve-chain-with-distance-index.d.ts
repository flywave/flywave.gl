import { type GeometryHandler, type IStrokeHandler } from "../geometry3d/geometry-handler";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { type Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { type Vector3d, Point3d } from "../geometry3d/point3d-vector3d";
import { type Range1d, Range3d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { CurveChain } from "./curve-collection";
import { type VariantCurveExtendParameter } from "./curve-extend-mode";
import { CurveLocationDetail, CurveLocationDetailPair } from "./curve-location-detail";
import { CurvePrimitive } from "./curve-primitive";
import { type GeometryQuery } from "./geometry-query";
import { type LineString3d } from "./line-string3d";
import { OffsetOptions } from "./offset-options";
import { StrokeCountMap } from "./query/stroke-count-map";
import { type StrokeOptions } from "./stroke-options";
/**
 * Annotation of a fragment, i.e. an interval of a curve.
 * * The interval is marked with two pairs of numbers:
 * * * fraction0, fraction1 = fraction parameters along the child curve.
 * * * distance0, distance1 = distances within containing CurveChainWithDistanceIndex.
 * @public
 */
export declare class PathFragment {
    /** Distance along parent to this fragment start. */
    chainDistance0: number;
    /** Distance along parent to this fragment end. */
    chainDistance1: number;
    /** The start of this `PathFragment`, as a local fractional parameter of `this.childCurve`. */
    childFraction0: number;
    /** The end of this `PathFragment`, as a local fractional parameter of `this.childCurve`. */
    childFraction1: number;
    /** Curve primitive of this fragment, as presented in stroker. Note that this might have become a proxy. */
    childCurve: CurvePrimitive;
    /** Optional range */
    range?: Range3d;
    /** Working var for use in searches. */
    a: number;
    /** Create a fragment with complete fraction, distance, and child data. */
    constructor(childFraction0: number, childFraction1: number, distance0: number, distance1: number, childCurve: CurvePrimitive, range?: Range3d);
    /** Return true if the distance is within the distance limits of this fragment. */
    containsChainDistance(distance: number): boolean;
    /**
     * Return a quick minimum distance from spacePoint to the curve.
     * * The returned distance is to the curve's range box if defined; otherwise, the true distance is computed.
     * * Thus the returned distance may be SMALLER than the true distance to the curve, but not larger.
     */
    quickMinDistanceToChildCurve(spacePoint: Point3d): number;
    /**
     * Return an array with (references to) all the input path fragments, sorted smallest to largest on the "a" value,
     * initialized with `quickMinDistanceToChildCurve`
     */
    static collectSortedQuickMinDistances(fragments: PathFragment[], spacePoint: Point3d): PathFragment[];
    /** Return true if `this` fragment addresses `curve` and brackets `fraction`. */
    containsChildCurveAndChildFraction(curve: CurvePrimitive, fraction: number): boolean;
    /**
     * Convert distance to local fraction and apply that to interpolate between the stored curve fractions.
     * Note that proportional calculation does NOT account for non-uniform parameterization in the child curve.
     */
    chainDistanceToInterpolatedChildFraction(distance: number): number;
    /** Convert the given chainDistance to a fraction along this childCurve using `moveSignedDistanceFromFraction`. */
    chainDistanceToAccurateChildFraction(chainDistance: number, allowExtrapolation?: boolean): number;
    /**
     * Return the scale factor to map childCurve fraction derivatives to chain fraction derivatives.
     * @param globalDistance total length of the global curve
     */
    fractionScaleFactor(globalDistance: number): number;
    /**
     * Reverse the fraction and distance data.
     * * Each child fraction `f` is replaced by `1-f`
     * * Each `chainDistance` is replaced by `totalDistance - chainDistance`
     * @param totalDistance the total distance
     */
    reverseFractionsAndDistances(totalDistance: number): void;
    /** @deprecated in 3.x. Use `PathFragment.childFractionToChainDistance`. */
    childFractionTChainDistance(fraction: number): number;
    /**
     * Convert a fractional position on the childCurve of this fragment to distance on the curve chain.
     * * Return value is SIGNED and will be negative when `fraction < this.childFraction0`.
     * @param fraction the fractional position on the childCurve of this fragment
     */
    childFractionToChainDistance(fraction: number): number;
}
/**
 * `CurveChainWithDistanceIndex` is a CurvePrimitive whose fractional parameterization is proportional to true
 * distance along a CurveChain.
 * * For example if the total length of the chain is `L`, then the distance along the chain from parameters `t0`
 * to `t1` is easily computed as `L*(t1-t0)`.
 * * The curve chain can be any type derived from `CurveChain`, i.e., either a `Path` or a `Loop`.
 * @public
 */
export declare class CurveChainWithDistanceIndex extends CurvePrimitive {
    /** String name for schema properties */
    readonly curvePrimitiveType = "curveChainWithDistanceIndex";
    private readonly _path;
    private readonly _fragments;
    private readonly _totalLength;
    private static _numCalls;
    private static _numTested;
    private static _numAssigned;
    private static _numCandidate;
    /** Test if `other` is a `CurveChainWithDistanceIndex` */
    isSameGeometryClass(other: GeometryQuery): boolean;
    private constructor();
    /**
     * Create a clone, transformed and with its own distance index.
     * @param transform transform to apply in the clone.
     */
    cloneTransformed(transform: Transform): CurveChainWithDistanceIndex | undefined;
    /**
     * Reference to the contained path.
     * * Do not modify the path. The distance index will be wrong.
     */
    get path(): CurveChain;
    /**
     * Reference to the fragments array.
     * * Do not modify.
     */
    get fragments(): PathFragment[];
    /** Return a deep clone */
    clone(): CurveChainWithDistanceIndex;
    /** Return a deep clone */
    clonePartialCurve(fractionA: number, fractionB: number): CurveChainWithDistanceIndex | undefined;
    /**
     * Ask if the curve is within tolerance of a plane.
     * @returns Returns true if the curve is completely within tolerance of the plane.
     */
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    /** Return the start point of `this` curve. */
    startPoint(result?: Point3d): Point3d;
    /** Return the end point of of `this` curve. */
    endPoint(result?: Point3d): Point3d;
    /** Add strokes to caller-supplied linestring */
    emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
    /**
     * Ask the curve to announce points and simple subcurve fragments for stroking.
     * See IStrokeHandler for description of the sequence of the method calls.
     */
    emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
    /**
     * Return the stroke count required for given options.
     * @param options StrokeOptions that determine count
     */
    computeStrokeCountForOptions(options?: StrokeOptions): number;
    /**
     * Return an array containing only the curve primitives.
     * @param collectorArray array to receive primitives (pushed -- the array is not cleared)
     * @param smallestPossiblePrimitives if true, recurse on the children. If false, only push `this`.
     * @param explodeLinestrings (if smallestPossiblePrimitives is true) whether to push a [[LineSegment3d]] for each
     * segment of a [[LineString3d]] child. If false, push only the [[LineString3d]].
     */
    collectCurvePrimitivesGo(collectorArray: CurvePrimitive[], smallestPossiblePrimitives?: boolean, explodeLineStrings?: boolean): void;
    /**
     * Construct StrokeCountMap for each child, accumulating data to stroke count map for this primitive.
     * @param options StrokeOptions that determine count
     * @param parentStrokeMap evolving parent map.
     */
    computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap): void;
    /**
     * Second step of double dispatch: call `this._path.dispatchToGeometryHandler (handler)`
     * * Note that this exposes the children individually to the handler.
     */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    /** Extend `rangeToExtend` as needed to include these curves (optionally transformed) */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** Return a (high accuracy and positive) length of the curve between fractional positions */
    curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
    /** Flatten CurveChainWithDistanceIndex children in the input chain.
     * @return cloned flattened CurveChain, or reference to the input chain if no nesting
     */
    private static flattenNestedChains;
    /**
     * Capture (not clone) a path into a new `CurveChainWithDistanceIndex`
     * @param path primitive array to be CAPTURED (not cloned)
     */
    static createCapture(path: CurveChain, options?: StrokeOptions): CurveChainWithDistanceIndex;
    /**
     * Return the PathFragment object at the given `distance` along the chain.
     * @param distance distance along the chain.
     * @param allowExtrapolation if `true`, returns first fragment for negative distances and returns last fragment
     * for distances larger than curve length. If `false` returns `undefined` for those out of bound distances.
     */
    chainDistanceToFragment(distance: number, allowExtrapolation?: boolean): PathFragment | undefined;
    /**
     * Return the index of the PathFragment at the given `distance` along the chain.
     * @param distance distance along the chain.
     * @param allowExtrapolation if `true`, returns 0 for negative distances and returns last fragment index for
     * distances larger than curve length. If `false` returns `undefined` for those out of bound distances.
     */
    protected chainDistanceToFragmentIndex(distance: number, allowExtrapolation?: boolean): number | undefined;
    /**
     * Convert distance along the chain to fraction along the chain.
     * @param distance distance along the chain.
     */
    chainDistanceToChainFraction(distance: number): number;
    /** Return the PathFragment object containing the point at the given `fraction` of the given child curve. */
    curveAndChildFractionToFragment(curve: CurvePrimitive, fraction: number): PathFragment | undefined;
    /** Returns the total length of `this` curve. */
    curveLength(): number;
    /**
     * Returns the total length of the path.
     * * This is exact (and simple property lookup) because the true lengths were summed at construction time.
     */
    quickLength(): number;
    /**
     * Return the point (x,y,z) on the curve at fractional position along the chain.
     * @param fraction fractional position along the curve.
     * @returns a point on the curve.
     */
    fractionToPoint(fraction: number, result?: Point3d): Point3d;
    /**
     * Return the point (x,y,z) and derivative on the curve at fractional position.
     * * Note that the derivative is "derivative of xyz with respect to fraction".
     * * The derivative shows the speed of the "fractional point" moving along the curve.
     * * The derivative is not generally a unit vector. Use `fractionToPointAndUnitTangent` for a unit vector.
     * @param fraction fractional position along the geometry.
     * @param result optional receiver for the result.
     * @returns a ray whose origin is the curve point and direction is the derivative with respect to the fraction.
     */
    fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
    /**
     * Return the point (x,y,z) and normalized derivative on the curve at fractional position.
     * * Note that the derivative is "derivative of xyz with respect to fraction".
     * * The un-normalized derivative shows the speed of the "fractional point" moving along the curve.
     * * To find the un-normalized derivative, use `fractionToPointAndDerivative`.
     * @param fraction fractional position on the curve
     * @param result optional receiver for the result.
     * @returns a ray whose origin is the curve point and direction is the normalized derivative with respect to
     * the fraction.
     */
    fractionToPointAndUnitTangent(fraction: number, result?: Ray3d): Ray3d;
    /**
     * Return a plane with
     * * origin at fractional position along the curve
     * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to
     * the fraction.
     * * vectorV is the second derivative, i.e. derivative of vectorU which points in the direction of the curve's
     * derivative's change.
     */
    fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
    /**
     * Attempt to transform in place.
     * * Warning: If any child transform fails, `this` object becomes invalid but that should never happen.
     * @param transform the transform to be applied.
     * @returns true if all of child transforms succeed and false otherwise.
     */
    tryTransformInPlace(transform: Transform): boolean;
    /** Reverse the curve's data so that its fractional stroking moves in the opposite direction. */
    reverseInPlace(): void;
    /**
     * Test for equality conditions.
     * * Mismatched total length is a quick exit condition.
     * * If total length matches, recurse to the path for matching primitives.
     */
    isAlmostEqual(other: GeometryQuery): boolean;
    /**
     * (Attempt to) find a position on the curve at a signed distance from start fraction.
     * * See `CurvePrimitive.moveSignedDistanceFromFraction` for parameter details.
     * * The returned location directly identifies fractional position along the CurveChainWithDistanceIndex and
     * has pointer to an additional detail for the child curve.
     */
    moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail;
    /**
     * Return an object summarizing closest point test counts.
     * The returned object has
     * * numCalls = number of times closestPoint was called.
     * * numCurvesTested = number of curves tested with full closestPoint.
     * * numAssigned = number of times a new minimum value was recorded.
     * * numCandidate = number of curves that would be tested in worst case.
     * @param clear if true, counts are cleared after the return object is formed.
     */
    static getClosestPointTestCounts(clear?: boolean): {
        numCalls: number;
        numTested: number;
        numAssigned: number;
        numCandidate: number;
    };
    /**
     * Search for the curve point that is closest to the spacePoint.
     * * The CurveChainWithDistanceIndex invokes the base class CurvePrimitive method, which (via a handler)
     * determines a CurveLocation detail among the children.
     * * The returned detail directly identifies fractional position along the CurveChainWithDistanceIndex and
     * has pointer to an additional detail for the child curve.
     * @param spacePoint point in space
     * @param extend true to extend the curve
     * @returns a CurveLocationDetail structure that holds the details of the close point.
     */
    closestPoint(spacePoint: Point3d, extend: VariantCurveExtendParameter): CurveLocationDetail | undefined;
    /**
     * Construct an offset of each child as viewed in the xy-plane (ignoring z).
     * * No attempt is made to join the offset children. Use RegionOps.constructCurveXYOffset to return a fully
     * joined offset.
     * @param offsetDistanceOrOptions offset distance (positive to left of the instance curve) or offset options object.
     */
    constructOffsetXY(offsetDistanceOrOptions: number | OffsetOptions): CurvePrimitive | CurvePrimitive[] | undefined;
    /**
     * Project instance geometry (via dispatch) onto the given ray, and return the extreme fractional parameters of
     * projection.
     * @param ray ray onto which the instance is projected. A `Vector3d` is treated as a `Ray3d` with zero origin.
     * @param lowHigh optional receiver for output.
     * @returns range of fractional projection parameters onto the ray, where 0.0 is start of the ray and 1.0 is the
     * end of the ray.
     */
    projectedParameterRange(ray: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
    /**
     * Compute the global chain detail corresponding to a local child detail.
     * @param childDetail the local detail, with respect to a child of this chain.
     * @returns the global detail, with respect to this chain.
     */
    computeChainDetail(childDetail: CurveLocationDetail): CurveLocationDetail | undefined;
    /**
     * Given a parent chain, convert the corresponding child details in the specified pairs.
     * * Converted details refer to the chain's global parameterization instead of the child's.
     * * It is assumed that for all i >= index0, `pairs[i].detailA.curve` is a child of chainA (similarly for chainB).
     * @param pairs array to mutate
     * @param index0 convert details of pairs in the tail of the array, starting at index0
     * @param chainA convert each specified detailA to the global parameterization of chainA
     * @param chainB convert each specified detailB to the global parameterization of chainB
     * @param compressAdjacent whether to remove adjacent duplicate pairs after conversion
     * @return the converted array
     * @internal
     */
    static convertChildDetailToChainDetail(pairs: CurveLocationDetailPair[], index0: number, chainA?: CurveChainWithDistanceIndex, chainB?: CurveChainWithDistanceIndex, compressAdjacent?: boolean): CurveLocationDetailPair[];
}
