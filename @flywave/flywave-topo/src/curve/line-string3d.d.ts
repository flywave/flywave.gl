import { type Clipper } from "../clipping/clip-utils";
import { type BeJSONFunctions, type PlaneAltitudeEvaluator } from "../geometry";
import { type GeometryHandler, type IStrokeHandler } from "../geometry3d/geometry-handler";
import { GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYArray } from "../geometry3d/growable-xy-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range1d, Range3d } from "../geometry3d/range";
import { Ray3d } from "../geometry3d/ray3d";
import { Transform } from "../geometry3d/transform";
import { type XAndY } from "../geometry3d/xyz-props";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { type VariantCurveExtendParameter } from "./curve-extend-mode";
import { CurveLocationDetail } from "./curve-location-detail";
import { type AnnounceNumberNumberCurvePrimitive, CurvePrimitive } from "./curve-primitive";
import { type GeometryQuery } from "./geometry-query";
import { LineSegment3d } from "./line-segment3d";
import { OffsetOptions } from "./offset-options";
import { StrokeCountMap } from "./query/stroke-count-map";
import { type StrokeOptions } from "./stroke-options";
/**
 * * A LineString3d (sometimes called a PolyLine) is a sequence of xyz coordinates that are to be joined by line
 * segments.
 * * The point coordinates are stored in a GrowableXYZArray, not as full point objects.
 * * The parameterization of "fraction along" is
 *    * In a linestring with `N` segments (i.e. `N+1` points), each segment (regardless of physical length) occupies
 * the same fraction (1/N) of the 0-to-1 fraction space.
 *    * Within segment `i`, the fraction interval `i/N` to `(i+1)/N` is mapped proportionally to the segment
 *    * Note that this `fraction` is therefore NOT fraction of true distance along.
 *    * Use `moveSignedDistanceFromFraction` to do true-length evaluations.
 * @public
 */
export declare class LineString3d extends CurvePrimitive implements BeJSONFunctions {
    /** String name for schema properties */
    readonly curvePrimitiveType = "lineString";
    private static readonly _workPointA;
    private static readonly _workPointB;
    private static readonly _workPointC;
    private static readonly _workRay;
    /** test if `other` is an instance of `LineString3d` */
    isSameGeometryClass(other: GeometryQuery): boolean;
    /** A LineString3d extends along its first and final segments. */
    get isExtensibleFractionSpace(): boolean;
    private _points;
    private _fractions?;
    private _uvParams?;
    private _derivatives?;
    private _surfaceNormals?;
    private _pointIndices?;
    private _uvIndices?;
    private _normalIndices?;
    /** Return the points array (cloned). */
    get points(): Point3d[];
    /** Return (reference to) point data in packed GrowableXYZArray. */
    get packedPoints(): GrowableXYZArray;
    /**
     * Return array of fraction parameters.
     * * These Are only present during certain constructions such as faceting.
     * * When present, these fractions are fractions of some other curve being stroked, and are NOT related to the
     * linestring fraction parameters.
     */
    get fractions(): GrowableFloat64Array | undefined;
    /** Return the (optional) array of derivatives. These Are only present during certain constructions such as faceting. */
    get packedDerivatives(): GrowableXYZArray | undefined;
    /** Return the (optional) array of uv params. These Are only present during certain constructions such as faceting. */
    get packedUVParams(): GrowableXYArray | undefined;
    /** Return the (optional) array of surface normals. These Are only present during certain constructions such as faceting. */
    get packedSurfaceNormals(): GrowableXYZArray | undefined;
    /** Return the (optional) array of normal indices. These Are only present during certain constructions such as faceting. */
    get normalIndices(): GrowableFloat64Array | undefined;
    /** Return the (optional) array of param indices. These Are only present during certain constructions such as faceting. */
    get paramIndices(): GrowableFloat64Array | undefined;
    /** Return the (optional) array of point indices. These Are only present during certain constructions such as faceting. */
    get pointIndices(): GrowableFloat64Array | undefined;
    private constructor();
    /** Clone this linestring and apply the transform to the clone points. */
    cloneTransformed(transform: Transform): LineString3d;
    /**
     * Create a linestring, using flex length arg list and any typical combination of points such as
     * Point3d, Point2d, `[1,2,3]', array of any of those, or GrowableXYZArray
     */
    static create(...points: any[]): LineString3d;
    /**
     * Create a linestring, capturing the given GrowableXYZArray as the points.
     * Point3d, Point2d, `[1,2,3]', array of any of those, or GrowableXYZArray
     */
    static createCapture(points: GrowableXYZArray): LineString3d;
    /** Create a linestring from `XAndY` points, with a specified z applied to all. */
    static createXY(points: XAndY[], z: number, enforceClosure?: boolean): LineString3d;
    /**
     * Add points to the linestring.
     * Valid inputs are:
     * * a Point2d
     * * a point3d
     * * An array of 2 doubles
     * * An array of 3 doubles
     * * A GrowableXYZArray
     * * An array of any of the above
     */
    addPoints(...points: any[]): void;
    /** Add points accessed by index in a GrowableXYZArray, with a specified index step. */
    addSteppedPoints(source: GrowableXYZArray, pointIndex0: number, step: number, numAdd: number): void;
    /**
     * Add a point to the linestring.
     * @param point
     */
    addPoint(point: Point3d): void;
    /**
     * Add a point to the linestring.
     * @param point
     */
    addPointXYZ(x: number, y: number, z?: number): void;
    /**
     * Append a fraction to the fractions array.
     * @param fraction
     */
    addFraction(fraction: number): void;
    /** Ensure that the fraction array exists with no fractions but at least the capacity of the point array. */
    ensureEmptyFractions(): GrowableFloat64Array;
    /** Ensure that the parameter array exists with no points but at least the capacity of the point array. */
    ensureEmptyUVParams(): GrowableXYArray;
    /** Ensure that the surfaceNormals array exists with no points but at least the capacity of the point array. */
    ensureEmptySurfaceNormals(): GrowableXYZArray;
    /** Ensure that the surfaceNormals array exists with no points but at least the capacity of the point array. */
    ensureEmptyDerivatives(): GrowableXYZArray;
    /** Ensure that the surfaceNormals array exists with no points but at least the capacity of the point array. */
    ensureEmptyNormalIndices(): GrowableFloat64Array;
    /** Ensure that the surfaceNormals array exists with no points but at least the capacity of the point array. */
    ensureEmptyUVIndices(): GrowableFloat64Array;
    /** Ensure that the surfaceNormals array exists with no points but at least the capacity of the point array. */
    ensureEmptyPointIndices(): GrowableFloat64Array;
    /**
     * Append a uv coordinate to the uvParams array
     * @param uv
     */
    addUVParam(uvParam: XAndY): void;
    /**
     * Append a uv coordinate to the uvParams array
     * @param uv
     */
    addUVParamAsUV(u: number, v: number): void;
    /**
     * Append a derivative to the derivative array
     * @param vector
     */
    addDerivative(vector: Vector3d): void;
    /**
     * Append a surface normal to the surface normal array.
     * @param vector
     */
    addSurfaceNormal(vector: Vector3d): void;
    /** If the linestring is not already closed, add a closure point. */
    addClosurePoint(): void;
    /** Eliminate (but do not return!!) the final point of the linestring */
    popPoint(): void;
    /** Compute `uvParams` array as (xy parts of) a linear transform of the xyz coordinates */
    computeUVFromXYZTransform(transform: Transform): void;
    /**
     * Create the linestring for a rectangle parallel to the xy plane.
     * * The z coordinate from `point0` is used for all points.
     * * `ax` and `ay` are signed.
     * * The point sequence is:
     *    * Start at `point0`
     *    * move by (signed !) `ax` in the x direction.
     *    * move by (signed !) `ay` in the y direction.
     *    * move by (signed !) negative `ax` in the x direction.
     *    * move by (signed !) negative `ay` in the y direction.
     *    * (this returns to `point0`)
     */
    static createRectangleXY(point0: Point3d, ax: number, ay: number, closed?: boolean): LineString3d;
    /**
     * Create a regular polygon centered
     * @param center center of the polygon.
     * @param edgeCount number of edges.
     * @param radius distance to vertex or edge (see `radiusToVertices`)
     * @param radiusToVertices true if polygon is inscribed in circle (radius measured to vertices); false if polygon
     * is outside circle (radius to edges)
     */
    static createRegularPolygonXY(center: Point3d, edgeCount: number, radius: number, radiusToVertices?: boolean): LineString3d;
    /**
     * Copy coordinate data from another linestring.
     *  * The copied content is:
     *    * points
     *    * derivatives (if present)
     *    * fractions (if present)
     *    * surfaceNormals (if present)
     *    * uvParams (if present)
     * @param other
     */
    setFrom(other: LineString3d): void;
    /** Create a linestring from an array of points. */
    static createPoints(points: Point3d[]): LineString3d;
    /** Create a linestring, taking points at specified indices from an array of points. */
    static createIndexedPoints(points: Point3d[], index: number[], addClosure?: boolean): LineString3d;
    /** Create a LineString3d from xyz coordinates packed in a Float64Array */
    static createFloat64Array(xyzData: Float64Array): LineString3d;
    /** Return a clone of this linestring. */
    clone(): LineString3d;
    /**
     * Set point coordinates from a json array, e.g. `[[1,2,3],[4,5,6] . . .]`
     * * The `json` parameter must be an array.
     * * Each member `i` of the array is converted to a point with `Point3d.fromJSON(json[i]`)
     */
    setFromJSON(json?: any): void;
    /**
     * Convert an LineString3d to a JSON object.
     * * The returned object is an array of arrays of x,y,z coordinates, `[[x,y,z],...[x,y,z]]`
     */
    toJSON(): any;
    /**
     * Construct a new linestring.
     * * See `LineString3d.setFromJSON ()` for remarks on `json` structure.
     */
    static fromJSON(json?: any): LineString3d;
    /**
     * Evaluate a point a fractional position along this linestring.
     * * See `LineString3d` class comments for description of how fraction relates to the linestring points.
     * @param fraction fractional position
     * @param result optional result
     */
    fractionToPoint(fraction: number, result?: Point3d): Point3d;
    /**
     * Evaluate a point a fractional position and derivative with respect to fraction along this linestring.
     * * See `LineString3d` class comments for description of how fraction relates to the linestring points.
     * @param fraction fractional position
     * @param result optional result
     */
    fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
    /** Return point and derivative at fraction, with 000 second derivative. */
    fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Convert a segment index and local fraction to a global fraction.
     * @param index index of segment being evaluated
     * @param localFraction local fraction in [0,1] within the segment
     * @return global fraction f in [0,1] such that the segment is parameterized by index/N <= f <= (index+1)/N.
     */
    segmentIndexAndLocalFractionToGlobalFraction(index: number, localFraction: number): number;
    /**
     * Convert a global fraction to a segment index and local fraction.
     * @param globalFraction a fraction f in [0,1] in the linestring parameterization, where the i_th segment
     * (0 <= i < N) is parameterized by i/N <= f <= (i+1)/N.
     */
    globalFractionToSegmentIndexAndLocalFraction(globalFraction: number): {
        index: number;
        fraction: number;
    };
    /** Return a frenet frame, using nearby points to estimate a plane. */
    fractionToFrenetFrame(fraction: number, result?: Transform): Transform;
    /** Evaluate the start point of the linestring. */
    startPoint(): Point3d;
    /** If i is a valid index, return that point. */
    pointAt(i: number, result?: Point3d): Point3d | undefined;
    /** If i and j are both valid indices, return the vector from point i to point j */
    vectorBetween(i: number, j: number, result?: Vector3d): Vector3d | undefined;
    /** If i is a valid index, return that stored derivative vector. */
    derivativeAt(i: number, result?: Vector3d): Vector3d | undefined;
    /** If i is a valid index, return that stored surfaceNormal vector. */
    surfaceNormalAt(i: number, result?: Vector3d): Vector3d | undefined;
    /** Return the number of points in this linestring. */
    numPoints(): number;
    /** Evaluate the end point of the linestring. */
    endPoint(): Point3d;
    /** Reverse the points within the linestring. */
    reverseInPlace(): void;
    /** Apply `transform` to each point of this linestring. */
    tryTransformInPlace(transform: Transform): boolean;
    /** Sum the lengths of segments within the linestring */
    curveLength(): number;
    /** Sum the lengths of segments between fractional positions on a linestring. */
    curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
    /** Compute the range of points between fractional positions on the linestring. */
    rangeBetweenFractions(fraction0: number, fraction1: number, transform?: Transform): Range3d;
    /**
     * * Implementation of `CurvePrimitive.moveSignedDistanceFromFraction`.  (see comments there!)
     * * Find the segment that contains the start fraction
     * * Move point-by-point from that position to the start or end (respectively for negative or positive signedDistance)
     * * Optionally extrapolate
     * @param startFraction
     * @param signedDistance
     * @param allowExtension
     * @param result
     */
    moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: false, result?: CurveLocationDetail): CurveLocationDetail;
    /** Sum lengths of segments in the linestring.  (This is a true length.) */
    quickLength(): number;
    /**
     * Compute and normalize cross product among 3 points on the linestring.
     * * "any" 3 points are acceptable -- no test for positive overall sense.
     * * This is appropriate for polygon known to be convex.
     * * use points spread at index step n/3, hopefully avoiding colinear points.
     * * If that fails, try points 012
     * @param result computed normal.
     */
    quickUnitNormal(result?: Vector3d): Vector3d | undefined;
    /** Find the point on the linestring (including its segment interiors) that is closest to spacePoint. */
    closestPoint(spacePoint: Point3d, extend: VariantCurveExtendParameter, result?: CurveLocationDetail): CurveLocationDetail;
    /** Test if all points of the linestring are in a plane. */
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    /** Push a hit, fixing up the prior entry if needed. */
    private static pushVertexHit;
    /**
     * Find intersections with a plane.
     *  Intersections within segments are recorded as CurveIntervalRole.isolated
     *   Intersections at isolated "on" vertex are recoded as CurveIntervalRole.isolatedAtVertex.
     */
    appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number;
    /** Extend `rangeToExtend` to include all points of this linestring. */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** Test if each point of this linestring isAlmostEqual with corresponding point in `other`. */
    isAlmostEqual(other: GeometryQuery): boolean;
    /**
     * Append (clone of) one point.
     * * BUT ... skip if duplicates the tail of prior points.
     * * if fraction is given, "duplicate" considers both point and fraction.
     */
    appendStrokePoint(point: Point3d, fraction?: number): void;
    /** Compress out duplicate points (according to point.isAlmostEqual) */
    removeDuplicatePoints(tolerance?: number): void;
    /**
     * Append a suitable evaluation of a curve ..
     * * always append the curve point
     * * if fraction array is present, append the fraction
     * * if derivative array is present, append the derivative
     * BUT ... skip if duplicates the tail of prior points.
     */
    appendFractionToPoint(curve: CurvePrimitive, fraction: number): void;
    /**
     * Clear all array data:
     * * points
     * * optional fractions.
     * * optional derivatives.
     */
    clear(): void;
    /**
     * * options.needParams triggers creation of fraction array and uvParams array.
     * * options.needNormals triggers creation of derivatives array
     * @param capacity if positive, initial capacity of arrays
     * @param options  optional, to indicate if fraction and derivative arrays are required.
     */
    static createForStrokes(capacity: number, options: StrokeOptions | undefined): LineString3d;
    /**
     * Evaluate a curve at uniform fractions. Append the evaluations to this linestring.
     * @param curve primitive to evaluate.
     * @param numStrokes number of strokes (edges).
     * @param fraction0 starting fraction coordinate
     * @param fraction1 end fraction coordinate
     * @param include01 if false, points at fraction0 and fraction1 are omitted.
     */
    appendFractionalStrokePoints(curve: CurvePrimitive, numStrokes: number, fraction0?: number, fraction1?: number, include01?: boolean): void;
    /**
     * Append points constructed as interpolation between two points.
     * @param numStrokes number of strokes.
     * @param point0 first point
     * @param point1 last point
     * @param include01 if false, OMIT both start and end points (i.e. only compute and add true interior points)
     */
    appendInterpolatedStrokePoints(numStrokes: number, point0: Point3d, point1: Point3d, include01: boolean): void;
    /** Emit strokes to caller-supplied linestring */
    emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
    /**
     * Emit strokable parts of the curve to a caller-supplied handler.
     * If the stroke options does not have a maxEdgeLength, one stroke is emitted for each segment of the linestring.
     * If the stroke options has a maxEdgeLength, smaller segments are emitted as needed.
     */
    emitStrokableParts(handler: IStrokeHandler, options?: StrokeOptions): void;
    /**
     * Return the stroke count required for given options.
     * @param options StrokeOptions that determine count
     */
    computeStrokeCountForOptions(options?: StrokeOptions): number;
    /**
     * Compute individual segment stroke counts.  Attach in a StrokeCountMap.
     * @param options StrokeOptions that determine count
     * @param parentStrokeMap evolving parent map.
     */
    computeAndAttachRecursiveStrokeCounts(options?: StrokeOptions, parentStrokeMap?: StrokeCountMap): void;
    /** Second step of double dispatch:  call `handler.handleLineString3d(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    /**
     * Find intervals of this CurvePrimitive that are interior to a clipper
     * @param clipper clip structure (e.g. clip planes)
     * @param announce (optional) function to be called announcing fractional intervals"
     * ` announce(fraction0, fraction1, curvePrimitive)`
     * @returns true if any "in" segments are announced.
     */
    announceClipIntervals(clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    private static readonly _indexPoint;
    /** @param fraction used to interpolate between points at index and index + 1 */
    private addResolvedPoint;
    /**
     * Return a LineString which is a portion of this curve.
     * * Fractions outside [0,1] extend the relevant end segment.
     * @param fractionA [in] start fraction
     * @param fractionB [in] end fraction
     */
    clonePartialCurve(fractionA: number, fractionB: number): LineString3d;
    /** Return (if possible) a specific segment of the linestring */
    getIndexedSegment(index: number): LineSegment3d | undefined;
    /** Returns true if first and last points are within metric tolerance. */
    get isPhysicallyClosed(): boolean;
    /**
     * Evaluate strokes at fractions indicated in a StrokeCountMap.
     * * The map must have an array of component counts corresponding to the segment of this linestring.
     * * "fractions" in the output are mapped within a0,a1 of the map.componentData
     * @param map = stroke count data.
     * @param destLinestring = receiver linestring.
     * @return number of strokes added.  0 if `map.componentData` does not match the linestring
     */
    addMappedStrokesToLineString3D(map: StrokeCountMap, destLinestring: LineString3d): number;
    /**
     * Convert variant point data to a single level array of linestrings.
     * * The result is always an array of LineString3d.
     *   * Single linestring is NOT bubbled out as a special case.
     *   * data with no point is an empty array.
     *   * "deep" data is flattened to a single array of linestrings, losing structure.
     */
    static createArrayOfLineString3d(data: MultiLineStringDataVariant): LineString3d[];
    /**
     * Return an array containing only the curve primitives.
     * @param collectorArray array to receive primitives (pushed -- the array is not cleared)
     * @param _smallestPossiblePrimitives unused
     * @param explodeLinestrings if true, push a [[LineSegment3d]] for each segment. If false, only push `this`.
     */
    collectCurvePrimitivesGo(collectorArray: CurvePrimitive[], _smallestPossiblePrimitives: boolean, explodeLinestrings?: boolean): void;
    /**
     * Construct an offset of each segment as viewed in the xy-plane (ignoring z).
     * * No attempt is made to join the offset segments. Use RegionOps.constructCurveXYOffset() to return a fully
     * joined offset.
     * @param offsetDistanceOrOptions offset distance (positive to left of the instance curve), or options object
     */
    constructOffsetXY(offsetDistanceOrOptions: number | OffsetOptions): CurvePrimitive | CurvePrimitive[] | undefined;
    /**
     * Project instance geometry (via dispatch) onto the given ray, and return the extreme fractional parameters
     * of projection.
     * @param ray ray onto which the instance is projected. A `Vector3d` is treated as a `Ray3d` with zero origin.
     * @param lowHigh optional receiver for output
     * @returns range of fractional projection parameters onto the ray, where 0.0 is start of the ray and 1.0 is
     * the end of the ray.
     */
    projectedParameterRange(ray: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
}
/**
 * An AnnotatedLineString3d is a linestring with additional surface-related data attached to each point
 * * This is useful in facet construction.
 * @internal
 */
export declare class AnnotatedLineString3d {
    /** Parameter along curve being faceted.  */
    curveParam?: GrowableFloat64Array;
    /** uv parameters, stored as uvw with the w possibly used for distinguishing among multiple "faces". */
    uvwParam?: GrowableXYZArray;
    /** u direction tangent vectors from surface being faceted. */
    vectorU?: GrowableXYZArray;
    /** v direction tangent vectors from surface being faceted. */
    vectorV?: GrowableXYZArray;
}
