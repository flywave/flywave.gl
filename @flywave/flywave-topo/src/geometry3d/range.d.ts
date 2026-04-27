import { type BeJSONFunctions, AxisIndex } from "../geometry";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { type GrowableXYZArray } from "./growable-xyz-array";
import { type Vector2d, Point2d } from "./point2d-vector2d";
import { type Vector3d, Point3d } from "./point3d-vector3d";
import { Transform } from "./transform";
import { type LowAndHighXY, type LowAndHighXYZ, type Range1dProps, type Range2dProps, type Range3dProps, type XAndY, type XYAndZ } from "./xyz-props";
/**
 * Base class for Range1d, Range2d, Range3d.
 * @public
 */
export declare abstract class RangeBase {
    /** Number considered impossibly large possibly for a coordinate in a range. */
    protected static readonly _EXTREME_POSITIVE: number;
    /** Number considered to be impossibly negative for a coordinate in a range. */
    protected static readonly _EXTREME_NEGATIVE: number;
    /** Return 0 if high<= low, otherwise `1/(high-low)` for use in fractionalizing */
    protected static npcScaleFactor(low: number, high: number): number;
    /** Return true if x is outside the range `[_EXTREME_NEGATIVE, _EXTREME_POSITIVE]' */
    static isExtremeValue(x: number): boolean;
    /** Return true if any x or y or z is outside the range `[_EXTREME_NEGATIVE, _EXTREME_POSITIVE]' */
    static isExtremePoint3d(xyz: Point3d): boolean;
    /** Return true if either of x,y is outside the range `[_EXTREME_NEGATIVE, _EXTREME_POSITIVE]' */
    static isExtremePoint2d(xy: Point2d): boolean;
    /**
     * Return the min absolute distance from any point of `[lowA,highA]' to any point of `[lowB,highB]'.
     * * Both low,high pairs have order expectations:  The condition `high < low` means null interval.
     * * If there is interval overlap, the distance is zero.
     * @param lowA low of interval A
     * @param highA high of interval A
     * @param lowB low of interval B
     * @param highB high of interval B
     */
    static rangeToRangeAbsoluteDistance(lowA: number, highA: number, lowB: number, highB: number): number;
    /**
     * Given a coordinate and pair of range limits, return the smallest distance to the range.
     * * This is zero for any point inside the range
     * * This is _EXTREME_POSITIVE if the range limits are inverted
     * * Otherwise (i.e. x is outside a finite range) the distance to the near endpoint.
     */
    static coordinateToRangeAbsoluteDistance(x: number, low: number, high: number): number;
    /**
     * If a > 0, return (extrapolationFactor * a); otherwise return defaultValue
     * @param q
     * @param factor multiplier for positive q values.
     */
    static multiplyIfPositive(q: number, factor: number, defaultValue?: number): number;
}
/**
 * Axis aligned range in 3D.
 * * member `low` contains minimum coordinate of range box
 * * member  `high` contains maximum coordinate of range box
 * * The range is considered null (empty) if any low member is larger than its high counterpart.
 * @public
 */
export declare class Range3d extends RangeBase implements LowAndHighXYZ, BeJSONFunctions {
    /** Low point coordinates */
    low: Point3d;
    /** High point coordinates */
    high: Point3d;
    /** Set this transform to values that indicate it has no geometric contents. */
    setNull(): void;
    /** Freeze this instance (and its members) so it is read-only */
    freeze(): Readonly<this>;
    /** Flatten the low and high coordinates of any json object with low.x .. high.z into an array of 6 doubles */
    static toFloat64Array(val: LowAndHighXYZ): Float64Array;
    /** Flatten the low and high coordinates of this into an array of 6 doubles */
    toFloat64Array(): Float64Array;
    /**
     * Construct a Range3d from an array of double-precision values
     * @param f64 the array, which should contain exactly 6 values in this order: lowX, lowY, lowZ, highX, highY, highZ
     * @return a new Range3d object
     */
    static fromFloat64Array<T extends Range3d>(f64: Float64Array): T;
    /**
     * Construct a Range3d from an un-typed array. This mostly useful when interpreting ECSQL query results of
     * the 'blob' type, where you know that that result is a Range3d.
     * @param buffer untyped array
     * @return a new Range3d object
     */
    static fromArrayBuffer<T extends Range3d>(buffer: ArrayBuffer): T;
    constructor(lowX?: number, lowY?: number, lowZ?: number, highX?: number, highY?: number, highZ?: number);
    /** Returns true if this and other have equal low and high parts, or both are null ranges. */
    isAlmostEqual(other: Readonly<Range3d>, tol?: number): boolean;
    /** Copy low and high values from other. */
    setFrom(other: Range3d): void;
    /** Return a new Range3d copied from a range or derived type */
    static createFrom<T extends Range3d>(other: Range3d, result?: T): T;
    /**
     * Set this range (in place) from json such as
     * * key-value pairs: `{low:[1,2,3], high:[4,5,6]}`
     * * array of points: `[[1,2,3],[9,3,4],[-2,1,3] ...]`
     * * Lowest level points can be `[1,2,3]` or `{x:1,y:2,z:3}`
     */
    setFromJSON(json?: Range3dProps): void;
    /**
     * Return a JSON object `{low: ... , high: ...}`
     * with points formatted by `Point3d.toJSON()`
     */
    toJSON(): Range3dProps;
    /** Use `setFromJSON` to parse `json` into a new Range3d instance. */
    static fromJSON<T extends Range3d>(json?: Range3dProps): T;
    private setDirect;
    /** Return a copy */
    clone(result?: this): this;
    /**
     * Return a copy, translated by adding `shift` components in all directions.
     * * The translate of a null range is also a null range.
     */
    cloneTranslated(shift: XYAndZ, result?: this): this;
    /** Return a range initialized to have no content. */
    static createNull<T extends Range3d>(result?: T): T;
    /** Extend (modify in place) so that the range is large enough to include the supplied points. */
    extend(...point: Point3d[]): void;
    /** Return a range large enough to include the supplied points. If no points are given, the range is a null range */
    static create(...point: Point3d[]): Range3d;
    /** Create a range from freely structured MultiLineStringDataVariant. */
    static createFromVariantData(data: MultiLineStringDataVariant): Range3d;
    /** Create a Range3d enclosing the transformed points. */
    static createTransformed<T extends Range3d>(transform: Transform, ...point: Point3d[]): T;
    /** Create a Range3d enclosing the transformed points. */
    static createTransformedArray<T extends Range3d>(transform: Transform, points: Point3d[] | GrowableXYZArray): T;
    /** Create a Range3d enclosing the points after inverse transform. */
    static createInverseTransformedArray<T extends Range3d>(transform: Transform, points: Point3d[] | GrowableXYZArray): T;
    /** Set the range to be a single point supplied as x,y,z values */
    setXYZ(x: number, y: number, z: number): void;
    /** Create a single point range */
    static createXYZ<T extends Range3d>(x: number, y: number, z: number, result?: T): T;
    /** Create a box with 2 pairs of xyz candidates. Theses are compared and shuffled as needed for the box. */
    static createXYZXYZ<T extends Range3d>(xA: number, yA: number, zA: number, xB: number, yB: number, zB: number, result?: T): T;
    /** Create a box with 2 pairs of xyz candidates. If any direction has order flip, create null. */
    static createXYZXYZOrCorrectToNull<T extends Range3d>(xA: number, yA: number, zA: number, xB: number, yB: number, zB: number, result?: T): T;
    /** Creates a 3d range from a 2d range's low and high members, setting the corresponding z values to the value given. */
    static createRange2d<T extends Range3d>(range: Range2d, z?: number, result?: T): T;
    /** Create a range around an array of points. */
    static createArray<T extends Range3d>(points: Point3d[], result?: T): T;
    /** Extend a range around an array of points (optionally transformed) */
    extendArray(points: Point3d[] | GrowableXYZArray, transform?: Transform): void;
    /** Extend a range around an array of points (optionally transformed) */
    extendInverseTransformedArray(points: Point3d[] | GrowableXYZArray, transform: Transform): void;
    /** Multiply the point x,y,z by transform and use the coordinate to extend this range. */
    extendTransformedXYZ(transform: Transform, x: number, y: number, z: number): void;
    /** Multiply the point x,y,z,w by transform and use the coordinate to extend this range. */
    extendTransformedXYZW(transform: Transform, x: number, y: number, z: number, w: number): void;
    /** Multiply the point x,y,z by the inverse of the transform and use the coordinate to extend this range. */
    extendInverseTransformedXYZ(transform: Transform, x: number, y: number, z: number): boolean;
    /** Extend the range by the two transforms applied to xyz */
    extendTransformTransformedXYZ(transformA: Transform, transformB: Transform, x: number, y: number, z: number): void;
    /** Test if the box has high<low for any of x,y,z, condition. Note that a range around a single point is NOT null. */
    get isNull(): boolean;
    /** Test if  data has high<low for any of x,y,z, condition. Note that a range around a single point is NOT null. */
    static isNull(data: LowAndHighXYZ): boolean;
    /** Test of the range contains a single point. */
    get isSinglePoint(): boolean;
    /** Return the midpoint of the diagonal.  No test for null range. */
    get center(): Point3d;
    /** Return the low x coordinate */
    get xLow(): number;
    /** Return the low y coordinate */
    get yLow(): number;
    /** Return the low z coordinate */
    get zLow(): number;
    /** Return the high x coordinate */
    get xHigh(): number;
    /** Return the high y coordinate */
    get yHigh(): number;
    /** Return the high z coordinate */
    get zHigh(): number;
    /**  Return the length of the box in the x direction */
    xLength(): number;
    /**  Return the length of the box in the y direction */
    yLength(): number;
    /**  Return the length of the box in the z direction */
    zLength(): number;
    /**  Return the largest of the x,y, z lengths of the range. */
    maxLength(): number;
    /**
     * Return the diagonal vector. There is no check for isNull -- if the range isNull(), the vector will have very
     * large negative coordinates.
     */
    diagonal(result?: Vector3d): Vector3d;
    /**
     * Return the diagonal vector. There is no check for isNull -- if the range isNull(), the vector will have very
     * large negative coordinates.
     */
    diagonalFractionToPoint(fraction: number, result?: Point3d): Point3d;
    /** Return a point given by fractional positions on the XYZ axes. This is done with no check for isNull !!! */
    fractionToPoint(fractionX: number, fractionY: number, fractionZ?: number, result?: Point3d): Point3d;
    /**
     * Return a point given by fractional positions on the XYZ axes.
     *  Returns undefined if the range is null.
     */
    localXYZToWorld(fractionX: number, fractionY: number, fractionZ: number, result?: Point3d): Point3d | undefined;
    /**
     * Return a point given by fractional positions on the XYZ axes.
     * * Returns undefined if the range is null.
     */
    localToWorld(xyz: XYAndZ, result?: Point3d): Point3d | undefined;
    /**
     * Replace fractional coordinates by world coordinates.
     * @returns false if null range.
     */
    localToWorldArrayInPlace(points: Point3d[]): boolean;
    /**
     * Return fractional coordinates of point within the range.
     * * returns undefined if the range is null.
     * * returns undefined if any direction (x,y,z) has zero length
     */
    worldToLocal(point: Point3d, result?: Point3d): Point3d | undefined;
    /**
     * Return fractional coordinates of point within the range.
     * * returns undefined if the range is null.
     * * returns undefined if any direction (x,y,z) has zero length
     */
    worldToLocalArrayInPlace(point: Point3d[]): boolean;
    /**
     * Return an array with the 8 corners on order wth "x varies fastest, then y, then z"
     * * points preallocated in `result` are reused if result.length >= 8.
     * * in reuse case, result.length is trimmed to 8
     */
    corners(result?: Point3d[]): Point3d[];
    /**
     * Return an array with indices of the corners of a face
     * * face 0 has negative x normal
     * * face 1 has positive x normal
     * * face 2 has negative y normal
     * * face 3 has positive y normal
     * * face 4 has negative z normal
     * * face 5 has positive z normal
     * * Any other value returns face 5
     * * faces are CCW as viewed from outside.
     */
    static faceCornerIndices(index: number): number[];
    /**
     * Return a rectangle that is the cross section as viewed from above (z direction) and at zFraction
     * @param zFraction plane altitude within the 0..1 z fraction range
     * @param upwardNormal true for CCW as viewed from above
     * @param addClosure true to add closure edge back to the start
     * @returns
     */
    rectangleXY(zFraction?: number, upwardNormal?: boolean, addClosure?: boolean): Point3d[] | undefined;
    /** Return the largest absolute value among any coordinates in the box corners. */
    maxAbs(): number;
    /** Returns true if the x direction size is nearly zero */
    get isAlmostZeroX(): boolean;
    /** Returns true if the y direction size is nearly zero */
    get isAlmostZeroY(): boolean;
    /** Returns true if the z direction size is nearly zero */
    get isAlmostZeroZ(): boolean;
    /** Test if a point given as x,y,z is within the range. */
    containsXYZ(x: number, y: number, z: number): boolean;
    /** Test if a point given as x,y is within the range (ignoring z of range). */
    containsXY(x: number, y: number): boolean;
    /** Test if a point is within the range. */
    containsPoint(point: Point3d): boolean;
    /** Test if the x,y coordinates of a point are within the range. */
    containsPointXY(point: Point3d): boolean;
    /** Test of other range is within this range */
    containsRange(other: Range3d): boolean;
    /** Test if there is any intersection with other range */
    intersectsRange(other: Range3d): boolean;
    /** Test if there is any intersection with other range, ignoring z. */
    intersectsRangeXY(other: Range3d): boolean;
    /** Return 0 if the point is within the range, otherwise the distance to the closest face or corner */
    distanceToPoint(point: XYAndZ): number;
    /** Returns 0 if the ranges have any overlap, otherwise the shortest absolute distance from one to the other. */
    distanceToRange(other: Range3d): number;
    /** Expand this range by distances a (possibly signed) in all directions */
    extendXYZ(x: number, y: number, z: number): void;
    /** Expand this range by a point interpolated between given points. */
    extendInterpolated(xyz0: Point3d, fraction: number, xyz1: Point3d): void;
    /** Expand this range by distances a in only the x direction.  */
    extendXOnly(x: number): void;
    /** Expand this range by distances a in only the x direction.  */
    extendYOnly(y: number): void;
    /** Expand this range by distances a in only the x direction.  */
    extendZOnly(z: number): void;
    /** Expand one component of this range  */
    extendSingleAxis(a: number, axisIndex: AxisIndex): void;
    /** Expand this range by distances a (weighted and possibly signed) in all directions */
    extendXYZW(x: number, y: number, z: number, w: number): void;
    /** Expand this range to include a point. */
    extendPoint(point: Point3d, transform?: Transform): void;
    /** Expand this range to include a transformed point. */
    extendTransformedPoint(transform: Transform, point: Point3d): void;
    /** Expand this range to include a range. */
    extendRange(other: LowAndHighXYZ): void;
    /**
     * In each direction look at the difference between this range limit and that of interiorRange.
     * * If this range is larger, expand it by extrapolationFactor.
     */
    extendWhenLarger(other: LowAndHighXYZ, extrapolationFactor: number): void;
    /** Return the intersection of ranges. */
    intersect(other: Range3d, result?: Range3d): Range3d;
    /** Return the union of ranges. */
    union(other: Range3d, result?: Range3d): Range3d;
    /**
     * Move low and high points by scaleFactor around the center point.
     * @param scaleFactor scale factor applied to low, high distance from center.
     */
    scaleAboutCenterInPlace(scaleFactor: number): void;
    /**
     * Move all limits by a fixed amount.
     * * positive delta expands the range size
     * * negative delta reduces the range size
     * * if any dimension reduces below zero size, the whole range becomes null
     * @param delta shift to apply.
     */
    expandInPlace(delta: number): void;
    /** Create a local to world transform from this range. */
    getLocalToWorldTransform(result?: Transform): Transform;
    /**
     * Creates an NPC to world transformation to go from 000...111 to the globally aligned cube with diagonally
     * opposite corners that are the
     * min and max of this range. The diagonal component for any degenerate direction is 1.
     */
    getNpcToWorldRangeTransform(result?: Transform): Transform;
    /**
     * Ensure that the length of each dimension of this Range3d is at least a minimum size. If not, expand
     * to minimum about the center.
     * @param min The minimum length for each dimension.
     */
    ensureMinLengths(min?: number): void;
}
/**
 * Range on a 1d axis
 * * `low` and `high` members are always non-null objects
 * * having `low > high` indicates an empty range.
 * * the range contains x values for which `low <= x <= high`
 * @public
 */
export declare class Range1d extends RangeBase {
    /** Low point coordinates. DO NOT MODIFY FROM OUTSIDE THIS CLASS */
    low: number;
    /** High point coordinates. DO NOT MODIFY FROM OUTSIDE THIS CLASS */
    high: number;
    /** Reset the low and high to null range state. */
    setNull(): void;
    private setDirect;
    private constructor();
    /** Returns true if this and other have equal low and high parts, or both are null ranges. */
    isAlmostEqual(other: Readonly<Range1d>): boolean;
    /** Copy contents from other Range1d. */
    setFrom(other: Range1d): void;
    /**
     * Convert from a JSON object of one of these forms:
     * *  Any array of numbers: `[value,value, value]`
     * *  An object with low and high as properties: `{low:lowValue, high: highValue}`
     */
    setFromJSON(json: Range1dProps): void;
    /** Use `setFromJSON` to parse `json` into a new Range1d instance. */
    static fromJSON<T extends Range1d>(json?: Range1dProps): T;
    /**
     * Convert to a JSON object of form
     * ```
     *    [lowValue,highValue]
     * ```
     */
    toJSON(): Range1dProps;
    /**
     * Return a new Range1d with contents of this.
     * @param result optional result.
     */
    clone(result?: this): this;
    /**
     * Return a new Range1d with contents of this.
     * @param result optional result.
     */
    static createFrom<T extends Range1d>(other: T, result?: T): T;
    /**
     * Create a range with no content.
     * @param result optional result.
     */
    static createNull<T extends Range1d>(result?: T): T;
    /**
     * Create a range with `delta` added to low and high
     * * If `this` is a null range, return a null range.
     */
    cloneTranslated(delta: number, result?: Range1d): Range1d;
    /**
     * Set this range to be a single value.
     * @param x value to use as both low and high.
     */
    setX(x: number): void;
    /** Create a single point box */
    static createX<T extends Range1d>(x: number, result?: T): T;
    /**
     * Set this range to (min(x0,x1), max(x0,x1))
     * @param x0 first value
     * @param x1 second value
     */
    setXXUnordered(x0: number, x1: number): void;
    /** Check if low is 0 and high is 1 */
    get isExact01(): boolean;
    /**
     * Create a box from two values. Values are reversed if needed
     * @param xA first value
     * @param xB second value
     */
    static createXX<T extends Range1d>(xA: number, xB: number, result?: T): T;
    /**
     * Create a box from two values, but null range if the values are reversed
     * @param xA first value
     * @param xB second value
     */
    static createXXOrCorrectToNull<T extends Range1d>(xA: number, xB: number, result?: T): T;
    /**
     * Create a range containing all the values in an array.
     * @param values array of points to be contained in the range.
     * @param result optional result.
     */
    static createArray<T extends Range1d>(values: Float64Array | number[], result?: T): T;
    /** Extend to include an array of values */
    extendArray(values: Float64Array | number[]): void;
    /**
     * Extend to include `values` at indices `beginIndex <= i < endIndex]`
     * @param values array of values
     * @param beginIndex first index to include
     * @param numValue number of values to access
     */
    extendArraySubset(values: Float64Array | number[], beginIndex: number, numValue: number): void;
    /** Test if the box has high<low Note that a range around a single point is NOT null. */
    get isNull(): boolean;
    /** Test of the range contains a single point. */
    get isSinglePoint(): boolean;
    /** Return the length of the range in the x direction */
    length(): number;
    /** Return a point given by fractional positions within the range. This is done with no check for isNull !!! */
    fractionToPoint(fraction: number): number;
    /** Return the largest absolute value among the box limits. */
    maxAbs(): number;
    /** Test if the x direction size is nearly zero */
    get isAlmostZeroLength(): boolean;
    /** Test if a number is within the range. */
    containsX(x: number): boolean;
    /** Test of other range is within this range */
    containsRange(other: Range1d): boolean;
    /** Test if there is any intersection with other range */
    intersectsRange(other: Range1d): boolean;
    /**
     * Intersect this range with a range defined by parameters x0 and x1
     * * For x1 > x0, that range is null, and the intersection is null.
     * * For x0 <= x1, the input is a non-null range.
     * * The intersection range replaces the contents of this.
     */
    intersectRangeXXInPlace(x0: number, x1: number): void;
    /** Returns 0 if the ranges have any overlap, otherwise the shortest absolute distance from one to the other. */
    distanceToRange(other: Range1d): number;
    /** Return 0 if the point is within the range, otherwise the (unsigned) distance to the closest face or corner */
    distanceToX(x: number): number;
    /** Expand this range by a single coordinate */
    extendX(x: number): void;
    /** Expand this range to include a range. */
    extendRange(other: Range1d): void;
    /** Extend only the low limit to x.  Return true if the low limit is changed. */
    extendLow(x: number): boolean;
    /** Extend only the high limit to x.  Return true if the high limit is changed. */
    extendHigh(x: number): boolean;
    /** Return the intersection of ranges. */
    intersect(other: Range1d, result?: Range1d): Range1d;
    /** Return the union of ranges. */
    union(other: Range1d, result?: Range1d): Range1d;
    /**
     * Move low and high points by scaleFactor around the center point.
     * @param scaleFactor scale factor applied to low, high distance from center.
     */
    scaleAboutCenterInPlace(scaleFactor: number): void;
    /**
     * Move all limits by a fixed amount.
     * * positive delta expands the range size
     * * negative delta reduces the range size
     * * if any dimension reduces below zero size, the whole range becomes null
     * @param delta shift to apply.
     */
    expandInPlace(delta: number): void;
    /**
     * Clip this range to a linear half space condition
     * * if `limitA > limitB` the limit space is empty
     *   * make this range null
     *   * return false;
     * * otherwise (i.e `limitA <= limitB`)
     *   * solve `a + u * f = limitA' and `a + u * f = limitA`
     *   * if unable to solve (i.e. u near zero), `a` alone determines whether to (a) leave this interval unchanged or
     * (b) reduce to nothing.
     *   * the `f` values are an interval in the space of this `Range1d`
     *   * restrict the range to that interval (i.e intersect existing (low,high) with the fraction interval.
     *   * return true if the range is non-null after the clip.
     * @param a constant of linear map
     * @param u coefficient of linear map
     * @param limitA crossing value, assumed in range relation with limitB
     * @param limitB crossing value, assumed in range relation with limitB
     * @param limitIsHigh true if the limit is an upper limit on mapped values.
     */
    clipLinearMapToInterval(a: number, u: number, limitA: number, limitB: number): boolean;
}
/**
 * Range box in xy plane
 * @public
 */
export declare class Range2d extends RangeBase implements LowAndHighXY {
    /** Low point coordinates. DO NOT MODIFY FROM OUTSIDE THIS CLASS */
    low: Point2d;
    /** High point coordinates. DO NOT MODIFY FROM OUTSIDE THIS CLASS */
    high: Point2d;
    /** Reset the low and high to null range state. */
    setNull(): void;
    /** Flatten the low and high coordinates of any json object with low.x .. high.y into an array of 4 doubles */
    static toFloat64Array(val: LowAndHighXY): Float64Array;
    /** Flatten the low and high coordinates of this instance into an array of 4 doubles */
    toFloat64Array(): Float64Array;
    /**
     * Construct a Range2d from an array of double-precision values
     * @param f64 the array, which should contain exactly 4 values in this order: lowX, lowY, highX, highY
     * @return a new Range2d object
     */
    static fromFloat64Array<T extends Range2d>(f64: Float64Array): T;
    /**
     * Construct a Range2d from an un-typed array. This mostly useful when interpreting ECSQL query results of
     * the 'blob' type, where you know that that result is a Range3d.
     * @param buffer untyped array
     * @return a new Range2d object
     */
    static fromArrayBuffer<T extends Range2d>(buffer: ArrayBuffer): T;
    constructor(lowX?: number, lowY?: number, highX?: number, highY?: number);
    /** Returns true if this and other have equal low and high parts, or both are null ranges. */
    isAlmostEqual(other: Range2d): boolean;
    /** Copy all content from any `other` that has low and high xy data. */
    setFrom(other: LowAndHighXY): void;
    /** Create a new Range2d from any `other` that has low and high xy data. */
    static createFrom<T extends Range2d>(other: LowAndHighXY, result?: T): T;
    /** Treat any array of numbers as numbers to be inserted !!! */
    setFromJSON(json: Range2dProps): void;
    /** Freeze this instance (and its members) so it is read-only */
    freeze(): Readonly<this>;
    /** Return json array with two points as produced by `Point2d.toJSON` */
    toJSON(): Range2dProps;
    /** Use `setFromJSON` to parse `json` into a new Range2d instance. */
    static fromJSON<T extends Range2d>(json?: Range2dProps): T;
    private setDirect;
    /** Return a clone of this range (or copy to optional result) */
    clone(result?: this): this;
    /** Create a range with no content. */
    static createNull<T extends Range2d>(result?: T): T;
    /** Set low and hight to a single xy value. */
    setXY(x: number, y: number): void;
    /** Create a single point box */
    static createXY<T extends Range2d>(x: number, y: number, result?: T): T;
    /** Create a box with 2 pairs of xy candidates. Theses are compared and shuffled as needed for the box. */
    static createXYXY<T extends Range2d>(xA: number, yA: number, xB: number, yB: number, result?: T): T;
    /** Create a box with 3 pairs of xy candidates. Theses are compared and shuffled as needed for the box. */
    static createXYXYXY<T extends Range2d>(xA: number, yA: number, xB: number, yB: number, xC: number, yC: number, result?: T): T;
    /** Create a box with 2 pairs of xy candidates. If any direction has order flip, create null. */
    static createXYXYOrCorrectToNull<T extends Range2d>(xA: number, yA: number, xB: number, yB: number, result?: T): T;
    /** Create a range around an array of points. */
    static createArray<T extends Range2d>(points: Point2d[], result?: T): T;
    /** Test if the box has high<low for any of x,y, condition. Note that a range around a single point is NOT null. */
    get isNull(): boolean;
    /**
     * Test if the box has high strictly less than low for any of x,y, condition. Note that a range around a
     * single point is NOT null.
     */
    static isNull(range: LowAndHighXY): boolean;
    /** Test of the range contains a single point. */
    get isSinglePoint(): boolean;
    /** Return the midpoint of the diagonal.  No test for null range. */
    get center(): Point2d;
    /** Return the low x coordinate */
    get xLow(): number;
    /** Return the low y coordinate */
    get yLow(): number;
    /** Return the high x coordinate */
    get xHigh(): number;
    /** Return the high y coordinate */
    get yHigh(): number;
    /** Length of the box in the x direction */
    xLength(): number;
    /** Length of the box in the y direction */
    yLength(): number;
    /**
     * Return the diagonal vector. There is no check for isNull -- if the range isNull(), the vector will have very
     * large negative coordinates.
     */
    diagonal(result?: Vector2d): Vector2d;
    /**
     * Return the point at the specified fraction along the diagonal vector. There is no check for isNull -- if the
     * range isNull(), the vector will have very large negative coordinates.
     */
    diagonalFractionToPoint(fraction: number, result?: Point2d): Point2d;
    /** Return a point given by fractional positions on the XY axes. This is done with no check for isNull !!! */
    fractionToPoint(fractionX: number, fractionY: number, result?: Point2d): Point2d;
    /**
     * Return an array with the 4 corners.
     * * if asLoop is false, 4 corners are "x varies fastest, then y"
     * * if asLoop is true, 5 corners are in CCW order WITH CLOSURE
     */
    corners3d(asLoop?: boolean, z?: number): Point3d[];
    /** Largest absolute value among any coordinates in the box corners. */
    maxAbs(): number;
    /** Test if the x direction size is nearly zero */
    get isAlmostZeroX(): boolean;
    /** Test if the y direction size is nearly zero */
    get isAlmostZeroY(): boolean;
    /** Test if a point given as x,y is within the range */
    containsXY(x: number, y: number): boolean;
    /** Test if a point is within the range. */
    containsPoint(point: XAndY): boolean;
    /** Test of other range is within this range */
    containsRange(other: LowAndHighXY): boolean;
    /** Test if there is any intersection with other range */
    intersectsRange(other: LowAndHighXY): boolean;
    /** Return 0 if the point is within the range, otherwise the distance to the closest face or corner */
    distanceToPoint(point: XAndY): number;
    /** Return 0 if the point is within the range, otherwise the distance to the closest face or corner */
    distanceToRange(other: LowAndHighXY): number;
    /** Expand this range to include a point given by x,y */
    extendXY(x: number, y: number): void;
    /** Expand this range to include a point given by x,y */
    extendTransformedXY(transform: Transform, x: number, y: number): void;
    /** Expand this range to include a point. */
    extendPoint(point: XAndY): void;
    /** Expand this range to include a range. */
    extendRange(other: LowAndHighXY): void;
    /** Return the intersection of ranges. */
    intersect(other: LowAndHighXY, result?: Range2d): Range2d;
    /** Return the union of ranges. */
    union(other: LowAndHighXY, result?: Range2d): Range2d;
    /**
     * Move low and high points by scaleFactor around the center point.
     * @param scaleFactor scale factor applied to low, high distance from center.
     */
    scaleAboutCenterInPlace(scaleFactor: number): void;
    /**
     * Move all limits by a fixed amount.
     * * positive delta expands the range size
     * * negative delta reduces the range size
     * * if any dimension reduces below zero size, the whole range becomes null
     * @param delta shift to apply.
     */
    expandInPlace(delta: number): void;
    /**
     * Return fractional coordinates of point within the range.
     * * returns undefined if the range is null.
     * * returns undefined if any direction (x,y) has zero length
     */
    worldToLocal(point: Point2d, result?: Point2d): Point2d | undefined;
}
