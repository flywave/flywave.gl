import { type BeJSONFunctions, type PerpParallelOptions } from "../geometry";
import { Angle } from "./angle";
import { type XAndY, type XYProps } from "./xyz-props";
/**
 * Minimal object containing x,y and operations that are meaningful without change in both point and vector.
 *  * `XY` is not instantiable.
 *  * The derived (instantiable) classes are
 *    * `Point2d`
 *    * `Vector2d`
 * @public
 */
export declare class XY implements XAndY {
    /** x component */
    x: number;
    /** y component */
    y: number;
    /** Set both x and y. */
    set(x?: number, y?: number): void;
    /** Set both x and y to zero */
    setZero(): void;
    protected constructor(x?: number, y?: number);
    /** Set both x and y from other. */
    setFrom(other?: XAndY): void;
    /** Freeze this instance so it is read-only */
    freeze(): Readonly<this>;
    /** Returns true if this and other have equal x,y parts within Geometry.smallMetricDistance. */
    isAlmostEqual(other: XAndY, tol?: number): boolean;
    /** Returns true if this and other have equal x,y parts within Geometry.smallMetricDistance. */
    isAlmostEqualXY(x: number, y: number, tol?: number): boolean;
    /** Return a json array  `[x,y]`   */
    toJSON(): XYProps;
    /** Return a json object `{x: 1, y:2}`  */
    toJSONXY(): XYProps;
    /**
     * Set x and y from a JSON input such as `[1,2]` or `{x:1, y:2}`
     * * If no JSON input is provided, 0 would be used as default values for x and y.
     * @param json the JSON input
     */
    setFromJSON(json?: XYProps): void;
    /** Return the distance from this point to other */
    distance(other: XAndY): number;
    /** Return squared distance from this point to other */
    distanceSquared(other: XAndY): number;
    /** Return the largest absolute distance between corresponding components */
    maxDiff(other: XAndY): number;
    /** Return the x,y component corresponding to 0,1 */
    at(index: number): number;
    /** Set value at index 0 or 1 */
    setAt(index: number, value: number): void;
    /** Return the index (0,1) of the x,y component with largest absolute value */
    indexOfMaxAbs(): number;
    /** Returns true if the x,y components are both small by metric metric tolerance */
    get isAlmostZero(): boolean;
    /** Return the largest absolute value of any component */
    maxAbs(): number;
    /** Return the magnitude of the vector */
    magnitude(): number;
    /** Return the squared magnitude of the vector.  */
    magnitudeSquared(): number;
    /** Returns true if the x,y components are exactly equal. */
    isExactEqual(other: XAndY): boolean;
    /** Returns true if x,y match `other` within metric tolerance */
    isAlmostEqualMetric(other: XAndY, distanceTol?: number): boolean;
    /** Return a (full length) vector from this point to other */
    vectorTo(other: XAndY, result?: Vector2d): Vector2d;
    /** Return a unit vector from this point to other */
    unitVectorTo(other: XAndY, result?: Vector2d): Vector2d | undefined;
    /** Cross product of vectors from origin to targets */
    static crossProductToPoints(origin: XAndY, targetA: XAndY, targetB: XAndY): number;
}
/** 2D point with `x`,`y` as properties
 * @public
 */
export declare class Point2d extends XY implements BeJSONFunctions {
    /** Constructor for Point2d */
    constructor(x?: number, y?: number);
    /** Return a new Point2d with x,y coordinates from this. */
    clone(result?: Point2d): Point2d;
    /**
     * Return a point (newly created unless result provided) with given x,y coordinates
     * @param x x coordinate
     * @param y y coordinate
     * @param result optional result
     */
    static create(x?: number, y?: number, result?: Point2d): Point2d;
    /**
     * Set x and y from a JSON input such as `[1,2]` or `{x:1, y:2}`
     * * If no JSON input is provided, 0 would be used as default values for x and y.
     * @param json the JSON input
     */
    static fromJSON(json?: XYProps): Point2d;
    /** Create (or optionally reuse) a Point2d from another object with fields x and y */
    static createFrom(xy: XAndY | undefined, result?: Point2d): Point2d;
    /** Create a Point2d with both coordinates zero. */
    static createZero(result?: Point2d): Point2d;
    /**
     * Starting at this point, move along `vector` by `tangentFraction` of its length, and then
     * by `leftFraction` of its length along the left perpendicular.
     * @param tangentFraction distance to move along `vector`, as a fraction of its length
     * @param leftFraction distance to move perpendicular to `vector`, as a fraction of its length
     * @param vector the other vector
     */
    addForwardLeft(tangentFraction: number, leftFraction: number, vector: Vector2d, result?: Point2d): Point2d;
    /**
     * Interpolate at tangentFraction between this instance and point, and then Move by leftFraction
     * along the xy perpendicular of the vector between the points.
     */
    forwardLeftInterpolate(tangentFraction: number, leftFraction: number, point: XAndY): Point2d;
    /** Return a point interpolated between this point and the right param. */
    interpolate(fraction: number, other: XAndY, result?: Point2d): Point2d;
    /** Return a point with independent x,y fractional interpolation. */
    interpolateXY(fractionX: number, fractionY: number, other: XAndY, result?: Point2d): Point2d;
    /** Return this point minus vector */
    minus(vector: XAndY, result?: Point2d): Point2d;
    /** Return point plus vector */
    plus(vector: XAndY, result?: Point2d): Point2d;
    /** Return point plus vector */
    plusXY(dx?: number, dy?: number, result?: Point2d): Point2d;
    /** Return point + vector * scalar */
    plusScaled(vector: XAndY, scaleFactor: number, result?: Point2d): Point2d;
    /** Return point + vectorA * scalarA + vectorB * scalarB */
    plus2Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, result?: Point2d): Point2d;
    /** Return point + vectorA * scalarA + vectorB * scalarB + vectorC * scalarC */
    plus3Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, vectorC: XAndY, scalarC: number, result?: Point2d): Point2d;
    /**
     * Return the dot product of vector from this to targetA and vector from this to targetB
     * @param targetA target of first vector
     * @param targetB target of second vector
     */
    dotVectorsToTargets(targetA: XAndY, targetB: XAndY): number;
    /**
     * Returns the (scalar) cross product of vector from this to targetA and vector from this to targetB
     * @param target1 target of first vector
     * @param target2 target of second vector
     */
    crossProductToPoints(target1: XAndY, target2: XAndY): number;
    /**
     * Return the fractional coordinate of the projection of this instance x,y onto the
     * line from startPoint to endPoint.
     * @param startPoint start point of line
     * @param endPoint end point of line
     * @param defaultFraction fraction to return if startPoint and endPoint are equal.
     */
    fractionOfProjectionToLine(startPoint: Point2d, endPoint: Point2d, defaultFraction?: number): number;
}
/**
 * 2D vector with `x`,`y` as properties
 * @public
 */
export declare class Vector2d extends XY implements BeJSONFunctions {
    constructor(x?: number, y?: number);
    /** Return a new Vector2d with the same x,y */
    clone(result?: Vector2d): Vector2d;
    /** Return a new Vector2d with given x and y */
    static create(x?: number, y?: number, result?: Vector2d): Vector2d;
    /**
     * Return a (new) Vector2d with components scale,0
     * If scale is not given default value 1 is used.
     */
    static unitX(scale?: number): Vector2d;
    /**
     * Return a (new) Vector2d with components 0,scale
     * If scale is not given default value 1 is used.
     */
    static unitY(scale?: number): Vector2d;
    /** Return a Vector2d with components 0,0 */
    static createZero(result?: Vector2d): Vector2d;
    /** Copy contents from another Point3d, Point2d, Vector2d, or Vector3d, or leading entries of Float64Array */
    static createFrom(data: XAndY | Float64Array, result?: Vector2d): Vector2d;
    /**
     * Set x and y from a JSON input such as `[1,2]` or `{x:1, y:2}`
     * * If no JSON input is provided, 0 would be used as default values for x and y.
     * @param json the JSON input
     */
    static fromJSON(json?: XYProps): Vector2d;
    /** Return a new Vector2d from polar coordinates for radius and Angle from x axis */
    static createPolar(r: number, theta: Angle): Vector2d;
    /** Return a new Vector2d extending from point0 to point1 */
    static createStartEnd(point0: XAndY, point1: XAndY, result?: Vector2d): Vector2d;
    /**
     * Return a vector that bisects the angle between two normals and extends to the intersection of two offset lines
     * * returns `undefined` if `unitPerpA = -unitPerpB` (i.e., are opposite)
     * * math details can be found at docs/learning/geometry/PointVector.md
     * @param unitPerpA unit perpendicular to incoming direction
     * @param unitPerpB  unit perpendicular to outgoing direction
     * @param offset offset distance
     */
    static createOffsetBisector(unitPerpA: Vector2d, unitPerpB: Vector2d, offset: number): Vector2d | undefined;
    /**
     * Return a (new or optionally reused) vector which is `this` divided by `denominator`
     * * return undefined if denominator is zero.
     */
    safeDivideOrNull(denominator: number, result?: Vector2d): Vector2d | undefined;
    /** Return a unit vector in direction of this instance (undefined if this instance has near zero length) */
    normalize(result?: Vector2d): Vector2d | undefined;
    /**
     * Return fractional length of the projection of the instance onto the target vector.
     * @param target the target vector
     * @param defaultFraction the returned value in case the magnitude of `target` is too small
     * @returns the signed length of the projection divided by the length of `target`
     */
    fractionOfProjectionToVector(target: Vector2d, defaultFraction?: number): number;
    /** Return a new vector with components negated from this instance. */
    negate(result?: Vector2d): Vector2d;
    /** Return a vector same length as this but rotated 90 degrees counter clockwise */
    rotate90CCWXY(result?: Vector2d): Vector2d;
    /** Return a vector same length as this but rotated 90 degrees clockwise */
    rotate90CWXY(result?: Vector2d): Vector2d;
    /** Return a unit vector perpendicular to this instance. */
    unitPerpendicularXY(result?: Vector2d): Vector2d;
    /** Return a new Vector2d rotated CCW by given angle */
    rotateXY(angle: Angle, result?: Vector2d): Vector2d;
    /**
     * Return a vector computed at fractional position between this vector and vectorB
     * @param fraction fractional position.  0 is at `this`.  1 is at `vectorB`.
     *                 True fractions are "between", negatives are "before this", beyond 1 is "beyond vectorB".
     * @param vectorB second vector
     * @param result optional preallocated result.
     */
    interpolate(fraction: number, vectorB: Vector2d, result?: Vector2d): Vector2d;
    /** Return {this + vector}. */
    plus(vector: XAndY, result?: Vector2d): Vector2d;
    /** Return {this - vector}. */
    minus(vector: XAndY, result?: Vector2d): Vector2d;
    /** Return {point + vector \* scalar} */
    plusScaled(vector: XAndY, scaleFactor: number, result?: Vector2d): Vector2d;
    /** Return {point + vectorA \* scalarA + vectorB \* scalarB} */
    plus2Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, result?: Vector2d): Vector2d;
    /** Return {this + vectorA \* scalarA + vectorB \* scalarB + vectorC \* scalarC} */
    plus3Scaled(vectorA: XAndY, scalarA: number, vectorB: XAndY, scalarB: number, vectorC: XAndY, scalarC: number, result?: Vector2d): Vector2d;
    /** Return {this * scale} */
    scale(scale: number, result?: Vector2d): Vector2d;
    /** Return a vector parallel to this but with specified length */
    scaleToLength(length: number, result?: Vector2d): Vector2d | undefined;
    /** Return the dot product of this with vectorB */
    dotProduct(vectorB: XAndY): number;
    /** Dot product with vector from pointA to pointB */
    dotProductStartEnd(pointA: XAndY, pointB: XAndY): number;
    /** Vector cross product {this CROSS vectorB} */
    crossProduct(vectorB: XAndY): number;
    /**
     * Return the radians (as a simple number, not strongly typed Angle) signed angle from this to vectorB.
     * This is positive if the shortest turn is counterclockwise, negative if clockwise.
     */
    radiansTo(vectorB: XAndY): number;
    /**
     * Return the (strongly typed) signed angle from this to vectorB.
     * This is positive if the shortest turn is counterclockwise, negative if clockwise.
     */
    angleTo(vectorB: XAndY): Angle;
    /**
     * Test if this vector is parallel to other.
     * * The input tolerances in `options`, if given, are considered to be squared for efficiency's sake,
     * so if you have a distance or angle tolerance t, you should pass in t * t.
     * @param other second vector for comparison.
     * @param oppositeIsParallel whether to consider diametrically opposed vectors as parallel.
     * @param options optional radian and distance tolerances.
     */
    isParallelTo(other: Vector2d, oppositeIsParallel?: boolean, returnValueIfAnInputIsZeroLength?: boolean, options?: PerpParallelOptions): boolean;
    /**
     * Test if this vector is perpendicular to other.
     * * The input tolerances in `options`, if given, are considered to be squared for efficiency's sake,
     * so if you have a distance or angle tolerance t, you should pass in t * t.
     * @param other second vector in comparison.
     * @param returnValueIfAnInputIsZeroLength if either vector is near zero length, return this value.
     * @param options optional radian and distance tolerances.
     */
    isPerpendicularTo(other: Vector2d, returnValueIfAnInputIsZeroLength?: boolean, options?: PerpParallelOptions): boolean;
}
