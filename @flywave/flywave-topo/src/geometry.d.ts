import { type AngleSweep } from "./geometry3d/angle-sweep";
import { type Point2d, type XY, Vector2d } from "./geometry3d/point2d-vector2d";
import { type Point3d, type XYZ, Vector3d } from "./geometry3d/point3d-vector3d";
import { type XAndY } from "./geometry3d/xyz-props";
import { type Point4d } from "./geometry4d/point4d";
/**
 * Enumeration of the 6 possible orderings of XYZ axis order
 * * **Note:** There are 3 axis order with right hand system (XYZ = 0, YZX = 1, ZXY = 2) and 3 axis order with
 * left hand system (XZY = 4, YXZ = 5, ZYX = 6). Note that `AxisOrder` is encoding the handedness as well. Cross
 * product of the i_th axis in an ordering (i=0,1,2), with the i+1_th in that ordering, will produce the i+2_th
 * axis in that ordering.
 * @public
 */
export declare enum AxisOrder {
    /** Right handed system, X then Y then Z */
    XYZ = 0,
    /** Right handed system, Y then Z then X */
    YZX = 1,
    /** Right handed system, Z then X then Y */
    ZXY = 2,
    /** Left handed system, X then Z then Y */
    XZY = 4,
    /** Left handed system, Y then X then Z */
    YXZ = 5,
    /** Left handed system, Z then Y then X */
    ZYX = 6
}
/**
 * Enumeration of numeric indices of 3 axes AxisIndex.X, AxisIndex.Y, AxisIndex.Z
 * @public
 */
export declare enum AxisIndex {
    /** x axis is index 0 */
    X = 0,
    /** y axis is index 1 */
    Y = 1,
    /** 2 axis is index 2 */
    Z = 2
}
/**
 * Standard views. Used in `Matrix3d.createStandardViewAxes(index: StandardViewIndex, invert: boolean)`
 * @public
 */
export declare enum StandardViewIndex {
    /** X to right, Y up */
    Top = 1,
    /** X to right, negative Y up */
    Bottom = 2,
    /** Negative Y to right, Z up */
    Left = 3,
    /** Y to right, Z up */
    Right = 4,
    /** X to right, Z up */
    Front = 5,
    /** Negative X to right, Z up */
    Back = 6,
    /** Isometric: view towards origin from (-1,-1,1) */
    Iso = 7,//
    /** Right isometric: view towards origin from (1,-1,1) */
    RightIso = 8
}
/**
 * Enumeration among choice for how a coordinate transformation should incorporate scaling.
 * @public
 */
export declare enum AxisScaleSelect {
    /** All axes of unit length. */
    Unit = 0,
    /** On each axis, the vector length matches the longest side of the range of the data. */
    LongestRangeDirection = 1,
    /** On each axis, the vector length matches he length of the corresponding edge of the range. */
    NonUniformRangeContainment = 2
}
/**
 * Object with a radians value and its associated cosine and sine values.
 * @public
 */
export interface TrigValues {
    /** The cosine value */
    c: number;
    /** The sine value */
    s: number;
    /** The radians value */
    radians: number;
}
/**
 * Plane Evaluation methods.
 * * These provide the necessary queries to implement clipping operations without knowing if the plane in use
 * is a [[ClipPlane]], [[Plane3dByOriginAndUnitNormal]], [[Plane3dByOriginAndVectors]], [[Point4d]].
 * * The Plane3d class declares obligation to implement these methods, and
 * passes the obligation on to concrete implementations by declaring them as abstract members which the particular classes can implement.
 * * It is intended that this interface be deprecated because its implementation by [[Plane3d]] provides all of its functionality and allows more to be added.
 * @public
 */
export interface PlaneAltitudeEvaluator {
    /**
     * Return the altitude of the `point` from the plane.
     * @param point the point for evaluation
     */
    altitude(point: Point3d): number;
    /**
     * Return the altitude of the `point` from the plane, with the point supplied as simple x,y,z
     * @param x x coordinate of the point
     * @param y y coordinate of the point
     * @param z z coordinate of the point
     */
    altitudeXYZ(x: number, y: number, z: number): number;
    /**
     * Return the derivative of altitude with respect to motion along a `vector`.
     * @param vector the vector
     */
    velocity(vector: Vector3d): number;
    /**
     * Return the derivative of altitude with respect to motion along a `vector` given by components.
     * @param x x coordinate of the vector
     * @param y y coordinate of the vector
     * @param z z coordinate of the vector
     */
    velocityXYZ(x: number, y: number, z: number): number;
    /**
     * Return the weighted altitude
     * @param point xyzw data.
     */
    weightedAltitude(point: Point4d): number;
    /** x part of normal vector */
    normalX(): number;
    /** x part of normal vector */
    normalY(): number;
    /** x part of normal vector */
    normalZ(): number;
}
/**
 * Enumeration of possible locations of a point in the plane of a polygon.
 * @public
 */
export declare enum PolygonLocation {
    /** No location specified. */
    Unknown = 0,
    /** Point is at a vertex. */
    OnPolygonVertex = 1,
    /** Point is on an edge (but not a vertex). */
    OnPolygonEdgeInterior = 2,
    /** Point is strictly inside the polygon with unknown projection. */
    InsidePolygon = 3,
    /** Point is strictly inside the polygon and projects to a vertex. */
    InsidePolygonProjectsToVertex = 4,
    /** Point is strictly inside the polygon and projects to an edge (but not a vertex). */
    InsidePolygonProjectsToEdgeInterior = 5,
    /** Point is strictly outside the polygon with unknown projection. */
    OutsidePolygon = 6,
    /** Point is strictly outside the polygon and projects to a vertex. */
    OutsidePolygonProjectsToVertex = 7,
    /** Point is strictly outside the polygon and projects to an edge (but not a vertex). */
    OutsidePolygonProjectsToEdgeInterior = 8
}
/**
 * Interface for `toJSON` and `setFromJSON` methods
 * @public
 */
export interface BeJSONFunctions {
    /**
     * Set content from a JSON object.
     * If the json object is undefined or unrecognized, always set a default value.
     */
    setFromJSON(json: any): void;
    /** Return a json object with this object's contents. */
    toJSON(): any;
}
/**
 * The properties for a JSON representation of an `Angle`.
 * * If AngleProps data is a number, it is in **degrees**.
 * * If AngleProps data is an object, it can have either degrees or radians.
 * @public
 */
export type AngleProps = {
    degrees: number;
} | {
    radians: number;
} | {
    _radians: number;
} | {
    _degrees: number;
} | number;
/**
 * The properties for a JSON representation of an `AngleSweep`.
 * * The json data is always *start* and *end* angles as a pair in an array.
 * * If AngleSweepProps data is an array of two numbers, those are both angles in `degrees`.
 * * If AngleSweepProps data is an object with key `degrees`, then the corresponding value must be an array of
 * two numbers, the start and end angles in degrees.
 * * If the AngleSweepProps is an object with key `radians`, then the corresponding value must be an array of
 * two numbers, the start and end angles in radians.
 * @public
 */
export type AngleSweepProps = AngleSweep | {
    degrees: [number, number];
} | {
    radians: [number, number];
} | [number, number];
/**
 * Interface for method with a clone operation.
 * @public
 */
export interface Cloneable<T> {
    /** Required method to return a deep clone. */
    clone(): T | undefined;
}
/** Options used for methods like [[Vector2d.isPerpendicularTo]] and [[Vector3d.isParallelTo]].
 * @public
 */
export interface PerpParallelOptions {
    /**
     * Squared radian tolerance for comparing the angle between two vectors.
     * Default: [[Geometry.smallAngleRadiansSquared]].
     */
    radianSquaredTol?: number;
    /**
     * Squared distance tolerance for detecting a zero-length vector.
     * Default: [[Geometry.smallMetricDistanceSquared]].
     */
    distanceSquaredTol?: number;
}
/**
 * Class containing static methods for typical numeric operations.
 * * Experimentally, methods like Geometry.hypotenuse are observed to be faster than the system intrinsics.
 * * This is probably due to
 *    * Fixed length arg lists
 *    * strongly typed parameters
 * @public
 */
export declare class Geometry {
    /** Tolerance for small distances in metric coordinates. */
    static readonly smallMetricDistance = 0.000001;
    /** Square of `smallMetricDistance`. */
    static readonly smallMetricDistanceSquared = 1e-12;
    /** Tolerance for small angle measured in radians. */
    static readonly smallAngleRadians = 1e-12;
    /** Square of `smallAngleRadians`. */
    static readonly smallAngleRadiansSquared = 1e-24;
    /** Tolerance for small angle measured in degrees. */
    static readonly smallAngleDegrees = 5.7e-11;
    /** Tolerance for small angle measured in arc-seconds. */
    static readonly smallAngleSeconds = 2e-7;
    /** Numeric value that may be considered zero for fractions between 0 and 1. */
    static readonly smallFraction = 1e-10;
    /** Tight tolerance near machine precision (unitless). Useful for snapping values, e.g., to 0 or 1. */
    static readonly smallFloatingPoint = 1e-15;
    /** Radians value for full circle 2PI radians minus `smallAngleRadians`. */
    static readonly fullCircleRadiansMinusSmallAngle: number;
    /**
     * Numeric value that may be considered large for a ratio of numbers.
     * * Note that the allowed result value is vastly larger than 1.
     */
    static readonly largeFractionResult = 10000000000;
    /**
     * Numeric value that may considered large for numbers expected to be coordinates.
     * * This allows larger results than `largeFractionResult`.
     */
    static readonly largeCoordinateResult = 10000000000000;
    /**
     * Numeric value that may considered infinite for metric coordinates.
     * @deprecated in 4.x. Use `largeCoordinateResult`.
     * * This coordinate should be used only as a placeholder indicating "at infinity" -- computing actual
     * points at this coordinate invites numerical problems.
     */
    static readonly hugeCoordinate = 1000000000000;
    /** Test if absolute value of x is large (larger than `Geometry.largeCoordinateResult`) */
    static isLargeCoordinateResult(x: number): boolean;
    /**
     * Test if absolute value of x is large (larger than `Geometry.largeCoordinateResult`).
     * @deprecated in 4.x. Use `isLargeCoordinateResult`.
     */
    static isHugeCoordinate(x: number): boolean;
    /** Test if a number is odd */
    static isOdd(x: number): boolean;
    /**
     * Correct distance to zero.
     * * If `distance` magnitude is `undefined` or smaller than `smallMetricDistance`, then return `replacement`
     * (or 0 if replacement is not passed). Otherwise return `distance`.
     */
    static correctSmallMetricDistance(distance: number | undefined, replacement?: number): number;
    /**
     * Correct `fraction` to `replacement` if `fraction` is undefined or too small.
     * @param fraction number to test
     * @param replacement value to return if `fraction` is too small
     * @returns `fraction` if its absolute value is at least `Geometry.smallFraction`; otherwise returns `replacement`
     */
    static correctSmallFraction(fraction: number | undefined, replacement?: number): number;
    /**
     * Return the inverse of `distance`.
     * * If `distance` magnitude is smaller than `smallMetricDistance` (i.e. distance is large enough for safe division),
     * then return `1/distance`. Otherwise return `undefined`.
     */
    static inverseMetricDistance(distance: number): number | undefined;
    /**
     * Return the inverse of `distanceSquared`.
     * * If `distanceSquared ` magnitude is smaller than `smallMetricDistanceSquared` (i.e. distanceSquared  is large
     * enough for safe division), then return `1/distanceSquared `. Otherwise return `undefined`.
     */
    static inverseMetricDistanceSquared(distanceSquared: number): number | undefined;
    /**
     * Boolean test for metric coordinate near-equality (i.e., if `x` and `y` are almost equal) using `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSameCoordinate(x: number, y: number, tolerance?: number): boolean;
    /**
     * Boolean test for metric coordinate near-equality (i.e., if `x` and `y` are almost equal) using
     * `tolerance = toleranceFactor * smallMetricDistance`
     * */
    static isSameCoordinateWithToleranceFactor(x: number, y: number, toleranceFactor: number): boolean;
    /**
     * Boolean test for metric coordinate pair near-equality (i.e., if `x0` and `x1` are almost equal
     * and `y0` and `y1` are almost equal) using `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSameCoordinateXY(x0: number, y0: number, x1: number, y1: number, tolerance?: number): boolean;
    /**
     * Boolean test for squared metric coordinate near-equality (i.e., if `sqrt(x)` and `sqrt(y)` are
     * almost equal) using `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSameCoordinateSquared(x: number, y: number, tolerance?: number): boolean;
    /**
     * Boolean test for small `dataA.distance(dataB)` within `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSamePoint3d(dataA: Point3d, dataB: Point3d, tolerance?: number): boolean;
    /**
     * Boolean test for small xyz-distance within `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     * * Note that Point3d and Vector3d are both derived from XYZ, so this method tolerates mixed types.
     */
    static isSameXYZ(dataA: XYZ, dataB: XYZ, tolerance?: number): boolean;
    /**
     * Boolean test for small xy-distance (ignoring z) within `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSamePoint3dXY(dataA: Point3d, dataB: Point3d, tolerance?: number): boolean;
    /**
     * Boolean test for small xyz-distance within `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSameVector3d(dataA: Vector3d, dataB: Vector3d, tolerance?: number): boolean;
    /**
     * Boolean test for small xy-distance within `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSamePoint2d(dataA: Point2d, dataB: Point2d, tolerance?: number): boolean;
    /**
     * Boolean test for small xy-distance within `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isSameVector2d(dataA: Vector2d, dataB: Vector2d, tolerance?: number): boolean;
    /**
     * Lexical comparison of (a.x, a.y) and (b.x, b.y) with x as first test and y as second (z is ignored).
     * * This is appropriate for a horizontal sweep in the plane.
     */
    static lexicalXYLessThan(a: XY | XYZ, b: XY | XYZ): -1 | 0 | 1;
    /**
     * Lexical comparison of (a.x, a.y) and (b.x, b.y) with y as first test and x as second (z is ignored).
     * * This is appropriate for a vertical sweep in the plane.
     */
    static lexicalYXLessThan(a: XY | XYZ, b: XY | XYZ): -1 | 0 | 1;
    /** Lexical comparison of (a.x, a.y, a.z) and (b.x, b.y, b.z) with x as first test, y as second, and z as third. */
    static lexicalXYZLessThan(a: XYZ, b: XYZ): -1 | 0 | 1;
    /**
     * Test if `value` is small compared to `smallFraction`.
     * * This is appropriate if `value` is know to be a typical 0..1 fraction.
     */
    static isSmallRelative(value: number): boolean;
    /** Test if `value` is small compared to `smallAngleRadians` */
    static isSmallAngleRadians(value: number): boolean;
    /**
     * Returns `true` if both values are `undefined` or if both are defined and almost equal within tolerance.
     * If one is `undefined` and the other is not, then `false` is returned.
     */
    static isAlmostEqualOptional(a: number | undefined, b: number | undefined, tolerance: number): boolean;
    /**
     * Toleranced equality test using tolerance `tolerance * ( 1 + abs(a) + abs(b) )`.
     * * `Geometry.smallAngleRadians` is used if tolerance is `undefined`.
     */
    static isAlmostEqualNumber(a: number, b: number, tolerance?: number): boolean;
    /**
     * Toleranced equality test using tolerance `tolerance * ( 1 + abs(a.x) + abs(a.y) + abs(b.x) + abs(b.y) )`.
     * * `Geometry.smallAngleRadians` is used if tolerance is `undefined`.
     */
    static isAlmostEqualXAndY(a: XAndY, b: XAndY, tolerance?: number): boolean;
    /**
     * Toleranced equality test using caller-supplied `tolerance`.
     * * `Geometry.smallMetricDistance` is used if tolerance is `undefined`.
     */
    static isDistanceWithinTol(distance: number, tolerance?: number): boolean;
    /** Toleranced equality test using `smallMetricDistance` tolerance. */
    static isSmallMetricDistance(distance: number): boolean;
    /** Toleranced equality test using `smallMetricDistanceSquared` tolerance. */
    static isSmallMetricDistanceSquared(distanceSquared: number): boolean;
    /**
     * Return `axis modulo 3` with proper handling of negative indices
     * ..., -3:x, -2:y, -1:z, 0:x, 1:y, 2:z, 3:x, 4:y, 5:z, 6:x, 7:y, 8:z, ...
     */
    static cyclic3dAxis(axis: number): number;
    /**
     * Return the `AxisOrder` for which `axisIndex` is the first named axis.
     * * `axisIndex === 0` returns `AxisOrder.XYZ`
     * * `axisIndex === 1` returns `AxisOrder.YZX`
     * * `axisIndex === 2` returns `AxisOrder.ZXY`
     */
    static axisIndexToRightHandedAxisOrder(axisIndex: AxisIndex): AxisOrder;
    /** Return the largest signed value among `a`, `b`, and `c` */
    static maxXYZ(a: number, b: number, c: number): number;
    /** Return the smallest signed value among `a`, `b`, and `c` */
    static minXYZ(a: number, b: number, c: number): number;
    /** Return the largest signed value among `a` and `b` */
    static maxXY(a: number, b: number): number;
    /** Return the smallest signed value among `a` and `b` */
    static minXY(a: number, b: number): number;
    /** Return the largest absolute value among `x`, `y`, and `z` */
    static maxAbsXYZ(x: number, y: number, z: number): number;
    /** Return the largest absolute value among `x` and `y` */
    static maxAbsXY(x: number, y: number): number;
    /** Return the largest absolute distance from `a` to either of `b0` or `b1` */
    static maxAbsDiff(a: number, b0: number, b1: number): number;
    /**
     * Examine the sign of `x`.
     * * If `x` is negative, return `outNegative`
     * * If `x` is true zero, return `outZero`
     * * If `x` is positive, return `outPositive`
     */
    static split3WaySign(x: number, outNegative: number, outZero: number, outPositive: number): number;
    /**
     * Examine the value (particularly sign) of x.
     * * If x is negative, return -1
     * * If x is true zero, return 0
     * * If x is positive, return 1
     */
    static split3Way01(x: number, tolerance?: number): -1 | 0 | 1;
    /** Return the square of x */
    static square(x: number): number;
    /**
     * Return the hypotenuse (i.e., `sqrt(x*x + y*y)`).
     * * This is much faster than `Math.hypot(x,y)`.
     */
    static hypotenuseXY(x: number, y: number): number;
    /** Return the squared hypotenuse (i.e., `x*x + y*y`). */
    static hypotenuseSquaredXY(x: number, y: number): number;
    /**
     * Return the hypotenuse (i.e., `sqrt(x*x + y*y + z*z)`).
     * * This is much faster than `Math.hypot(x,y,z)`.
     */
    static hypotenuseXYZ(x: number, y: number, z: number): number;
    /** Return the squared hypotenuse (i.e., `x*x + y*y + z*z`). */
    static hypotenuseSquaredXYZ(x: number, y: number, z: number): number;
    /**
     * Return the full 4d hypotenuse (i.e., `sqrt(x*x + y*y + z*z + w*w)`).
     * * This is much faster than `Math.hypot(x,y,z,w)`.
     */
    static hypotenuseXYZW(x: number, y: number, z: number, w: number): number;
    /** Return the squared hypotenuse (i.e., `x*x + y*y + z*z + w*w`). */
    static hypotenuseSquaredXYZW(x: number, y: number, z: number, w: number): number;
    /**
     * Return the distance between xy points given as numbers.
     * @param x0 x coordinate of point 0
     * @param y0 y coordinate of point 0
     * @param x1 x coordinate of point 1
     * @param y1 y coordinate of point 1
     */
    static distanceXYXY(x0: number, y0: number, x1: number, y1: number): number;
    /**
     * Return the distance between xyz points given as numbers.
     * @param x0 x coordinate of point 0
     * @param y0 y coordinate of point 0
     * @param z0 z coordinate of point 0
     * @param x1 x coordinate of point 1
     * @param y1 y coordinate of point 1
     * @param z1 z coordinate of point 1
     */
    static distanceXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number;
    /**
     * Returns the triple product of 3 vectors provided as x,y,z number sequences.
     * * The triple product is the determinant of the 3x3 matrix with the 9 numbers (3 vectors placed in 3 rows).
     * * The triple product is positive if the 3 vectors form a right handed coordinate system.
     * * The triple product is negative if the 3 vectors form a left handed coordinate system.
     * * Treating the 9 numbers as 3 vectors U, V, W, any of these formulas gives the same result:
     *     * U dot (V cross W)
     *     * V dot (W cross U)
     *     * W dot (U cross V)
     *     * -U dot (W cross V)
     *     * -V dot (U cross W)
     *     * -W dot (V cross U)
     * * Note the negative in the last 3 formulas. Reversing cross product order changes the sign.
     * * The triple product is 6 times the (signed) volume of the tetrahedron with the three vectors as edges from a
     * common vertex.
     */
    static tripleProduct(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, wx: number, wy: number, wz: number): number;
    /** Returns the determinant of the 4x4 matrix unrolled as the 16 parameters */
    static determinant4x4(xx: number, xy: number, xz: number, xw: number, yx: number, yy: number, yz: number, yw: number, zx: number, zy: number, zz: number, zw: number, wx: number, wy: number, wz: number, ww: number): number;
    /**
     * Returns the determinant of 3x3 matrix with first and second rows created from the 3 xy points and the third
     * row created from the 3 numbers:
     *      [columnA.x   columnB.x   columnC.x]
     *      [columnA.y   columnB.y   columnC.y]
     *      [ weightA     weightB     weightC ]
     */
    static tripleProductXYW(columnA: XAndY, weightA: number, columnB: XAndY, weightB: number, columnC: XAndY, weightC: number): number;
    /**
     * Returns the determinant of 3x3 matrix columns created by the given `Point4d` ignoring the z part:
     *      [columnA.x   columnB.x   columnC.x]
     *      [columnA.y   columnB.y   columnC.y]
     *      [columnA.w   columnB.w   columnC.w]
     */
    static tripleProductPoint4dXYW(columnA: Point4d, columnB: Point4d, columnC: Point4d): number;
    /** 2D cross product of vectors with the vectors presented as numbers. */
    static crossProductXYXY(ux: number, uy: number, vx: number, vy: number): number;
    /** 3D cross product of vectors with the vectors presented as numbers. */
    static crossProductXYZXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Vector3d): Vector3d;
    /** Magnitude of 3D cross product of vectors with the vectors presented as numbers. */
    static crossProductMagnitude(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
    /** 2D dot product of vectors with the vectors presented as numbers. */
    static dotProductXYXY(ux: number, uy: number, vx: number, vy: number): number;
    /** 3D dot product of vectors with the vectors presented as numbers. */
    static dotProductXYZXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
    /**
     * Return the mean curvature for two radii.
     * * Curvature is the reciprocal of radius.
     * * 0 radius implies 0 curvature.
     * @param r0 first radius
     * @param r1 second radius
     */
    static meanCurvatureOfRadii(r0: number, r1: number): number;
    /**
     * Returns curvature from the first and second derivative vectors.
     * * If U is the first derivative and V is the second derivative, the curvature is defined as:
     *     * `|| U x V || / || U ||^3`.
     * * Math details can be found at https://en.wikipedia.org/wiki/Curvature#General_expressions
     * @param ux first derivative x component
     * @param uy first derivative y component
     * @param uz first derivative z component
     * @param vx second derivative x component
     * @param vy second derivative y component
     * @param vz second derivative z component
     */
    static curvatureMagnitude(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
    /**
     * Clamp to (min(a,b), max(a,b)).
     * * Always returns a number between `a` and `b`.
     * @param value value to clamp
     * @param a smallest allowed output if `a < b` or largest allowed output if `a > b`
     * @param b largest allowed output if `a < b` or smallest allowed output if `a > b`
     */
    static clampToStartEnd(value: number, a: number, b: number): number;
    /**
     * Clamp value to (min, max) with no test for order of (min, max).
     * * Always returns a number between `min` and `max`.
     * @param value value to clamp
     * @param min smallest allowed output
     * @param max largest allowed output
     */
    static clamp(value: number, min: number, max: number): number;
    /** If given a `value`, return it. If given `undefined`, return `defaultValue`. */
    static resolveNumber(value: number | undefined, defaultValue?: number): number;
    /** If given a `value`, return it. If given `undefined`, return `defaultValue`. */
    static resolveValue<T>(value: T | undefined, defaultValue: T): T;
    /** If given `value` matches the `targetValue`, return `undefined`. Otherwise return the `value`. */
    static resolveToUndefined<T>(value: T | undefined, targetValue: T): T | undefined;
    /**
     * Simple interpolation between values `a` and `b` with fraction `f`.
     * * If `f = 0`, then `a` is returned and if `f = 1`, then `b` is returned.
     * * For maximum accuracy, we choose `a` or `b` as starting point based on fraction `f`.
     */
    static interpolate(a: number, f: number, b: number): number;
    /**
     * Given an `axisOrder` (e.g. XYZ, YZX, etc) and an `index`, return the `axis` at the given index.
     * * For example, if `axisOrder = XYZ`, then for index 0 return `X` (or axis 0), for index 1 return
     * `Y` (or axis 1), and for index 2 return `Z` (or axis 2).
     * * Another example: if `axisOrder = ZXY`, then for index 0 return `Z` (or axis 2), for index 1 return
     * `X` (or axis 0), and for index 2 return `Y` (or axis 1).
     * * For indexes greater than 2 or smaller than 0, it return cyclic axis. See [[Geometry.cyclic3dAxis]]
     * for more info.
     */
    static axisOrderToAxis(order: AxisOrder, index: number): number;
    /**
     * Return `a` modulo `period`.
     * * Both `a` and `period` can be negative.
     * * This function can be faster than the `%` operator for the common case when `p > 0` and `-p < a < 2p`.
     */
    static modulo(a: number, period: number): number;
    /** Return 0 if the value is `undefined` and 1 if the value is defined. */
    static defined01(value: any): number;
    /**
     * Return `numerator` divided by `denominator`.
     * @param numerator the numerator
     * @param denominator the denominator
     * @returns return `numerator/denominator` but if the ratio exceeds `Geometry.largeFractionResult`,
     * return `undefined`.
     */
    static conditionalDivideFraction(numerator: number, denominator: number): number | undefined;
    /**
     * Return `numerator` divided by `denominator`.
     * @param numerator the numerator
     * @param denominator the denominator
     * @returns return `numerator/denominator` but if the ratio exceeds `Geometry.largeFractionResult`,
     * return `defaultResult`.
     */
    static safeDivideFraction(numerator: number, denominator: number, defaultResult: number): number;
    /**
     * Return `numerator` divided by `denominator` (with a given `largestResult`).
     * @param numerator the numerator
     * @param denominator the denominator
     * @param largestResult the ratio threshold
     * @returns return `numerator/denominator` but if the ratio exceeds `largestResult`, return `undefined`.
     */
    static conditionalDivideCoordinate(numerator: number, denominator: number, largestResult?: number): number | undefined;
    /**
     * Return solution(s) of equation `constCoff + cosCoff*c + sinCoff*s = 0` for `c` and `s` with the
     * constraint `c*c + s*s = 1`.
     * * There could be 0, 1, or 2 solutions. Return `undefined` if there is no solution.
     */
    static solveTrigForm(constCoff: number, cosCoff: number, sinCoff: number): Vector2d[] | undefined;
    /**
     * For a line `f(x)` where `f(x0) = f0` and `f(x1) = f1`, return the `x` value at which `f(x) = fTarget`.
     * Return `defaultResult` if `(fTarget - f0) / (f1 - f0)` exceeds `Geometry.largeFractionResult`.
     */
    static inverseInterpolate(x0: number, f0: number, x1: number, f1: number, fTarget?: number, defaultResult?: number): number | undefined;
    /**
     * For a line `f(x)` where `f(0) = f0` and `f(1) = f1`, return the `x` value at which `f(x) = fTarget`
     * Return `undefined` if `(fTarget - f0) / (f1 - f0)` exceeds `Geometry.largeFractionResult`
     */
    static inverseInterpolate01(f0: number, f1: number, fTarget?: number): number | undefined;
    /**
     * Return `true` if `json` is an array with at least `minEntries` entries and all entries are numbers (including
     * those beyond minEntries).
     */
    static isNumberArray(json: any, minEntries?: number): json is number[];
    /**
     * Return `true` if `json` is an array of at least `minArrays` arrays with at least `minEntries` entries in
     * each array and all entries are numbers (including those beyond minEntries).
     */
    static isArrayOfNumberArray(json: any, minArrays: number, minEntries?: number): json is number[][];
    /**
     * Return the number of steps to take so that `numSteps * stepSize >= total`.
     * * `minCount` is returned in the following 3 cases:
     *   * (a) `stepSize <= 0`
     *   * (b) `stepSize >= total`
     *   * (b) `numSteps < minCount`
     * * `maxCount` is returned if `numSteps > maxCount`.
     */
    static stepCount(stepSize: number, total: number, minCount?: number, maxCount?: number): number;
    /**
     * Test if `x` is in the interval [0,1] (but skip the test if `apply01 = false`).
     * * This odd behavior is very convenient for code that sometimes does not do the filtering.
     * @param x value to test.
     * @param apply01 if false, return `true` for all values of `x`.
     */
    static isIn01(x: number, apply01?: boolean): boolean;
    /**
     * Test if `x` is in the interval [0,1] for a given positive `tolerance`.
     * * Make sure to pass a positive `tolerance` because there is no check for that in the code.
     * @param x value to test.
     * @param tolerance the tolerance.
     */
    static isIn01WithTolerance(x: number, tolerance: number): boolean;
    /**
     * Restrict x so it is in the interval `[a,b]` (allowing `a` and `b` to be in either order).
     * @param x value to restrict
     * @param a (usually the lower) interval limit
     * @param b (usually the upper) interval limit
     */
    static restrictToInterval(x: number, a: number, b: number): number;
    /**
     * Case-insensitive string comparison.
     * * Return `true` if the `toUpperCase` values of `string1` and `string2` match.
     */
    static equalStringNoCase(string1: string, string2: string): boolean;
    /**
     * Test for exact match of two number arrays.
     * Returns `true` if both arrays have the same length and entries, or if both arrays are empty or `undefined`.
     */
    static exactEqualNumberArrays(a: number[] | undefined, b: number[] | undefined): boolean;
    /**
     * Test for match of two arrays of type `T`.
     * Returns `true` if both arrays have the same length and have the same entries (or both are empty arrays).
     */
    static almostEqualArrays<T>(a: T[] | undefined, b: T[] | undefined, testFunction: (p: T, q: T) => boolean): boolean;
    /**
     * Test for match of two arrays of type number or Float64Array.
     * Returns `true` if both arrays have the same length and have the same entries (or both are empty arrays).
     */
    static almostEqualNumberArrays(a: number[] | Float64Array | undefined, b: number[] | Float64Array | undefined, testFunction: (p: number, q: number) => boolean): boolean;
    /**
     * Test for match of two values of type `T`.
     * @param a first value
     * @param b second value
     * @param resultIfBothUndefined returned value when both are `undefined`
     * @returns `true` if both values are defined and equal (with ===) and `false` if both values are defined
     * but not equal or if one is defined and the other undefined.
     */
    static areEqualAllowUndefined<T>(a: T | undefined, b: T | undefined, resultIfBothUndefined?: boolean): boolean;
    /**
     * Clone an array whose members have type `T`, which implements the clone method.
     * * If the clone method returns `undefined`, then `undefined` is forced into the cloned array.
     */
    static cloneMembers<T extends Cloneable<T>>(array: T[] | undefined): T[] | undefined;
}
