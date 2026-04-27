import { type PerpParallelOptions } from "../geometry";
import { type Point4d } from "../geometry4d/point4d";
import { Angle } from "./angle";
import { type HasZ, type XAndY, type XYZProps, XYAndZ } from "./xyz-props";
/**
 * * `XYZ` is a minimal object containing x,y,z and operations that are meaningful without change in both
 * point and vector.
 *  * `XYZ` is not instantiable.
 *  * The derived (instantiable) classes are
 *    * `Point3d`
 *    * `Vector3d`
 * @public
 */
export declare class XYZ implements XYAndZ {
    /** x coordinate */
    x: number;
    /** y coordinate */
    y: number;
    /** z coordinate */
    z: number;
    /**
     * Set the x,y,z  parts.
     * @param x (optional) x part
     * @param y (optional) y part
     * @param z (optional) z part
     */
    set(x?: number, y?: number, z?: number): void;
    /** Set the x,y,z parts to zero. */
    setZero(): void;
    protected constructor(x?: number, y?: number, z?: number);
    /** Type guard for XAndY.
     * @note this will return true for an XYAndZ. If you wish to distinguish between the two, call isXYAndZ first.
     */
    static isXAndY(arg: any): arg is XAndY;
    /** Type guard to determine whether an object has a member called "z" */
    static hasZ(arg: any): arg is HasZ;
    /** Type guard for XYAndZ.  */
    static isXYAndZ(arg: any): arg is XYAndZ;
    /**
     * Test if arg is any of:
     * * XAndY
     * * XYAndZ
     * * [number,number]
     * * [number,number,number]
     */
    static isAnyImmediatePointType(arg: any): arg is XAndY | XYAndZ | number[];
    /**
     * Look for (in order) an x coordinate present as:
     * * arg.x
     * * arg[0]
     */
    static accessX(arg: any, defaultValue?: number): number | undefined;
    /**
     * Look for (in order) an x coordinate present as:
     * * arg.y
     * * arg[1]
     */
    static accessY(arg: any, defaultValue?: number): number | undefined;
    /**
     * Look for (in order) an x coordinate present as:
     * * arg.z
     * * arg[2]
     */
    static accessZ(arg: any, defaultValue?: number): number | undefined;
    /**
     * Set the x,y,z parts from one of these input types
     * * XYZ -- copy the x,y,z parts
     * * Float64Array -- Copy from indices 0,1,2 to x,y,z
     * * XY -- copy the x, y parts and set z=0
     */
    setFrom(other: Float64Array | XAndY | XYAndZ | undefined): void;
    /**
     * Set the x,y,z parts from a Point3d.
     * This is the same effect as `setFrom(other)` with no pretesting of variant input type
     * * Set to zeros if `other` is undefined.
     */
    setFromPoint3d(other?: XYAndZ): void;
    /**
     * Set the x,y,z parts from a Vector3d
     * This is the same effect as `setFrom(other)` with no pretesting of variant input type
     * * Set to zeros if `other` is undefined.
     */
    setFromVector3d(other?: Vector3d): void;
    /**
     * Returns true if this and other have equal x,y,z parts within Geometry.smallMetricDistance.
     * @param other The other XYAndZ to compare
     * @param tol The tolerance for the comparison. If undefined, use [[Geometry.smallMetricDistance]]
     */
    isAlmostEqual(other: Readonly<XYAndZ>, tol?: number): boolean;
    /** Return true if this and other have equal x,y,z parts within Geometry.smallMetricDistance. */
    isAlmostEqualXYZ(x: number, y: number, z: number, tol?: number): boolean;
    /**
     * Return true if this and {other + vector*scale} have equal x,y,z parts within Geometry.smallMetricDistance.
     * * this method is useful in testing "point on ray" without explicitly constructing the projection point
     */
    isAlmostEqualPointPlusScaledVector(other: XYAndZ, vector: XYAndZ, scale: number, tol?: number): boolean;
    /** Return true if this and other have equal x,y parts within Geometry.smallMetricDistance. */
    isAlmostEqualXY(other: XAndY, tol?: number): boolean;
    /** Return a JSON object as array `[x,y,z]` */
    toJSON(): XYZProps;
    /** Return as an array `[x,y,z]` */
    toArray(): number[];
    /** Return a JSON object as key value pairs `{x: value, y: value, z: value}` */
    toJSONXYZ(): XYZProps;
    /** Pack the x,y,z values in a Float64Array. */
    toFloat64Array(): Float64Array;
    /**
     * Set the x,y,z properties from one of several json forms:
     *
     * *  array of numbers: [x,y,z]
     * *  object with x,y, and (optional) z as numeric properties {x: xValue, y: yValue, z: zValue}
     */
    setFromJSON(json?: XYZProps): void;
    /** Return the distance from this point to other */
    distance(other: XYAndZ): number;
    /** Return squared distance from this point to other */
    distanceSquared(other: XYAndZ): number;
    /** Return the XY distance from this point to other */
    distanceXY(other: XAndY): number;
    /** Return squared XY distance from this point to other */
    distanceSquaredXY(other: XAndY): number;
    /** Return the largest absolute distance between corresponding components */
    maxDiff(other: XYAndZ): number;
    /** Return the x,y, z component corresponding to 0,1,2 */
    at(index: number): number;
    /** Set value at index 0 or 1 or 2 */
    setAt(index: number, value: number): void;
    /** Return the index (0,1,2) of the x,y,z component with largest absolute value */
    indexOfMaxAbs(): number;
    /** Return true if the x,y,z components are all nearly zero to tolerance Geometry.smallMetricDistance */
    get isAlmostZero(): boolean;
    /** Return true if the x,y,z components are all exactly zero */
    get isZero(): boolean;
    /** Return the largest absolute value of any component */
    maxAbs(): number;
    /** Return the sqrt of the sum of squared x,y,z parts */
    magnitude(): number;
    /** Return the sum of squared x,y,z parts */
    magnitudeSquared(): number;
    /** Return sqrt of the sum of squared x,y parts */
    magnitudeXY(): number;
    /** Return the sum of squared x,y parts */
    magnitudeSquaredXY(): number;
    /** Exact equality test. */
    isExactEqual(other: XYAndZ): boolean;
    /** Equality test with Geometry.smallMetricDistance tolerance */
    isAlmostEqualMetric(other: XYAndZ): boolean;
    /** Add x,y,z from other in place. */
    addInPlace(other: XYAndZ): void;
    /** Add x,y,z from other in place. */
    subtractInPlace(other: XYAndZ): void;
    /** Add (in place) the scaled x,y,z of other */
    addScaledInPlace(other: XYAndZ, scale: number): void;
    /** Multiply the x, y, z parts by scale. */
    scaleInPlace(scale: number): void;
    /** Add to x, y, z parts */
    addXYZInPlace(dx?: number, dy?: number, dz?: number): void;
    /** Clone strongly typed as Point3d */
    cloneAsPoint3d(): Point3d;
    /** Return a (full length) vector from this point to other */
    vectorTo(other: XYAndZ, result?: Vector3d): Vector3d;
    /** Return a multiple of a the (full length) vector from this point to other */
    scaledVectorTo(other: XYAndZ, scale: number, result?: Vector3d): Vector3d;
    /**
     * Return a unit vector from this vector to other. Return a 000 vector if the input is too small to normalize.
     * @param other target of created vector.
     * @param result optional result vector.
     */
    unitVectorTo(target: XYAndZ, result?: Vector3d): Vector3d | undefined;
    /** Freeze this XYZ */
    freeze(): Readonly<this>;
    /** Access x part of XYZProps (which may be .x or [0]) */
    static x(xyz: XYZProps | undefined, defaultValue?: number): number;
    /** Access x part of XYZProps (which may be .x or [0]) */
    static y(xyz: XYZProps | undefined, defaultValue?: number): number;
    /** Access x part of XYZProps (which may be .x or [0]) */
    static z(xyz: XYZProps | undefined, defaultValue?: number): number;
}
/** 3D point with `x`,`y`,`z` as properties
 * @public
 */
export declare class Point3d extends XYZ {
    /** Constructor for Point3d */
    constructor(x?: number, y?: number, z?: number);
    /**
     * Convert json to Point3d.  Accepted forms are:
     * * `[1,2,3]` --- array of numbers
     * *  array of numbers: [x,y,z]
     * *  object with x,y, and (optional) z as numeric properties {x: xValue, y: yValue, z: zValue}
     * @param json json value.
     */
    static fromJSON(json?: XYZProps): Point3d;
    /** Return a new Point3d with the same coordinates */
    clone(result?: Point3d): Point3d;
    /**
     * Create a new Point3d with given coordinates
     * @param x x part
     * @param y y part
     * @param z z part
     */
    static create(x?: number, y?: number, z?: number, result?: Point3d): Point3d;
    /** Copy contents from another Point3d, Point2d, Vector2d, or Vector3d */
    static createFrom(data: XYAndZ | XAndY | Float64Array, result?: Point3d): Point3d;
    /**
     * Copy x,y,z from
     * @param xyzData flat array of xyzxyz for multiple points
     * @param pointIndex index of point to extract.   This index is multiplied by 3 to obtain starting index in the array.
     * @param result optional result point.
     */
    static createFromPacked(xyzData: Float64Array, pointIndex: number, result?: Point3d): Point3d | undefined;
    /**
     * Copy and unweight xyzw.
     * @param xyzData flat array of x,y,z,w,x,y,z,w for multiple points
     * @param pointIndex index of point to extract. This index is multiplied by 4 to obtain starting index in the array.
     * @param result optional result point.
     */
    static createFromPackedXYZW(xyzData: Float64Array, pointIndex: number, result?: Point3d): Point3d | undefined;
    /**
     * Return an array of points constructed from groups of 3 entries in a Float64Array.
     * Any incomplete group at the tail of the array is ignored.
     */
    static createArrayFromPackedXYZ(data: Float64Array): Point3d[];
    /** Create a new point with 000 xyz */
    static createZero(result?: Point3d): Point3d;
    /**
     * Return the cross product of the vectors from this to pointA and pointB
     * *  the result is a vector
     * *  the result is perpendicular to both vectors, with right hand orientation
     * *  the magnitude of the vector is twice the area of the triangle.
     */
    crossProductToPoints(pointA: Point3d, pointB: Point3d, result?: Vector3d): Vector3d;
    /** Return the magnitude of the cross product of the vectors from this to pointA and pointB */
    crossProductToPointsMagnitude(pointA: Point3d, pointB: Point3d): number;
    /**
     * Return the triple product of the vectors from this to pointA, pointB, pointC
     * * This is a scalar (number)
     * * This is 6 times the (signed) volume of the tetrahedron on the 4 points.
     */
    tripleProductToPoints(pointA: Point3d, pointB: Point3d, pointC: Point3d): number;
    /**
     * Return the cross product of the vectors from this to pointA and pointB
     * *  the result is a scalar
     * *  the magnitude of the vector is twice the signed area of the triangle.
     * *  this is positive for counter-clockwise order of the points, negative for clockwise.
     */
    crossProductToPointsXY(pointA: Point3d, pointB: Point3d): number;
    /**
     * Return a point interpolated between `this` point and the `other` point.
     * * Fraction specifies where the interpolated point is located on the line passing `this` and `other`.
     */
    interpolate(fraction: number, other: XYAndZ, result?: Point3d): Point3d;
    /** Return a point with independent x,y,z fractional interpolation. */
    interpolateXYZ(fractionX: number, fractionY: number, fractionZ: number, other: Point3d, result?: Point3d): Point3d;
    /** Interpolate between points, then add a shift in the xy plane by a fraction of the XY projection perpendicular. */
    interpolatePerpendicularXY(fraction: number, pointB: Point3d, fractionXYPerp: number, result?: Point3d): Point3d;
    /** Return point minus vector */
    minus(vector: XYAndZ, result?: Point3d): Point3d;
    /** Return point plus vector */
    plus(vector: XYAndZ, result?: Point3d): Point3d;
    /** Return point plus vector */
    plusXYZ(dx?: number, dy?: number, dz?: number, result?: Point3d): Point3d;
    /** Return point + vector * scalar */
    plusScaled(vector: XYAndZ, scaleFactor: number, result?: Point3d): Point3d;
    /** Return point + vectorA * scalarA + vectorB * scalarB */
    plus2Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYZ, scalarB: number, result?: Point3d): Point3d;
    /** Return point + vectorA * scalarA + vectorB * scalarB + vectorC * scalarC */
    plus3Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, vectorC: XYAndZ, scalarC: number, result?: Point3d): Point3d;
    /**
     * Return a point that is scaled from the source point.
     * @param source existing point
     * @param scale scale factor to apply to its x,y,z parts
     * @param result optional point to receive coordinates
     */
    static createScale(source: XYAndZ, scale: number, result?: Point3d): Point3d;
    /**
     * Create a point that is a linear combination (weighted sum) of 2 input points.
     * @param pointA first input point
     * @param scaleA scale factor for pointA
     * @param pointB second input point
     * @param scaleB scale factor for pointB
     */
    static createAdd2Scaled(pointA: XYAndZ, scaleA: number, pointB: XYAndZ, scaleB: number, result?: Point3d): Point3d;
    /** Create a point that is a linear combination (weighted sum) of 3 input points.
     * @param pointA first input point
     * @param scaleA scale factor for pointA
     * @param pointB second input point
     * @param scaleB scale factor for pointB
     * @param pointC third input point.
     * @param scaleC scale factor for pointC
     */
    static createAdd3Scaled(pointA: XYAndZ, scaleA: number, pointB: XYAndZ, scaleB: number, pointC: XYAndZ, scaleC: number, result?: Point3d): Point3d;
    /**
     * Return the dot product of vectors from this to pointA and this to pointB.
     * @param targetA target point for first vector
     * @param targetB target point for second vector
     */
    dotVectorsToTargets(targetA: Point3d, targetB: Point3d): number;
    /** Return the fractional projection of this onto a line between points. */
    fractionOfProjectionToLine(startPoint: Point3d, endPoint: Point3d, defaultFraction?: number): number;
}
/**
 * 3D vector with `x`,`y`,`z` as properties
 * @public
 */
export declare class Vector3d extends XYZ {
    constructor(x?: number, y?: number, z?: number);
    /**
     * Return an array of vectors constructed from groups of 3 entries in a Float64Array.
     * Any incomplete group at the tail of the array is ignored.
     */
    static createArrayFromPackedXYZ(data: Float64Array): Vector3d[];
    /**
     * Copy xyz from this instance to a new (or optionally reused) Vector3d
     * @param result optional instance to reuse.
     */
    clone(result?: Vector3d): Vector3d;
    /**
     * Return a Vector3d (new or reused from optional result)
     * @param x x component
     * @param y y component
     * @param z z component
     * @param result optional instance to reuse
     */
    static create(x?: number, y?: number, z?: number, result?: Vector3d): Vector3d;
    /**
     * Create a vector which is cross product of two vectors supplied as separate arguments
     * @param ux x coordinate of vector u
     * @param uy y coordinate of vector u
     * @param uz z coordinate of vector u
     * @param vx x coordinate of vector v
     * @param vy y coordinate of vector v
     * @param vz z coordinate of vector v
     * @param result optional result vector.
     */
    static createCrossProduct(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Vector3d): Vector3d;
    /**
     * Accumulate a vector which is cross product vectors from origin (ax,ay,az) to targets (bx,by,bz) and (cx,cy,cz)
     * @param ax x coordinate of origin
     * @param ay y coordinate of origin
     * @param az z coordinate of origin
     * @param bx x coordinate of target point b
     * @param by y coordinate of target point b
     * @param bz z coordinate of target point b
     * @param cx x coordinate of target point c
     * @param cy y coordinate of target point c
     * @param cz z coordinate of target point c
     */
    addCrossProductToTargetsInPlace(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void;
    /**
     * Return the cross product of the vectors from origin to pointA and pointB.
     * * the result is a vector
     * * the result is perpendicular to both vectors, with right hand orientation
     * * the magnitude of the vector is twice the area of the triangle.
     */
    static createCrossProductToPoints(origin: XYAndZ, pointA: XYAndZ, pointB: XYAndZ, result?: Vector3d): Vector3d;
    /**
     * Return the NORMALIZED cross product of the vectors from origin to pointA and pointB, or undefined
     *
     * * the result is a vector
     * * the result is perpendicular to both vectors, with right hand orientation
     * * the magnitude of the vector is twice the area of the triangle.
     */
    static createUnitCrossProductToPoints(origin: XYAndZ, pointA: XYAndZ, pointB: XYAndZ, result?: Vector3d): Vector3d | undefined;
    /**
     * Return a vector defined by polar coordinates distance and angle from x axis
     * @param r distance measured from origin
     * @param theta angle from x axis to the vector (in xy plane)
     * @param z optional z coordinate
     */
    static createPolar(r: number, theta: Angle, z?: number): Vector3d;
    /**
     * Return a vector defined in spherical coordinates.
     * @param r sphere radius
     * @param theta angle in xy plane
     * @param phi angle from xy plane to the vector
     */
    static createSpherical(r: number, theta: Angle, phi: Angle): Vector3d;
    /**
     * Convert json to Vector3d.  Accepted forms are:
     * * `[1,2,3]` --- array of numbers
     * *  array of numbers: [x,y,z]
     * *  object with x,y, and (optional) z as numeric properties {x: xValue, y: yValue, z: zValue}
     * @param json json value.
     */
    static fromJSON(json?: XYZProps): Vector3d;
    /** Copy contents from another Point3d, Point2d, Vector2d, or Vector3d */
    static createFrom(data: XYAndZ | XAndY | Float64Array | number[], result?: Vector3d): Vector3d;
    /**
     * Return a vector defined by start and end points (end - start).
     * @param start start point for vector.
     * @param end end point for vector.
     * @param result optional result.
     */
    static createStartEnd(start: XAndY | XYAndZ, end: XAndY | XYAndZ, result?: Vector3d): Vector3d;
    /**
     * Return a vector (optionally in preallocated result, otherwise newly created) from [x0,y0,z0] to [x1,y1,z1]
     * @param x0 start point x coordinate.
     * @param y0 start point y coordinate.
     * @param z0 start point z coordinate.
     * @param x1 end point x coordinate.
     * @param y1 end point y coordinate.
     * @param z1 end point z coordinate.
     * @param result optional result vector.
     */
    static createStartEndXYZXYZ(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, result?: Vector3d): Vector3d;
    /**
     * Return a vector which is the input `vector` rotated by `angle` around the `axis` vector.
     * @param vector initial vector.
     * @param axis axis of rotation.
     * @param angle angle of rotation.  If undefined, 90 degrees is implied.
     * @param result optional result vector
     * @returns undefined if axis has no length.
     */
    static createRotateVectorAroundVector(vector: Vector3d, axis: Vector3d, angle?: Angle): Vector3d | undefined;
    /**
     * Set (replace) xyz components so they are a vector from point0 to point1
     * @param point0 start point of computed vector.
     * @param point1 end point of computed vector.
     */
    setStartEnd(point0: XYAndZ, point1: XYAndZ): void;
    /** Return a vector with 000 xyz parts. */
    static createZero(result?: Vector3d): Vector3d;
    /** Return a unit X vector optionally multiplied by a scale  */
    static unitX(scale?: number): Vector3d;
    /** Return a unit Y vector optionally multiplied by a scale  */
    static unitY(scale?: number): Vector3d;
    /** Return a unit Z vector optionally multiplied by a scale  */
    static unitZ(scale?: number): Vector3d;
    /**
     * Scale the instance by 1.0/`denominator`.
     * @param denominator number by which to divide the coordinates of this instance
     * @param result optional pre-allocated object to return
     * @return scaled vector, or undefined if `denominator` is exactly zero (in which case instance is untouched).
     */
    safeDivideOrNull(denominator: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Return a normalized instance and instance length.
     * @param result optional pre-allocated object to return as `v` property
     * @returns object containing the properties:
     *  * `v`: unit vector in the direction of the instance, or undefined if `mag` is near zero
     *  * `mag`: length of the instance prior to normalization
     */
    normalizeWithLength(result?: Vector3d): {
        v: Vector3d | undefined;
        mag: number;
    };
    /**
     * Return a unit vector parallel with this. Return undefined if this.magnitude is near zero.
     * @param result optional result.
     */
    normalize(result?: Vector3d): Vector3d | undefined;
    /**
     * If this vector has nonzero length, divide by the length to change to a unit vector.
     * @returns true if normalization was successful
     */
    normalizeInPlace(): boolean;
    /**
     * Create a normalized vector from the inputs.
     * @param result optional result
     * @returns undefined if and only if normalization fails
     */
    static createNormalized(x?: number, y?: number, z?: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Create a normalized vector from startPoint to endPoint
     * @param startPoint start point of vector
     * @param endPoint end point of vector
     * @param result optional result
     * @returns undefined if and only if normalization fails.
     */
    static createNormalizedStartEnd(startPoint: XYAndZ, endPoint: XYAndZ, result?: Vector3d): Vector3d | undefined;
    /**
     * Return fractional length of the projection of the instance onto the target vector.
     * * To find the projection vector, scale the target vector by the return value.
     * * Math details can be found at docs/learning/geometry/PointVector.md
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/ProjectVectorOnVector
     * and https://www.itwinjs.org/sandbox/SaeedTorabi/ProjectVectorOnPlane
     * @param target the target vector
     * @param defaultFraction the returned value in case the magnitude of `target` is too small
     * @returns the signed length of the projection divided by the length of `target`
     * */
    fractionOfProjectionToVector(target: Vector3d, defaultFraction?: number): number;
    /**
     * Return a new vector with components negated from the calling instance.
     * @param result optional result vector.
     */
    negate(result?: Vector3d): Vector3d;
    /** Return a vector same length as this but rotate 90 degrees CCW */
    rotate90CCWXY(result?: Vector3d): Vector3d;
    /** Return a vector same length as this but rotated 90 degrees clockwise */
    rotate90CWXY(result?: Vector3d): Vector3d;
    /**
     * Return a vector which is in the xy plane, perpendicular to the xy part of this vector, and of unit length.
     * * If the xy part is 00, the return is the rotated (but not normalized) xy parts of this vector.
     * @param result optional preallocated result.
     */
    unitPerpendicularXY(result?: Vector3d): Vector3d;
    /**
     * Rotate the xy parts of this vector around the z axis.
     * * z is taken unchanged to the result.
     * @param angle angle to rotate
     * @param result optional preallocated result
     */
    rotateXY(angle: Angle, result?: Vector3d): Vector3d;
    /**
     * Return a (new or optionally preallocated) vector that is rotated 90 degrees in
     * the plane of this vector and the target vector.
     * @param target Second vector which defines the plane of rotation.
     * @param result optional preallocated vector for result.
     * @returns rotated vector, or undefined if the cross product of this and
     *          the the target cannot be normalized (i.e. if the target and this are colinear)
     */
    rotate90Towards(target: Vector3d, result?: Vector3d): Vector3d | undefined;
    /**
     * Rotate this vector 90 degrees around an axis vector.
     * * Note that simple cross is in the plane perpendicular to axis -- it loses the part
     * of "this" that is along the axis. The unit and scale is supposed to fix that.
     * This matches with Rodrigues' rotation formula because cos(theta) = 0 and sin(theta) = 1
     * @returns the (new or optionally reused result) rotated vector, or undefined if the axis
     * vector cannot be normalized.
     */
    rotate90Around(axis: Vector3d, result?: Vector3d): Vector3d | undefined;
    /**
     * Return a vector computed at fractional position between this vector and vectorB
     * @param fraction fractional position.  0 is at `this`.  1 is at `vectorB`.
     *                 True fractions are "between", negatives are "before this", beyond 1 is "beyond vectorB".
     * @param vectorB second vector
     * @param result optional preallocated result.
     */
    interpolate(fraction: number, vectorB: XYAndZ, result?: Vector3d): Vector3d;
    /**
     * Return the vector sum `this - vector`
     * @param vector right side of addition.
     * @param result optional preallocated result.
     */
    plus(vector: XYAndZ, result?: Vector3d): Vector3d;
    /**
     * Return the vector difference `this - vector`
     * @param vector right side of subtraction.
     * @param result optional preallocated result.
     */
    minus(vector: XYAndZ, result?: Vector3d): Vector3d;
    /** Return vector + vector * scalar */
    plusScaled(vector: XYAndZ, scaleFactor: number, result?: Vector3d): Vector3d;
    /** Return the (strongly typed Vector3d) `this Vector3d + vectorA * scalarA + vectorB * scalarB` */
    plus2Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, result?: Vector3d): Vector3d;
    /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scalarA + vectorB * scalarB + vectorC * scalarC` */
    plus3Scaled(vectorA: XYAndZ, scalarA: number, vectorB: XYAndZ, scalarB: number, vectorC: XYAndZ, scalarC: number, result?: Vector3d): Vector3d;
    /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scalarA + vectorB * scalarB` */
    static createAdd2Scaled(vectorA: XYAndZ, scaleA: number, vectorB: XYAndZ, scaleB: number, result?: Vector3d): Vector3d;
    /**
     * Return the (strongly typed Vector3d) `thisVector3d + vectorA * scalarA + vectorB * scalarB`
     * with all components presented as numbers
     */
    static createAdd2ScaledXYZ(ax: number, ay: number, az: number, scaleA: number, bx: number, by: number, bz: number, scaleB: number, result?: Vector3d): Vector3d;
    /** Return the (strongly typed Vector3d) `thisVector3d + vectorA * scaleA + vectorB * scaleB + vectorC * scaleC` */
    static createAdd3Scaled(vectorA: XYAndZ, scaleA: number, vectorB: XYAndZ, scaleB: number, vectorC: XYAndZ, scaleC: number, result?: Vector3d): Vector3d;
    /** Return vector * scalar */
    scale(scale: number, result?: Vector3d): Vector3d;
    /**
     * Return a (optionally new or reused) vector in the direction of `this` but with specified length.
     * @param length desired length of vector
     * @param result optional preallocated result
     */
    scaleToLength(length: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Compute the cross product of this vector with `vectorB`.   Immediately pass it to `normalize`.
     * @param vectorB second vector for cross product.
     * @returns see `Vector3d` method `normalize()` for error condition.
     */
    unitCrossProduct(vectorB: Vector3d, result?: Vector3d): Vector3d | undefined;
    /**
     * Compute the cross product of this vector with `vectorB`.   Normalize it, using given xyz as
     * default if length is zero.
     * @param vectorB second vector of cross product
     * @param x x value for default result
     * @param y y value for default result
     * @param z z value for default result
     * @param result optional pre-allocated result.
     */
    unitCrossProductWithDefault(vectorB: Vector3d, x: number, y: number, z: number, result?: Vector3d): Vector3d;
    /**
     * Normalize this vector, using given xyz as default if length is zero.
     * * if this instance and x,y,z are both 000, return unit x vector.
     * @param x x value for default result
     * @param y y value for default result
     * @param z z value for default result
     * @param result optional pre-allocated result.
     */
    normalizeWithDefault(x: number, y: number, z: number, result?: Vector3d): Vector3d;
    /**
     * Try to normalize (divide by magnitude), storing the result in place.
     * @param smallestMagnitude smallest magnitude allowed as divisor.
     * @returns false if magnitude is too small.  In this case the vector is unchanged.
     */
    tryNormalizeInPlace(smallestMagnitude?: number): boolean;
    /**
     * Compute cross product with `vectorB`
     * * cross product vector will have the given length.
     * @param vectorB second vector for cross product.
     * @param productLength desired length of result vector.
     * @param result optional preallocated vector
     * @return undefined if the cross product is near zero length.
     */
    sizedCrossProduct(vectorB: Vector3d, productLength: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Compute the squared magnitude of a cross product (without allocating a temporary vector object)
     * @param vectorB second vector of cross product
     * @returns the squared magnitude of the cross product of this instance with vectorB.
     */
    crossProductMagnitudeSquared(vectorB: XYAndZ): number;
    /**
     * Compute the  magnitude of a cross product (without allocating a temporary vector object)
     * @param vectorB second vector of cross product
     * @returns the  magnitude of the cross product of this instance with vectorB.
     */
    crossProductMagnitude(vectorB: XYAndZ): number;
    /**
     * Return the dot product of this vector with vectorB.
     * @param vectorB second vector of cross product
     * @returns the dot product of this instance with vectorB
     */
    dotProduct(vectorB: XYAndZ): number;
    /**
     * Return the dot product of the xyz components of two inputs that are XYAndZ but otherwise not explicitly Vector3d
     * @param targetA target point for first vector
     * @param targetB target point for second vector
     */
    static dotProductAsXYAndZ(dataA: XYAndZ, dataB: XYAndZ): number;
    /**
     * Returns the dot product of this vector with the with vector from pointA to pointB
     * @param pointA start point of second vector of dot product
     * @param pointB end point of second vector of dot product
     */
    dotProductStartEnd(pointA: XYAndZ, pointB: XYAndZ): number;
    /**
     * Returns the dot product with vector (pointB - pointA * pointB.w)
     * * That is, pointA is weighted to weight of pointB.
     * * If pointB.w is zero, the homogeneous pointB is a simple vector
     * * If pointB.w is nonzero, the vector "from A to B" is not physical length.
     */
    dotProductStart3dEnd4d(pointA: Point3d, pointB: Point4d): number;
    /** Cross product with vector from pointA to pointB */
    crossProductStartEnd(pointA: Point3d, pointB: Point3d, result?: Vector3d): Vector3d;
    /** Cross product (xy parts only) with vector from pointA to pointB */
    crossProductStartEndXY(pointA: Point3d, pointB: Point3d): number;
    /** Dot product with vector from pointA to pointB, with pointB given as x,y,z */
    dotProductStartEndXYZ(pointA: Point3d, x: number, y: number, z: number): number;
    /** Dot product with vector from pointA to pointB, using only xy parts */
    dotProductStartEndXY(pointA: Point3d, pointB: Point3d): number;
    /**
     * Dot product with vector from pointA to pointB, with pointB given as (weighted) wx,wy,wz,w
     * * We need to unweight pointB (which is a homogeneous point) to be able to participate in the
     * vector dot product
     * * if the weight is near zero metric, the return is zero.
     */
    dotProductStartEndXYZW(pointA: Point3d, wx: number, wy: number, wz: number, w: number): number;
    /** Return the dot product of the instance and vectorB, using only the x and y parts. */
    dotProductXY(vectorB: Vector3d): number;
    /**
     * Dot product with vector (x,y,z)
     * @param x x component for dot product
     * @param y y component for dot product
     * @param z z component for dot product
     */
    dotProductXYZ(x: number, y: number, z?: number): number;
    /** Return the triple product of the instance, vectorB, and vectorC  */
    tripleProduct(vectorB: Vector3d, vectorC: Vector3d): number;
    /** Return the cross product of the instance and vectorB, using only the x and y parts. */
    crossProductXY(vectorB: Vector3d): number;
    /**
     * Return the cross product of this vector and vectorB.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/CrossProduct
     * @param vectorB second vector of cross product
     * @param result optional preallocated result.
     */
    crossProduct(vectorB: Vector3d, result?: Vector3d): Vector3d;
    /**
     * Return cross product of `this` with the vector `(x, y, z)`
     * @param x x component of second vector
     * @param y y component of second vector
     * @param z z component of second vector
     * @param result computed cross product (new Vector3d).
     */
    crossProductXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
    /**
     * Return the angle in radians (not as strongly typed Angle) from this vector to vectorB.
     * * The returned angle is between 0 and `Math.PI`.
     * * The returned angle is measured in the plane containing the two vectors.
     * * Use `planarRadiansTo` and `signedRadiansTo` to return an angle measured in a specific plane.
     * @param vectorB target vector.
     */
    radiansTo(vectorB: Vector3d): number;
    /**
     * Return the (strongly-typed) angle from this vector to vectorB.
     * * The returned angle is between 0 and 180 degrees.
     * * The returned angle is measured in the plane containing the two vectors.
     * * Use `planarAngleTo` and `signedAngleTo` to return an angle measured in a specific plane.
     * @param vectorB target vector.
     */
    angleTo(vectorB: Vector3d): Angle;
    /**
     * Return the (strongly-typed) angle from this vector to the plane perpendicular to planeNormal.
     * * The returned angle is between -90 and 90 degrees.
     * * The returned angle is measured in the plane containing the two vectors.
     * * The function returns PI/2 - angleTo(planeNormal).
     * @param planeNormal a normal vector to the plane.
     */
    angleFromPerpendicular(planeNormal: Vector3d): Angle;
    /**
     * Return the (strongly-typed) angle from this vector to vectorB, using only the xy parts.
     * * The returned angle is between -180 and 180 degrees.
     * * Use `planarAngleTo` and `signedAngleTo` to return an angle measured in a specific plane.
     * @param vectorB target vector.
     */
    angleToXY(vectorB: Vector3d): Angle;
    /**
     * Return the angle in radians (not as strongly-typed Angle) from this vector to vectorB, measured
     * in their containing plane whose normal lies in the same half-space as vectorW.
     * * The returned angle is between `-Math.PI` and `Math.PI`.
     * * If the cross product of this vector and vectorB lies on the same side of the plane as vectorW,
     * this function returns `radiansTo(vectorB)`; otherwise, it returns `-radiansTo(vectorB)`.
     * * `vectorW` does not have to be perpendicular to the plane.
     * * Use `planarRadiansTo` to measure the angle between vectors that are projected to another plane.
     * @param vectorB target vector.
     * @param vectorW determines the side of the plane in which the returned angle is measured
     */
    signedRadiansTo(vectorB: Vector3d, vectorW: Vector3d): number;
    /**
     * Return the (strongly-typed) angle from this vector to vectorB, measured
     * in their containing plane whose normal lies in the same half-space as vectorW.
     * * The returned angle is between -180 and 180 degrees.
     * * If the cross product of this vector and vectorB lies on the same side of the plane as vectorW,
     * this function returns `angleTo(vectorB)`; otherwise, it returns `-angleTo(vectorB)`.
     * * `vectorW` does not have to be perpendicular to the plane.
     * * Use `planarAngleTo` to measure the angle between vectors that are projected to another plane.
     * @param vectorB target vector.
     * @param vectorW determines the side of the plane in which the returned angle is measured
     */
    signedAngleTo(vectorB: Vector3d, vectorW: Vector3d): Angle;
    /**
     * Return the angle in radians (not as strongly-typed Angle) from this vector to vectorB,
     * measured between their projections to the plane with the given normal.
     * * The returned angle is between `-Math.PI` and `Math.PI`.
     * @param vectorB target vector
     * @param planeNormal the normal vector to the plane.
     */
    planarRadiansTo(vectorB: Vector3d, planeNormal: Vector3d): number;
    /**
     * Return the (strongly-type) angle from this vector to vectorB,
     * measured between their projections to the plane with the given normal.
     * * The returned angle is between -180 and 180 degrees.
     * @param vectorB target vector.
     * @param planeNormal the normal vector to the plane.
     */
    planarAngleTo(vectorB: Vector3d, planeNormal: Vector3d): Angle;
    /**
     * Return the smallest angle (in radians) from the (bidirectional) line containing `this`
     * to the (bidirectional) line containing `vectorB`
     */
    smallerUnorientedRadiansTo(vectorB: Vector3d): number;
    /**
     * Return the smallest (strongly typed) angle from the (bidirectional) line containing `this`
     * to the (bidirectional) line containing `vectorB`
     */
    smallerUnorientedAngleTo(vectorB: Vector3d): Angle;
    /**
     * Test if this vector is parallel to other.
     * * The input tolerances in `options`, if given, are considered to be squared for efficiency's sake,
     * so if you have a distance or angle tolerance t, you should pass in t * t.
     * @param other second vector in comparison
     * @param oppositeIsParallel whether to consider diametrically opposed vectors as parallel
     * @param returnValueIfAnInputIsZeroLength if either vector is near zero length, return this value.
     * @param options optional radian and distance tolerances.
     */
    isParallelTo(other: Vector3d, oppositeIsParallel?: boolean, returnValueIfAnInputIsZeroLength?: boolean, options?: PerpParallelOptions): boolean;
    /**
     * Test if this vector is perpendicular to other.
     * * The input tolerances in `options`, if given, are considered to be squared for efficiency's sake,
     * so if you have a distance or angle tolerance t, you should pass in t * t.
     * @param other second vector in comparison
     * @param returnValueIfAnInputIsZeroLength if either vector is near zero length, return this value.
     * @param options optional radian and distance tolerances.
     */
    isPerpendicularTo(other: Vector3d, returnValueIfAnInputIsZeroLength?: boolean, options?: PerpParallelOptions): boolean;
}
