import { type BeJSONFunctions, type PlaneAltitudeEvaluator } from "../geometry";
import { Plane3d } from "../geometry3d/plane3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Ray3d } from "../geometry3d/ray3d";
import { type XAndY, type XYAndZ } from "../geometry3d/xyz-props";
/**
 * 4d point packed in an array of 4 numbers.
 * @public
 */
export type Point4dProps = number[];
/** 4 Dimensional point (x,y,z,w) used in perspective calculations.
 * * the coordinates are stored in a Float64Array of length 4.
 * * properties `x`, `y`, `z`, `w` access array members.
 * *
 * * The coordinates are physically stored as a single Float64Array with 4 entries. (w last)
 * *
 * @public
 */
export declare class Point4d extends Plane3d implements BeJSONFunctions {
    /** x,y,z,w are packed into a Float64Array */
    xyzw: Float64Array;
    /** Set x,y,z,w of this point.  */
    set(x?: number, y?: number, z?: number, w?: number): this;
    /** Set a component by index.
     * * No change if index is out of range.
     */
    setComponent(index: number, value: number): void;
    /** The x component. */
    get x(): number;
    set x(val: number);
    /** The y component. */
    get y(): number;
    set y(val: number);
    /** The z component. */
    get z(): number;
    set z(val: number);
    /** The w component of this point. */
    get w(): number;
    set w(val: number);
    /** Construct from coordinates. */
    protected constructor(x?: number, y?: number, z?: number, w?: number);
    /** Return a Point4d with specified x,y,z,w */
    static create(x?: number, y?: number, z?: number, w?: number, result?: Point4d): Point4d;
    /**
     * Create a "Point4d as a plane" from "any" other [[PlaneAltitudeEvaluator]] type.
     * @param source
     * @returns
     */
    static createPlaneFrom(source: PlaneAltitudeEvaluator): Point4d | undefined;
    /** Copy coordinates from `other`. */
    setFrom(other: Point4d): this;
    /** Clone this point */
    clone(result?: Point4d): Point4d;
    /** Set this point's xyzw from a json array `[x,y,z,w]` */
    setFromJSON(json?: Point4dProps): void;
    /** Create a new point with coordinates from a json array `[x,y,z,w]` */
    static fromJSON(json?: Point4dProps): Point4d;
    /** Near-equality test, using `Geometry.isSameCoordinate` on all 4 x,y,z,w */
    isAlmostEqual(other: Point4d): boolean;
    /**
     * Test for same coordinate by direct x,y,z,w args
     * @param x x to test
     * @param y y to test
     * @param z z to test
     * @param w w to test
     */
    isAlmostEqualXYZW(x: number, y: number, z: number, w: number): boolean;
    /**
     * Convert an Angle to a JSON object.
     * @return {*} [x,y,z,w]
     */
    toJSON(): Point4dProps;
    /** Return the 4d distance from this point to other, with all 4 components squared into the hypotenuse.
     * * x,y,z,w all participate without normalization.
     */
    distanceXYZW(other: Point4d): number;
    /** Return the squared 4d distance from this point to other, with all 4 components squared into the hypotenuse.
     * * x,y,z,w all participate without normalization.
     */
    distanceSquaredXYZW(other: Point4d): number;
    /** Return the distance between the instance and other after normalizing by weights
     */
    realDistanceXY(other: Point4d): number | undefined;
    /** Return the largest absolute distance between corresponding components
     * * x,y,z,w all participate without normalization.
     */
    maxDiff(other: Point4d): number;
    /** Return the largest absolute entry of all 4 components x,y,z,w */
    maxAbs(): number;
    /** Returns the magnitude including all 4 components x,y,z,w */
    magnitudeXYZW(): number;
    /** Returns the magnitude of the leading xyz components.  w is ignored.  (i.e. the leading xyz are NOT divided by w.) */
    magnitudeSquaredXYZ(): number;
    /** Return the difference (this-other) using all 4 components x,y,z,w */
    minus(other: Point4d, result?: Point4d): Point4d;
    /** Return `((other.w * this) -  (this.w * other))` */
    crossWeightedMinus(other: Point4d, result?: Vector3d): Vector3d;
    /** Return `((other.w * this) -  (this.w * other))`, with other.w known to be 1 */
    crossWeightedMinusPoint3d(other: Point3d, result?: Vector3d): Vector3d;
    /** Return the sum of this and other, using all 4 components x,y,z,w */
    plus(other: Point4d, result?: Point4d): Point4d;
    /** Test if all components are nearly zero. */
    get isAlmostZero(): boolean;
    /** Create a point with zero in all coordinates. */
    static createZero(): Point4d;
    /**
     * Create plane coefficients for the plane containing pointA, pointB, and 0010.
     * @param pointA first point
     * @param pointB second point
     */
    static createPlanePointPointZ(pointA: Point4d, pointB: Point4d, result?: Point4d): Point4d;
    /**
     * extract 4 consecutive numbers from a Float64Array into a Point4d.
     * @param data buffer of numbers
     * @param xIndex first index for x,y,z,w sequence
     */
    static createFromPackedXYZW(data: Float64Array, xIndex?: number, result?: Point4d): Point4d;
    /** Create a `Point4d` with x,y,z from an `XYAndZ` input, and w from a separate number. */
    static createFromPointAndWeight(xyz: XYAndZ, w: number): Point4d;
    /** Create a `Point4d` from
     * * Point2d, Point3d, or Point4d
     * * other structure with members x,y and optional z,w
     * * array of numbers
     * * default z is 0.0
     * * default w is 1.0  (array[3] can replace)
     */
    static createFromPoint(point: XAndY | XYAndZ | Point4d | number[]): Point4d;
    /** Return `point + vector * scalar` */
    plusScaled(vector: Point4d, scaleFactor: number, result?: Point4d): Point4d;
    /** Return interpolation between instance and pointB at fraction
     */
    interpolate(fraction: number, pointB: Point4d, result?: Point4d): Point4d;
    /** Return `point + vectorA * scalarA + vectorB * scalarB` */
    plus2Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, result?: Point4d): Point4d;
    /** Return `point + vectorA * scalarA + vectorB * scalarB + vectorC * scalarC` */
    plus3Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, vectorC: Point4d, scalarC: number, result?: Point4d): Point4d;
    /** Return `point + vectorA * scalarA + vectorB * scalarB` */
    static createAdd2Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, result?: Point4d): Point4d;
    /** Return `point + vectorA \ scalarA + vectorB * scalarB + vectorC * scalarC` */
    static createAdd3Scaled(vectorA: Point4d, scalarA: number, vectorB: Point4d, scalarB: number, vectorC: Point4d, scalarC: number, result?: Point4d): Point4d;
    /** Return dot product of (4d) vectors from the instance to targetA and targetB */
    dotVectorsToTargets(targetA: Point4d, targetB: Point4d): number;
    /** return (4d) dot product of the instance and other point. */
    dotProduct(other: Point4d): number;
    /** return (4d) dot product of the instance with xyzw */
    dotProductXYZW(x: number, y: number, z: number, w: number): number;
    /** dotProduct with (point.x, point.y, point.z, 1) Used in PlaneAltitudeEvaluator interface */
    altitude(point: Point3d): number;
    /** dotProduct with (x, y, z, 1) Used in PlaneAltitudeEvaluator interface */
    altitudeXYZ(x: number, y: number, z: number): number;
    /** dotProduct with (point.x, point.y, point.z, point.w) Used in PlaneAltitudeEvaluator interface */
    weightedAltitude(point: Point4d): number;
    /** dotProduct with (vector.x, vector.y, vector.z, 0).  Used in PlaneAltitudeEvaluator interface */
    velocity(vector: Vector3d): number;
    /** dotProduct with (x,y,z, 0).  Used in PlaneAltitudeEvaluator interface */
    velocityXYZ(x: number, y: number, z: number): number;
    /**
     * Return the x component of the normal used to evaluate altitude.
     */
    normalX(): number;
    /**
     * Return the x component of the normal used to evaluate altitude.
     */
    normalY(): number;
    /**
     * Return the z component of the normal used to evaluate altitude.
     */
    normalZ(): number;
    /** unit X vector */
    static unitX(): Point4d;
    /** unit Y vector */
    static unitY(): Point4d;
    /** unit Z vector */
    static unitZ(): Point4d;
    /** unit W vector */
    static unitW(): Point4d;
    /** Divide by denominator, but return undefined if denominator is zero. */
    safeDivideOrNull(denominator: number, result?: Point4d): Point4d | undefined;
    /**
     * * Return xyz projection of spacePoint to the plane (this Point4d is understood as plane coefficients, not point coordinates)
     * * If the xyz part of `this` are all zero, (a clone of) `spacePoint` is returned.
     */
    projectPointToPlane(spacePoint: Point3d, result?: Point3d): Point3d;
    /** scale all components (including w!!) */
    scale(scale: number, result?: Point4d): Point4d;
    /** Negate components (including w!!) */
    negate(result?: Point4d): Point4d;
    /**
     * If `this.w` is nonzero, return a 4d point `(x/w,y/w,z/w, 1)`
     * If `this.w` is zero, return undefined.
     * @param result optional result
     */
    normalizeWeight(result?: Point4d): Point4d | undefined;
    /**
     * If `this.w` is nonzero, return a 3d point `(x/w,y/w,z/w)`
     * If `this.w` is zero, return undefined.
     * @param result optional result
     */
    realPoint(result?: Point3d): Point3d | undefined;
    /** Convert the homogeneous point to a (strongly typed) point or vector.
     * * If `this.w` is nonzero, return a Point3d `(x/w,y/w,z/w)`
     * * If `this.w` is zero, return a Vector3d `(x,y,z)`
     */
    realPointOrVector(): Point3d | Vector3d;
    /**
     * * If w is nonzero, return Point3d with x/w,y/w,z/w.
     * * If w is zero, return 000
     * @param x x coordinate
     * @param y y coordinate
     * @param z z coordinate
     * @param w w coordinate
     * @param result optional result
     */
    static createRealPoint3dDefault000(x: number, y: number, z: number, w: number, result?: Point3d): Point3d;
    /**
     * * If w is nonzero, return Vector3d which is the derivative of the projected xyz with given w and 4d derivatives.
     * * If w is zero, return 000
     * @param x x coordinate
     * @param y y coordinate
     * @param z z coordinate
     * @param w w coordinate
     * @param dx x coordinate of derivative
     * @param dy y coordinate of derivative
     * @param dz z coordinate of derivative
     * @param dw w coordinate of derivative
     * @param result optional result
     */
    static createRealDerivativeRay3dDefault000(x: number, y: number, z: number, w: number, dx: number, dy: number, dz: number, dw: number, result?: Ray3d): Ray3d;
    /**
     * * If w is nonzero, return Vector3d which is the derivative of the projected xyz with given w and 4d derivatives.
     * * If w is zero, return 000
     * @param x x coordinate
     * @param y y coordinate
     * @param z z coordinate
     * @param w w coordinate
     * @param dx x coordinate of derivative
     * @param dy y coordinate of derivative
     * @param dz z coordinate of derivative
     * @param dw w coordinate of derivative
     * @param result optional result
     */
    static createRealDerivativePlane3dByOriginAndVectorsDefault000(x: number, y: number, z: number, w: number, dx: number, dy: number, dz: number, dw: number, ddx: number, ddy: number, ddz: number, ddw: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * * If this.w is nonzero, return Point3d with x/w,y/w,z/w.
     * * If this.w is zero, return 000
     */
    realPointDefault000(result?: Point3d): Point3d;
    /** divide all components (x,y,z,w) by the 4d magnitude.
     *
     * * This is appropriate for normalizing a quaternion
     * * Use normalizeWeight to divide by the w component.
     */
    normalizeXYZW(result?: Point4d): Point4d | undefined;
    /**
     * Return the determinant of the 3x3 matrix using components i,j,k of the 3 inputs.
     */
    static determinantIndexed3X3(pointA: Point4d, pointB: Point4d, pointC: Point4d, i: number, j: number, k: number): number;
    /**
     * Return a Point4d perpendicular to all 3 inputs. (A higher level cross product concept)
     * @param pointA first point
     * @param pointB second point
     * @param pointC third point
     */
    static perpendicularPoint4dPlane(pointA: Point4d, pointB: Point4d, pointC: Point4d): Point4d;
    /** Treating this Point4d as plane coefficients, convert to origin and normal form. */
    toPlane3dByOriginAndUnitNormal(result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
    /** Normalize so sum of squares of all 4 coordinates is 1. */
    normalizeQuaternion(): number;
    /** Return a (normalized) quaternion interpolated between two quaternions. */
    static interpolateQuaternions(quaternion0: Point4d, fractionParameter: number, quaternion1: Point4d, result?: Point4d): Point4d;
    /** Measure the "angle" between two points, using all 4 components in the dot product that
     * gives the cosine of the angle.
     */
    radiansToPoint4dXYZW(other: Point4d): number | undefined;
}
