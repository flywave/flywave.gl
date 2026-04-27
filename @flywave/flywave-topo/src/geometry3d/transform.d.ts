import { type BeJSONFunctions, AxisOrder } from "../geometry";
import { Point4d } from "../geometry4d/point4d";
import { Matrix3d } from "./matrix3d";
import { Point2d } from "./point2d-vector2d";
import { type XYZ, Point3d, Vector3d } from "./point3d-vector3d";
import { Range3d } from "./range";
import { type TransformProps, type XAndY, type XYAndZ } from "./xyz-props";
/**
 * A Transform consists of an origin and a Matrix3d. This describes a coordinate frame with this origin, with
 * the columns of the Matrix3d being the local x,y,z axis directions.
 * * The math for a Transform `T` consisting of a Matrix3d `M` and a Point3d `o` on a Vector3d `p` is: `Tp = M*p + o`.
 * In other words, `T` is a combination of two operations on `p`: the action of matrix multiplication, followed by a
 * translation. `Origin` is a traditional term for `o`, because `T` can be interpreted as a change of basis from the
 * global axes centered at the global origin, to a new set of axes specified by matrix M columns centered at `o`.
 * * Beware that for common transformations (e.g. scale about point, rotate around an axis) the `fixed point` that
 * is used when describing the transform is NOT the `origin` stored in the transform. Setup methods (e.g
 * createFixedPointAndMatrix, createScaleAboutPoint) take care of determining the appropriate origin coordinates.
 * * If `T` is a translation, no point is fixed by `T`.
 * * If `T` is the identity, all points are fixed by `T`.
 * * If `T` is a scale about a point, one point is fixed by `T`.
 * * If `T` is a rotation about an axis, a line is fixed by `T`.
 * * If `T` is a projection to the plane, a plane is fixed by `T`.
 * @public
 */
export declare class Transform implements BeJSONFunctions {
    private _origin;
    private _matrix;
    private constructor();
    private static _identity?;
    /** The identity Transform. Value is frozen and cannot be modified. */
    static get identity(): Transform;
    /** Freeze this instance (and its members) so it is read-only */
    freeze(): Readonly<this>;
    /**
     * Copy contents from other Transform into this Transform
     * @param other source transform
     */
    setFrom(other: Transform): void;
    /** Set this Transform to be an identity. */
    setIdentity(): void;
    toArray(): number[];
    /**
     * Set this Transform instance from flexible inputs:
     * * Any object (such as another Transform or TransformProps) that has `origin` and `matrix` members
     * accepted by `Point3d.setFromJSON` and `Matrix3d.setFromJSON`
     * * An array of 3 number arrays, each with 4 entries which are rows in a 3x4 matrix.
     * * An array of 12 numbers, each block of 4 entries as a row 3x4 matrix.
     * * If no input is provided, the identity Transform is returned.
     */
    setFromJSON(json?: TransformProps | Transform): void;
    /**
     * Test for near equality with `other` Transform. Comparison uses the `isAlmostEqual` methods on the `origin` and
     * `matrix` parts.
     * @param other Transform to compare to.
     */
    isAlmostEqual(other: Readonly<Transform>): boolean;
    /**
     * Test for near equality with `other` Transform. Comparison uses the `isAlmostEqual` methods on the `origin` part
     * and the `isAlmostEqualAllowZRotation` method on the `matrix` part.
     * @param other Transform to compare to.
     */
    isAlmostEqualAllowZRotation(other: Transform): boolean;
    /**
     * Return a 3 by 4 matrix containing the rows of this Transform.
     * * The transform's origin coordinates are the last entries of the 3 json arrays
     */
    toRows(): number[][];
    /**
     * Return a 3 by 4 matrix containing the rows of this Transform.
     * * The transform's origin coordinates are the last entries of the 3 json arrays
     */
    toJSON(): TransformProps;
    /** Return a new Transform initialized by `Transform.setFromJSON` */
    static fromJSON(json?: TransformProps): Transform;
    /** Copy the contents of `this` transform into a new Transform (or to the result, if specified). */
    clone(result?: Transform): Transform;
    /**
     * Return a modified copy of `this` Transform so that its `matrix` part is rigid (`origin` part is untouched).
     * * @see [[Matrix3d.axisOrderCrossProductsInPlace]] documentation for details of how the matrix is modified to rigid.
     */
    cloneRigid(axisOrder?: AxisOrder): Transform | undefined;
    /** Create a Transform with the given `origin` and `matrix`. Inputs are captured, not cloned. */
    static createRefs(origin: XYZ | undefined, matrix: Matrix3d, result?: Transform): Transform;
    /** Create a Transform with complete contents given. `q` inputs make the matrix and `a` inputs make the origin */
    static createRowValues(qxx: number, qxy: number, qxz: number, ax: number, qyx: number, qyy: number, qyz: number, ay: number, qzx: number, qzy: number, qzz: number, az: number, result?: Transform): Transform;
    /** Create a Transform with all zeros */
    static createZero(result?: Transform): Transform;
    /**
     * Create a Transform with translation provided by x,y,z parts.
     * * Translation Transform maps any vector `v` to `v + p` where `p = (x,y,z)`
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/CubeTransform
     * @param x x part of translation
     * @param y y part of translation
     * @param z z part of translation
     * @param result optional pre-allocated Transform
     * @returns new or updated transform
     */
    static createTranslationXYZ(x?: number, y?: number, z?: number, result?: Transform): Transform;
    /**
     * Create a Transform with specified `translation` part.
     * * Translation Transform maps any vector `v` to `v + translation`
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/CubeTransform
     * @param translation x,y,z parts of the translation
     * @param result optional pre-allocated Transform
     * @returns new or updated transform
     */
    static createTranslation(translation: XYZ, result?: Transform): Transform;
    /** Return a reference (and NOT a copy) to the `matrix` part of the Transform. */
    get matrix(): Matrix3d;
    /** Return a reference (and NOT a copy) to the `origin` part of the Transform. */
    get origin(): XYZ;
    /** return a (clone of) the `origin` part of the Transform, as a `Point3d` */
    getOrigin(): Point3d;
    /** return a (clone of) the `origin` part of the Transform, as a `Vector3d` */
    getTranslation(): Vector3d;
    /** return a (clone of) the `matrix` part of the Transform, as a `Matrix3d` */
    getMatrix(): Matrix3d;
    /** test if the transform has `origin` = (0,0,0) and identity `matrix` */
    get isIdentity(): boolean;
    /** Create an identity transform */
    static createIdentity(result?: Transform): Transform;
    /**
     * Create a Transform using the given `origin` and `matrix`.
     * * This is a the appropriate construction when the columns of the matrix are coordinate axes of a
     * local-to-world mapping.
     * * This function is a closely related to `createFixedPointAndMatrix` whose point input is the fixed point
     * of the world-to-world transformation.
     * * If origin is `undefined`, (0,0,0) is used. If matrix is `undefined` the identity matrix is used.
     */
    static createOriginAndMatrix(origin: XYZ | undefined, matrix: Matrix3d | undefined, result?: Transform): Transform;
    /** Create a Transform using the given `origin` and columns of the `matrix`. If `undefined` zero is used. */
    setOriginAndMatrixColumns(origin: XYZ | undefined, vectorX: Vector3d | undefined, vectorY: Vector3d | undefined, vectorZ: Vector3d | undefined): void;
    /** Create a Transform using the given `origin` and columns of the `matrix` */
    static createOriginAndMatrixColumns(origin: XYZ, vectorX: Vector3d, vectorY: Vector3d, vectorZ: Vector3d, result?: Transform): Transform;
    /**
     * Create a Transform such that its `matrix` part is rigid.
     * @see [[Matrix3d.createRigidFromColumns]] for details of how the matrix is created to be rigid.
     */
    static createRigidFromOriginAndColumns(origin: XYZ | undefined, vectorX: Vector3d, vectorY: Vector3d, axisOrder: AxisOrder, result?: Transform): Transform | undefined;
    /**
     * Create a Transform with the specified `matrix`. Compute an `origin` (different from the given `fixedPoint`)
     * so that the `fixedPoint` maps back to itself. The returned Transform, transforms a point `p` to `M*p + (f - M*f)`
     * where `f` is the fixedPoint (i.e., `Tp = M*(p-f) + f`).
     */
    static createFixedPointAndMatrix(fixedPoint: XYAndZ | undefined, matrix: Matrix3d, result?: Transform): Transform;
    /**
     * Create a transform with the specified `matrix` and points `a` and `b`. The returned Transform maps
     * point `p` to `M*(p-a) + b` (i.e., `Tp = M*(p-a) + b`), so maps `a` to 'b'.
     */
    static createMatrixPickupPutdown(matrix: Matrix3d, a: Point3d, b: Point3d, result?: Transform): Transform;
    /**
     * Create a Transform which leaves the fixedPoint unchanged and scales everything else around it by
     * a single scale factor. The returned Transform maps a point `p` to `M*p + (f - M*f)`
     * where `f` is the fixedPoint and M is the scale matrix (i.e., `Tp = M*(p-f) + f`).
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/CubeTransform
     */
    static createScaleAboutPoint(fixedPoint: Point3d, scale: number, result?: Transform): Transform;
    /**
     * Return a transformation which flattens space onto a plane, sweeping along a direction which may be different from the plane normal.
     * @param sweepVector vector for the sweep direction
     * @param planePoint any point on the plane
     * @param planeNormal vector normal to the plane.
     */
    static createFlattenAlongVectorToPlane(sweepVector: Vector3d, planePoint: XYAndZ, planeNormal: Vector3d): Transform | undefined;
    /**
     * Transform the input 2d point (using `Tp = M*p + o`).
     * Return as a new point or in the pre-allocated result (if result is given).
     */
    multiplyPoint2d(point: XAndY, result?: Point2d): Point2d;
    /**
     * Transform the input 3d point (using `Tp = M*p + o`).
     * Return as a new point or in the pre-allocated result (if result is given).
     */
    multiplyPoint3d(point: XYAndZ, result?: Point3d): Point3d;
    /**
     * Transform the input 3d point in place (using `Tp = M*p + o`).
     * Return as a new point or in the pre-allocated result (if result is given).
     */
    multiplyXYAndZInPlace(point: XYAndZ): void;
    /**
     * Transform the input 3d point (using `Tp = M*p + o`).
     * Return as a new point or in the pre-allocated result (if result is given).
     */
    multiplyXYZ(x: number, y: number, z?: number, result?: Point3d): Point3d;
    /**
     * Multiply a specific row (component) of the 3x4 instance times (x,y,z,1). Return the result.
     */
    multiplyComponentXYZ(componentIndex: number, x: number, y: number, z?: number): number;
    /**
     * Multiply a specific row (component) of the 3x4 instance times (x,y,z,w). Return the result.
     */
    multiplyComponentXYZW(componentIndex: number, x: number, y: number, z: number, w: number): number;
    /**
     * Transform the homogeneous point. Return as a new `Point4d`, or in the pre-allocated result (if result is given).
     * * If `p = (x,y,z)` then this method computes `Tp = M*p + o*w` and returns the `Point4d` formed by `Tp` in the
     * first three coordinates, and `w` in the fourth.
     * * Logically, this is multiplication by the 4x4 matrix formed from the 3x4 instance augmented with fourth row 0001.
     */
    multiplyXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
    /**
     * Transform the homogeneous point. Return as new `Float64Array` with size 4, or in the pre-allocated result (if
     * result is given).
     * * If `p = (x,y,z)` then this method computes `Tp = M*p + o*w` and returns the `Float64Array` formed by `Tp`
     * in the first 3 numbers of the array and `w` as the fourth.
     * * Logically, this is multiplication by the 4x4 matrix formed from the 3x4 instance augmented with fourth row 0001.
     */
    multiplyXYZWToFloat64Array(x: number, y: number, z: number, w: number, result?: Float64Array): Float64Array;
    /**
     * * Transform the point. Return as new `Float64Array` with size 3, or in the pre-allocated result (if result is given).
     * * If `p = (x,y,z)` then this method computes `Tp = M*p + o` and returns it as the first 3 elements of the array.
     */
    multiplyXYZToFloat64Array(x: number, y: number, z: number, result?: Float64Array): Float64Array;
    /**
     * Multiply the homogeneous point by the transpose of `this` Transform. Return as a new `Point4d` or in the
     * pre-allocated result (if result is given).
     * * If `p = (x,y,z)` then this method computes `M^t*p` and returns it in the first three coordinates of the `Point4d`,
     * and `o*p + w` in the fourth.
     * * Logically, this is multiplication by the transpose of the 4x4 matrix formed from the 3x4 instance augmented with
     * fourth row 0001.
     */
    multiplyTransposeXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
    /** For each point in the array, replace point by the transformed point (using `Tp = M*p + o`) */
    multiplyPoint3dArrayInPlace(points: Point3d[]): void;
    /** For each point in the 2d array, replace point by the transformed point (using `Tp = M*p + o`) */
    multiplyPoint3dArrayArrayInPlace(chains: Point3d[][]): void;
    /**
     * Multiply the point by the inverse Transform.
     * * If for a point `p` we have `Tp = M*p + o = q`, then `p = MInverse*(q - o) = TInverse q` so `TInverse`
     * Transform has matrix part `MInverse` and origin part `-MInverse*o`.
     * * Return as a new point or in the optional `result`.
     * * Returns `undefined` if the `matrix` part if this Transform is singular.
     */
    multiplyInversePoint3d(point: XYAndZ, result?: Point3d): Point3d | undefined;
    /**
     * Multiply the homogenous point by the inverse Transform.
     * * If for a point `p` we have `Tp = M*p + o = q`, then `p = MInverse*(q - o) = TInverse q` so `TInverse` Transform
     * has matrix part `MInverse` and origin part `-MInverse*o`.
     * * This method computes `TInverse p = MInverse*p - w*MInverse*o` and returns the `Point4d` formed by `TInverse*p`
     * in the first three coordinates, and `w` in the fourth.
     * * Logically, this is multiplication by the inverse of the 4x4 matrix formed from the 3x4 instance augmented with
     * fourth row 0001. This is equivalent to the 4x4 matrix formed in similar fashion from the inverse of this instance.
     * * Return as a new point or in the optional `result`.
     * * Returns `undefined` if the `matrix` part if this Transform is singular.
     */
    multiplyInversePoint4d(weightedPoint: Point4d, result?: Point4d): Point4d | undefined;
    /**
     * Multiply the point by the inverse Transform.
     * * If for a point `p` we have `Tp = M*p + o = q`, then `p = MInverse*(q - o) = TInverse q` so `TInverse` Transform
     * has matrix part `MInverse` and origin part `-MInverse*o`.
     * * Return as a new point or in the optional `result`.
     * * Returns `undefined` if the `matrix` part if this Transform is singular.
     */
    multiplyInverseXYZ(x: number, y: number, z: number, result?: Point3d): Point3d | undefined;
    /**
     * * Compute (if needed) the inverse of the `matrix` part of the Transform, thereby ensuring inverse
     * operations can complete.
     * @param useCached If true, accept prior cached inverse if available.
     * @returns `true` if matrix inverse completes, `false` otherwise.
     */
    computeCachedInverse(useCached?: boolean): boolean;
    /**
     * Match the length of destination array with the length of source array
     * * If destination has more elements than source, remove the extra elements.
     * * If destination has fewer elements than source, use `constructionFunction` to create new elements.
     * *
     * @param source the source array
     * @param dest the destination array
     * @param constructionFunction function to call to create new elements.
     */
    static matchArrayLengths(source: any[], dest: any[], constructionFunction: () => any): number;
    /**
     * Multiply each point in the array by the inverse of `this` Transform.
     * * For a transform `T = [M o]` the inverse transform `T' = [M' -M'o]` exists if and only if `M` has an inverse
     * `M'`. Indeed, for any point `p`, we have `T'Tp = T'(Mp + o) = M'(Mp + o) - M'o = M'Mp + M'o - M'o = p.`
     * * If `result` is given, resize it to match the input `points` array and update it with original points `p[]`.
     * * If `result` is not given, return a new array.
     * * Returns `undefined` if the `matrix` part if this Transform is singular.
     */
    multiplyInversePoint3dArray(points: Point3d[], result?: Point3d[]): Point3d[] | undefined;
    /**
     * Multiply each point in the array by the inverse of `this` Transform in place.
     * * For a transform `T = [M o]` the inverse transform `T' = [M' -M'o]` exists if and only if `M` has an inverse
     * `M'`. Indeed, for any point `p`, we have `T'Tp = T'(Mp + o) = M'(Mp + o) - M'o = M'Mp + M'o - M'o = p.`
     * * Returns `true` if the `matrix` part if this Transform is invertible and `false` if singular.
     */
    multiplyInversePoint3dArrayInPlace(points: Point3d[]): boolean;
    /**
     * Transform the input 2d point array (using `Tp = M*p + o`).
     * * If `result` is given, resize it to match the input `points` array and update it with transformed points.
     * * If `result` is not given, return a new array.
     */
    multiplyPoint2dArray(points: Point2d[], result?: Point2d[]): Point2d[];
    /**
     * Transform the input 3d point array (using `Tp = M*p + o`).
     * * If `result` is given, resize it to match the input `points` array and update it with transformed points.
     * * If `result` is not given, return a new array.
     */
    multiplyPoint3dArray(points: Point3d[], result?: Point3d[]): Point3d[];
    /**
     * Multiply the vector by the `matrix` part of the Transform.
     * * The `origin` part of Transform is not used.
     * * If `result` is given, update it with the multiplication. Otherwise, create a new Vector3d.
     */
    multiplyVector(vector: Vector3d, result?: Vector3d): Vector3d;
    /**
     * Multiply the vector by the `matrix` part of the Transform in place.
     * * The `origin` part of Transform is not used.
     */
    multiplyVectorInPlace(vector: Vector3d): void;
    /**
     * Multiply the vector (x,y,z) by the `matrix` part of the Transform.
     * * The `origin` part of Transform is not used.
     * * If `result` is given, update it with the multiplication. Otherwise, create a new Vector3d.
     */
    multiplyVectorXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
    /**
     * Calculate `transformA * transformB` and store it into the calling instance (`this`).
     * * **Note:** If `transformA = [A   a]` and `transformB = [B   b]` then `transformA * transformB` is defined as
     * `[A*B   Ab+a]`.
     * * @see [[multiplyTransformTransform]] documentation for math details.
     * @param transformA first operand
     * @param transformB second operand
     */
    setMultiplyTransformTransform(transformA: Transform, transformB: Transform): void;
    /**
     * Multiply `this` Transform times `other` Transform.
     * * **Note:** If `this = [A   a]` and `other = [B   b]` then `this * other` is defined as [A*B   Ab+a] because:
     * ```
     * equation
     * \begin{matrix}
     *    \text{this Transform with matrix part }\bold{A}\text{ and origin part }\bold{a} & \blockTransform{A}{a}\\
     *    \text{other Transform with matrix part }\bold{B}\text{ and origin part }\bold{b} & \blockTransform{B}{b} \\
     * \text{product}& \blockTransform{A}{a}\blockTransform{B}{b}=\blockTransform{AB}{Ab + a}
     * \end{matrix}
     * ```
     * @param other the 'other` Transform to be multiplied to `this` Transform.
     * @param result optional preallocated `result` to reuse.
     */
    multiplyTransformTransform(other: Transform, result?: Transform): Transform;
    /**
     * Multiply `this` Transform times `other` Matrix3d (considered to be a Transform with 0 `origin`).
     * * **Note:** If `this = [A   a]` and `other = [B   0]`, then `this * other` is defined as [A*B   a] because:
     * ```
     * equation
     * \begin{matrix}
     *    \text{this Transform with matrix part }\bold{A}\text{ and origin part }\bold{a} & \blockTransform{A}{a}\\
     *    \text{other matrix }\bold{B}\text{ promoted to block Transform} & \blockTransform{B}{0} \\
     * \text{product}& \blockTransform{A}{a}\blockTransform{B}{0}=\blockTransform{AB}{a}
     * \end{matrix}
     * ```
     * @param other the `other` Matrix3d to be multiplied to `this` Transform.
     * @param result optional preallocated `result` to reuse.
     */
    multiplyTransformMatrix3d(other: Matrix3d, result?: Transform): Transform;
    /**
     * Return the range of the transformed corners.
     * * The 8 corners are transformed individually.
     * * **Note:** Suppose you have a geometry, a range box around that geometry, and your Transform is a rotation.
     * If you rotate the range box and recompute a new range box around the rotated range box, then the new range
     * box will have a larger volume than the original range box. However, if you rotate the geometry itself and
     * then recompute the range box, it will be a tighter range box around the rotated geometry. `multiplyRange`
     * function creates the larger range box because it only has access to the range box and not the geometry itself.
     */
    multiplyRange(range: Range3d, result?: Range3d): Range3d;
    /**
     * Return a Transform which is the inverse of `this` Transform.
     * * If `transform = [M   o]` then `transformInverse = [MInverse   -MInverse*o]`
     * * Return `undefined` if this Transform's matrix is singular.
     */
    inverse(result?: Transform): Transform | undefined;
    /**
     * Initialize 2 Transforms that map between the unit box (specified by 000 and 111) and the range box specified
     * by the input points.
     * @param min the min corner of the range box
     * @param max the max corner of the range box
     * @param npcToGlobal maps NPC coordinates into range box coordinates. Specifically, maps 000 to `min` and maps
     * 111 to `max`. This Transform is the inverse of `globalToNpc`. Object created by caller, re-initialized here.
     * @param globalToNpc maps range box coordinates into NPC coordinates. Specifically, maps `min` to 000 and maps
     * `max` to 111. This Transform is the inverse of `npcToGlobal`. Object created by caller, re-initialized here.
     * * NPC stands for `Normalized Projection Coordinate`
     */
    static initFromRange(min: Point3d, max: Point3d, npcToGlobal?: Transform, globalToNpc?: Transform): void;
}
