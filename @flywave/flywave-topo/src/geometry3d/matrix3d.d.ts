import { type BeJSONFunctions, AxisIndex, AxisOrder, StandardViewIndex } from "../geometry";
import { Point4d } from "../geometry4d/point4d";
import { Angle } from "./angle";
import { Point2d } from "./point2d-vector2d";
import { type XYZ, Point3d, Vector3d } from "./point3d-vector3d";
import { Transform } from "./transform";
import { type Matrix3dProps, type WritableXYAndZ, type XAndY, type XYAndZ } from "./xyz-props";
/**
 * PackedMatrix3dOps contains static methods for matrix operations where the matrix is a Float64Array.
 * * The Float64Array contains the matrix entries in row-major order
 * @internal
 * ```
 * equation
 * \newcommand[1]\mij{#1_{00}\ #1_{01}\ a_{02}}
 * ```
 */
export declare class PackedMatrix3dOps {
    /**
     * Load 9 doubles into the packed format.
     * @param dest destination, allocated by caller
     * @param a00 row 0, column 0 entry
     * @param a01 row 0, column 1 entry
     * @param a02 row 0, column 2 entry
     * @param a10 row 1, column 0 entry
     * @param a11 row 1, column 1 entry
     * @param a12 row 1, column 2 entry
     * @param a20 row 2, column 0 entry
     * @param a21 row 2, column 1 entry
     * @param a22 row 2, column 2 entry
     */
    static loadMatrix(dest: Float64Array, a00: number, a01: number, a02: number, a10: number, a11: number, a12: number, a20: number, a21: number, a22: number): void;
    /**
     * Multiply 3x3 matrix `a*b`, store in `result`.
     * * All params assumed length 9, allocated by caller.
     * * c may alias either input.
     */
    static multiplyMatrixMatrix(a: Float64Array, b: Float64Array, result?: Float64Array): Float64Array;
    /**
     * Multiply 3x3 matrix `a*bTranspose`, store in `result`.
     * * All params assumed length 9, allocated by caller.
     * * c may alias either input.
     */
    static multiplyMatrixMatrixTranspose(a: Float64Array, b: Float64Array, result?: Float64Array): Float64Array;
    /**
     * Multiply 3x3 matrix `aTranspose*b`, store in `result`.
     * * All params assumed length 9, allocated by caller.
     * * c may alias either input.
     */
    static multiplyMatrixTransposeMatrix(a: Float64Array, b: Float64Array, result?: Float64Array): Float64Array;
    /** Transpose 3x3 matrix `a` in place */
    static transposeInPlace(a: Float64Array): void;
    /**
     * Returns the transpose of 3x3 matrix `a`
     * * If `dest` is passed as argument, then the function copies the transpose of 3x3 matrix `a` into `dest`
     * * `a` is not changed unless also passed as the dest, i.e., copyTransposed(a,a) transposes `a` in place
     */
    static copyTransposed(a: Float64Array, dest?: Float64Array): Float64Array;
    /** Copy matrix `a` entries into `dest` */
    static copy(a: Float64Array, dest: Float64Array): Float64Array;
}
/** A Matrix3d is tagged indicating one of the following states:
 * * unknown: it is not know if the matrix is invertible.
 * * inverseStored: the matrix has its inverse stored.
 * * singular: the matrix is known to be singular.
 * @public
 */
export declare enum InverseMatrixState {
    /**
     * The invertibility of the `coffs` array has not been determined.
     * Any `inverseCoffs` contents are random.
     */
    unknown = 0,
    /**
     * An inverse was computed and stored as the `inverseCoffs`
     */
    inverseStored = 1,
    /**
     * The `coffs` array is known to be singular.
     * Any `inverseCoffs` contents are random.
     */
    singular = 2
}
/** A Matrix3d is a 3x3 matrix.
 * * A very common use is to hold a rigid body rotation (which has no scaling or skew), but the 3x3 contents can
 * also hold scaling and skewing.
 * * The matrix with 2-dimensional layout (note: a 2d array can be shown by a matrix)
 * ```
 * equation
 *      \matrixXY{A}
 * ```
 * is stored as 9 numbers in "row-major" order in a `Float64Array`, viz
 * ```
 * equation
 *      \rowMajorMatrixXY{A}
 * ```
 * * If the matrix inverse is known it is stored in the inverseCoffs array.
 * * The inverse status (`unknown`, `inverseStored`, `singular`) status is indicated by the `inverseState` property.
 * * Construction methods that are able to trivially construct the inverse, store it immediately and note that in
 * the inverseState.
 * * Constructions (e.g. createRowValues) for which the inverse is not immediately known mark the inverseState as
 * unknown.
 * * Later queries for the inverse, trigger full computation if needed at that time.
 * * Most matrix queries are present with both "column" and "row" variants.
 * * Usage elsewhere in the library is typically "column" based.  For example, in a Transform that carries a
 * coordinate frame, the matrix columns are the unit vectors for the axes.
 * @public
 */
export declare class Matrix3d implements BeJSONFunctions {
    /** Control flag for whether this class uses cached inverse of matrices. */
    static useCachedInverse: boolean;
    /** Total number of times a cached inverse was used to avoid recompute */
    static numUseCache: number;
    /** Total number of times a cached inverse was computed. */
    static numComputeCache: number;
    /**
     * Matrix contents as a flat array of numbers in row-major order.
     * ```
     * equation
     * \mxy{B}
     * \mij{B}
     * ```
     * * DO NOT directly modify this array. It will destroy safety of the cached inverse state.
     */
    coffs: Float64Array;
    /**
     * Matrix inverse contents.
     * ```
     * equation
     * \mxy{A}
     * ```
     * * DO NOT directly modify this array. It will destroy integrity of the cached inverse state.
     */
    inverseCoffs: Float64Array | undefined;
    /** Indicates if inverse is unknown, available, or known singular */
    inverseState: InverseMatrixState;
    /** The identity matrix */
    private static _identity;
    /** temporary buffer to store a matrix as a Float64Array (array of 9 floats) */
    private static readonly _productBuffer;
    /** The identity Matrix3d. Value is frozen and cannot be modified. */
    static get identity(): Matrix3d;
    /** Freeze this Matrix3d. */
    freeze(): Readonly<this>;
    /**
     * Constructor
     * @param coffs optional coefficient array.
     * * **WARNING:** coffs is captured (i.e., is now owned by the Matrix3d object and can be modified by it).
     */
    constructor(coffs?: Float64Array);
    /**
     * Return a json object containing the 9 numeric entries as a single array in row major order,
     * `[ [1, 2, 3],[ 4, 5, 6], [7, 8, 9] ]`
     */
    toJSON(): Matrix3dProps;
    /**
     * Copy data from various input forms to this matrix.
     * The source can be:
     * * Another `Matrix3d`
     * * An array of 3 arrays, each of which has the 3 numbers for a row of the matrix.
     * * An array of 4 or 9 numbers in row major order.
     * * **WARNING:** if json is an array of numbers but size is not 4 or 9, the matrix is set to zeros.
     */
    setFromJSON(json?: Matrix3dProps | Matrix3d): void;
    /** Return a new Matrix3d constructed from contents of the json value. See `setFromJSON` for layout rules */
    static fromJSON(json?: Matrix3dProps): Matrix3d;
    /**
     * Test if `this` and `other` are within tolerance in all numeric entries.
     * @param tol optional tolerance for comparisons by Geometry.isDistanceWithinTol
     */
    isAlmostEqual(other: Matrix3d, tol?: number): boolean;
    /**
     * Test if `this` and `other` are within tolerance in the column entries specified by `columnIndex`.
     * @param tol optional tolerance for comparisons by Geometry.isDistanceWithinTol
     */
    isAlmostEqualColumn(columnIndex: AxisIndex, other: Matrix3d, tol?: number): boolean;
    /**
     * Test if column (specified by `columnIndex`) entries of `this` and [ax,ay,az] are within tolerance.
     * @param tol optional tolerance for comparisons by Geometry.isDistanceWithinTol
     */
    isAlmostEqualColumnXYZ(columnIndex: AxisIndex, ax: number, ay: number, az: number, tol?: number): boolean;
    /**
     * Test if `this` and `other` have almost equal Z column and have X and Y columns differing only by a
     * rotation of the same angle around that Z.
     * * **WARNING:** X and Y columns have to be perpendicular to Z column in both `this` and `other`.
     * @param tol optional tolerance for comparisons by Geometry.isDistanceWithinTol
     */
    isAlmostEqualAllowZRotation(other: Matrix3d, tol?: number): boolean;
    /** Test for exact (bitwise) equality with other. */
    isExactEqual(other: Matrix3d): boolean;
    /** test if all entries in the z row and column are exact 001, i.e. the matrix only acts in 2d */
    get isXY(): boolean;
    /**
     * If result is not provided, then the method returns a new (zeroed) matrix; otherwise the result is
     * not zeroed first and is just returned as-is.
     */
    private static _create;
    /**
     * Returns a Matrix3d populated by numeric values given in row-major order.
     * Sets all entries in the matrix from call parameters appearing in row-major order, i.e.
     * ```
     * equation
     * \begin{bmatrix}a_{xx}\ a_{xy}\ a_{xz}\\ a_{yx}\ a_{yy}\ a_{yz}\\ a_{zx}\ a_{zy}\ a_{zz}\end{bmatrix}
     * ```
     * @param axx Row x, column x(0, 0) entry
     * @param axy Row x, column y(0, 1) entry
     * @param axz Row x, column z(0, 2) entry
     * @param ayx Row y, column x(1, 0) entry
     * @param ayy Row y, column y(1, 1) entry
     * @param ayz Row y, column z(1, 2) entry
     * @param azx Row z, column x(2, 0) entry
     * @param azy Row z, column y(2, 2) entry
     * @param azz row z, column z(2, 3) entry
     */
    static createRowValues(axx: number, axy: number, axz: number, ayx: number, ayy: number, ayz: number, azx: number, azy: number, azz: number, result?: Matrix3d): Matrix3d;
    /**
     * Create a Matrix3d with caller-supplied coefficients and optional inverse coefficients.
     * * The inputs are captured into (i.e., owned by) the new Matrix3d.
     * * The caller is responsible for validity of the inverse coefficients.
     * @param coffs (required) array of 9 coefficients.
     * @param inverseCoffs (optional) array of 9 coefficients.
     * @returns a Matrix3d populated by a coffs array.
     */
    static createCapture(coffs: Float64Array, inverseCoffs?: Float64Array): Matrix3d;
    /**
     * Create a matrix by distributing vectors to columns in one of 6 orders.
     * @param axisOrder identifies where the columns are placed.
     * @param columnA vector to place in the column specified by first letter in the AxisOrder name.
     * @param columnB vector to place in the column specified by second letter in the AxisOrder name.
     * @param columnC vector to place in the column specified by third letter in the AxisOrder name.
     * @param result optional result matrix3d
     * * Example: If you pass AxisOrder.YZX, then result will be [columnC, columnA, columnB] because
     * first letter Y means columnA should go to the second column, second letter Z means columnB should
     * go to the third column, and third letter X means columnC should go to the first column.
     */
    static createColumnsInAxisOrder(axisOrder: AxisOrder, columnA: Vector3d | undefined, columnB: Vector3d | undefined, columnC: Vector3d | undefined, result?: Matrix3d): Matrix3d;
    /**
     * Create the inverseCoffs member (filled with zeros)
     * This is for use by matrix * matrix multiplications which need to be sure the member is there to be
     * filled with method-specific content.
     */
    private createInverseCoffsWithZeros;
    /**
     * Copy the transpose of the coffs to the inverseCoffs.
     * * Mark the matrix as inverseStored.
     */
    private setupInverseTranspose;
    /**
     * Set all entries in the matrix from call parameters appearing in row-major order.
     * @param axx Row x, column x (0,0) entry
     * @param axy Row x, column y (0,1) entry
     * @param axz Row x, column z (0,2) entry
     * @param ayx Row y, column x (1,0) entry
     * @param ayy Row y, column y (1,1) entry
     * @param ayz Row y, column z (1,2) entry
     * @param azx Row z, column x (2,0) entry
     * @param azy Row z, column y (2,2) entry
     * @param azz row z, column z (2,3) entry
     */
    setRowValues(axx: number, axy: number, axz: number, ayx: number, ayy: number, ayz: number, azx: number, azy: number, azz: number): void;
    /** Set the matrix to an identity. */
    setIdentity(): void;
    /** Set the matrix to all zeros. */
    setZero(): void;
    /** Copy contents from the `other` matrix. If `other` is undefined, use identity matrix. */
    setFrom(other: Matrix3d | undefined): void;
    /**
     * Return a clone of this matrix.
     * * Coefficients are copied.
     * * Inverse coefficients and inverse status are copied if stored by `this`.
     */
    clone(result?: Matrix3d): Matrix3d;
    /**
     * Create a matrix with all zeros.
     * * Note that for geometry transformations "all zeros" is not a useful default state.
     * * Hence, almost always use `createIdentity` for graphics transformations.
     * * "All zeros" is appropriate for summing moment data.
     * ```
     * equation
     * \begin{bmatrix}0 & 0 & 0 \\ 0 & 0 & 0 \\ 0 & 0 & 0\end{bmatrix}
     * ```
     */
    static createZero(): Matrix3d;
    /**
     * Create an identity matrix.
     * * All diagonal entries (xx,yy,zz) are one
     * * All others are zero.
     * * This (rather than "all zeros") is the useful state for most graphics transformations.
     * ```
     * equation
     * \begin{bmatrix}1 & 0 & 0 \\ 0 & 1 & 0 \\ 0 & 0 & 1\end{bmatrix}
     * ```
     *
     */
    static createIdentity(result?: Matrix3d): Matrix3d;
    /**
     * Create a matrix with distinct x,y,z diagonal (scale) entries.
     * ```
     * equation
     * \begin{bmatrix}s_x & 0 & 0 \\ 0 & s_y & 0\\ 0 & 0 & s_z\end{bmatrix}
     * ```
     */
    static createScale(scaleFactorX: number, scaleFactorY: number, scaleFactorZ: number, result?: Matrix3d): Matrix3d;
    /**
     * Create a matrix with uniform scale factors for scale factor "s"
     * ```
     * equation
     * \begin{bmatrix}s & 0 & 0 \\ 0 & s & 0\\ 0 & 0 & s\end{bmatrix}
     * ```
     */
    static createUniformScale(scaleFactor: number): Matrix3d;
    /**
     * Return a vector that is perpendicular to the input `vectorA`.
     * * Among the infinite number of perpendiculars possible, this method favors having one in the xy plane.
     * * Hence, when `vectorA` is close to the Z axis, the returned vector is `vectorA cross -unitY`
     * but when `vectorA` is NOT close to the Z axis, the returned vector is `unitZ cross vectorA`.
     */
    static createPerpendicularVectorFavorXYPlane(vectorA: Vector3d, result?: Vector3d): Vector3d;
    /**
     * Return a vector that is perpendicular to the input `vectorA`.
     * * Among the infinite number of perpendiculars possible, this method favors having one near the plane
     * containing Z.
     * That is achieved by cross product of `this` vector with the result of createPerpendicularVectorFavorXYPlane.
     */
    static createPerpendicularVectorFavorPlaneContainingZ(vectorA: Vector3d, result?: Vector3d): Vector3d;
    /**
     * Create a matrix from column vectors, shuffled into place per axisOrder
     * * For example, if axisOrder = XYZ then it returns [vectorU, vectorV, vectorW]
     * * Another example, if axisOrder = YZX then it returns [vectorW, vectorU, vectorV] because
     * Y is at index 0 so vectorU goes to the column Y (column 2), Z is at index 1 so vectorV goes
     * to the column Z (column 3), and X is at index 2 so vectorW goes to the column X (column 1)
     */
    static createShuffledColumns(vectorU: Vector3d, vectorV: Vector3d, vectorW: Vector3d, axisOrder: AxisOrder, result?: Matrix3d): Matrix3d;
    /**
     * Create a new orthogonal matrix (perpendicular columns, unit length, transpose is inverse).
     * * `vectorA1 = Normalized vectorA` is placed in the column specified by **first** letter in
     * the AxisOrder name.
     * * Normalized `vectorC1 = vectorA1 cross vectorB` is placed in the column specified by **third**
     * letter in the AxisOrder name.
     * * Normalized  `vectorC1 cross vectorA` is placed in the column specified by **second**
     * letter in the AxisOrder name.
     * * This function internally uses createShuffledColumns.
     */
    static createRigidFromColumns(vectorA: Vector3d, vectorB: Vector3d, axisOrder: AxisOrder, result?: Matrix3d): Matrix3d | undefined;
    /**
     * Construct a rigid matrix (orthogonal matrix with +1 determinant) using vectorA and its 2 perpendicular.
     * * If axisOrder is not passed then `AxisOrder = AxisOrder.ZXY` is used as default.
     * * This function internally uses createPerpendicularVectorFavorXYPlane and createRigidFromColumns.
     * * If you want to rotate a given plane (which contains (0,0,0)) to the xy-plane, pass the normal vector of
     * your plane into createRigidHeadsUp. The transpose of the returned Matrix3d can be used to rotate your plane
     * to the xy-plane. If plane does not contain (0,0,0) then the plane is rotated to a plane parallel to the xy-plane.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/2PerpendicularVectorsTo1Vector
     */
    static createRigidHeadsUp(vectorA: Vector3d, axisOrder?: AxisOrder, result?: Matrix3d): Matrix3d;
    /**
     * Return the matrix for rotation of `angle` around desired `axis`
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/CubeRotationAroundAnAxis
     * @param axis the axis of rotation
     * @param angle the angle of rotation
     * @param result caller-allocated matrix (optional)
     * @returns the `rotation matrix` or `undefined` (if axis magnitude is near zero).
     */
    static createRotationAroundVector(axis: Vector3d, angle: Angle, result?: Matrix3d): Matrix3d | undefined;
    /** Returns a rotation of specified angle around one of the main axis (X,Y,Z).
     * @param axisIndex index of axis (AxisIndex.X, AxisIndex.Y, AxisIndex.Z) kept fixed by the rotation.
     * @param angle angle of rotation
     * @param result optional result matrix.
     * * Math details of 3d rotation matrices derivation can be found at docs/learning/geometry/Angle.md
     */
    static createRotationAroundAxisIndex(axisIndex: AxisIndex, angle: Angle, result?: Matrix3d): Matrix3d;
    /**
     * Replace current rows Ui and Uj with (c*Ui + s*Uj) and (c*Uj - s*Ui).
     * * There is no checking for i,j being 0,1,2.
     * * The instance matrix A is multiplied in place on the left by a Givens rotation G, resulting in the matrix G*A.
     * @param i first row index. **must be 0,1,2** (unchecked)
     * @param j second row index. **must be 0,1,2** (unchecked)
     * @param c fist coefficient
     * @param s second coefficient
     */
    private applyGivensRowOp;
    /**
     * Replace current columns Ui and Uj with (c*Ui + s*Uj) and (c*Uj - s*Ui).
     * * There is no checking for i,j being 0,1,2.
     * * The instance matrix A is multiplied in place on the right by a Givens rotation G, resulting in the matrix A*G.
     * * This is used in compute intensive inner loops
     * @param i first row index. **must be 0,1,2** (unchecked)
     * @param j second row index. **must be 0,1,2** (unchecked)
     * @param c fist coefficient
     * @param s second coefficient
     */
    applyGivensColumnOp(i: number, j: number, c: number, s: number): void;
    /**
     * Create a matrix from column vectors.
     * ```
     * equation
     * \begin{bmatrix}U_x & V_x & W_x \\ U_y & V_y & W_y \\ U_z & V_z & W_z \end{bmatrix}
     * ```
     */
    static createColumns(vectorU: Vector3d, vectorV: Vector3d, vectorW: Vector3d, result?: Matrix3d): Matrix3d;
    /** Create a matrix with each column's _x,y_ parts given `XAndY` and separate numeric z values.
     * ```
     * equation
     * \begin{bmatrix}U_x & V_x & W_x \\ U_y & V_y & W_y \\ u & v & w \end{bmatrix}
     * ```
     */
    static createColumnsXYW(vectorU: XAndY, u: number, vectorV: XAndY, v: number, vectorW: XAndY, w: number, result?: Matrix3d): Matrix3d;
    /**
     * Create a matrix from "as viewed" right and up vectors.
     * * ColumnX points in the rightVector direction.
     * * ColumnY points in the upVector direction.
     * * ColumnZ is a unit cross product of ColumnX and ColumnY.
     * * Optionally rotate by 45 degrees around `upVector` to bring its left or right vertical edge to center.
     * * Optionally rotate by arctan(1/sqrt(2)) ~ 35.264 degrees around `rightVector` to bring the top or bottom
     * horizontal edge of the view to the center (for isometric views).
     *
     * This is expected to be used with various principal unit vectors that are perpendicular to each other.
     * * STANDARD TOP VIEW: createViewedAxes(Vector3d.unitX(), Vector3d.unitY(), 0, 0)
     * * STANDARD FRONT VIEW: createViewedAxes(Vector3d.unitX(), Vector3d.unitZ(), 0, 0)
     * * STANDARD BACK VIEW: createViewedAxes(Vector3d.unitX(-1), Vector3d.unitZ(), 0, 0)
     * * STANDARD RIGHT VIEW: createViewedAxes(Vector3d.unitY(), Vector3d.unitZ(), 0, 0)
     * * STANDARD LEFT VIEW: createViewedAxes(Vector3d.unitY(-1), Vector3d.unitZ(), 0, 0)
     * * STANDARD BOTTOM VIEW: createViewedAxes(Vector3d.unitX(), Vector3d.unitY(-1), 0, 0)
     * * STANDARD ISO VIEW: createViewedAxes(Vector3d.unitX(), Vector3d.unitZ(), -1, 1)
     * * STANDARD RIGHT ISO VIEW: createViewedAxes(Vector3d.unitX(), Vector3d.unitZ(), 1, 1)
     * * Front, right, back, left, top, and bottom standard views are views from faces of the cube
     * and iso and right iso standard views are views from corners of the cube.
     * * Note: createViewedAxes is column-based so always returns local to world
     *
     * @param rightVector ColumnX of the returned matrix. Expected to be perpendicular to upVector.
     * @param upVector ColumnY of the returned matrix. Expected to be perpendicular to rightVector.
     * @param leftNoneRight Specifies the ccw rotation around `upVector` axis. Normally one of "-1", "0", and "1",
     * where "-1" indicates rotation by 45 degrees to bring the left vertical edge to center, "0" means no rotation,
     * and "1" indicates rotation by 45 degrees to bring the right vertical edge to center. Other numbers are
     * used as multiplier for this 45 degree rotation.
     * @param topNoneBottom Specifies the ccw rotation around `rightVector` axis. Normally one of "-1", "0", and "1",
     * where "-1" indicates isometric rotation (35.264 degrees) to bring the bottom upward, "0" means no rotation,
     * and "1" indicates isometric rotation (35.264 degrees) to bring the top downward. Other numbers are
     * used as multiplier for the 35.264 degree rotation.
     * @returns matrix = [rightVector, upVector, rightVector cross upVector] with the applied rotations specified
     * by leftNoneRight and topNoneBottom. Returns undefined if rightVector and upVector are parallel.
     */
    static createViewedAxes(rightVector: Vector3d, upVector: Vector3d, leftNoneRight?: number, topNoneBottom?: number): Matrix3d | undefined;
    /**
     * Create a rotation matrix for one of the 8 standard views.
     * * Default is TOP view (`local X = world X`, `local Y = world Y`, `local Z = world Z`).
     * * To change view from the TOP to one of the other 7 standard views, we need to multiply "world data" to
     * the corresponding matrix1 provided by `createStandardWorldToView(index, false)` and then
     * `matrix1.multiply(world data)` will return "local data".
     * * To change view back to the TOP, we need to multiply "local data" to the corresponding matrix2 provided
     * by `createStandardWorldToView(index, true)` and then `matrix2.multiply(local data)` will returns "world data".
     * * Note: No matter how you rotate the world axis, local X is always pointing right, local Y is always pointing up,
     * and local Z is always pointing toward you.
     *
     * @param index standard view index `StandardViewIndex.Top, Bottom, Left, Right, Front, Back, Iso, RightIso`
     * @param invert if false (default), the return matrix is world to local (view) and if true, the the return
     * matrix is local (view) to world.
     * @param result optional result.
     */
    static createStandardWorldToView(index: StandardViewIndex, invert?: boolean, result?: Matrix3d): Matrix3d;
    /**
     * Apply (in place) a jacobi eigenvalue algorithm.
     * @param i row index of zeroed member
     * @param j column index of zeroed member
     * @param leftEigenvectors a matrix that its columns will be filled by the left eigenvectors of `this` Matrix3d
     * (allocated by caller, computed and filled by this function). Note that columns of leftEigenVectors will be
     * mutually perpendicular because `this` matrix is symmetric.
     * @param lambda a matrix that its diagonal entries will be filled by eigenvalues and its non-diagonal elements
     * converge to 0 (allocated by caller, computed and filled by this function).
     */
    private applySymmetricJacobi;
    /**
     * Factor `this` matrix as a product `U * lambda * UT` where `U` is an orthogonal matrix and `lambda`
     * is a diagonal matrix.
     *
     * * **Note 1:** You must apply this function to a `symmetric` matrix. Otherwise, the lower triangle is ignored
     * and the upper triangle is mirrored to the lower triangle to enforce symmetry.
     * * **Note 2:** This function is replaced by a faster method called `fastSymmetricEigenvalues` so consider
     * using the fast version instead.
     * @param leftEigenvectors a matrix that its columns will be filled by the left eigenvectors of `this` Matrix3d
     * (allocated by caller, computed and filled by this function). Note that columns of leftEigenVectors will be
     * mutually perpendicular because `this` matrix is symmetric.
     * @param lambda a vector that its entries will be filled by eigenvalues of `this` Matrix3d (allocated by
     * caller, computed and filled by this function).
     */
    symmetricEigenvalues(leftEigenvectors: Matrix3d, lambda: Vector3d): boolean;
    /**
     * Apply (in place) a jacobi eigenvalue algorithm that diagonalize `this` matrix, i.e., zeros out this.at(i,j).
     * * During diagonalization, the upper triangle is mirrored to lower triangle to enforce symmetry.
     * * Math details can be found at docs/learning/geometry/Matrix.md
     * @param i row index of zeroed member.
     * @param j column index of zeroed member.
     * @param k other row/column index (different from i and j).
     * @param leftEigenVectors a matrix that its columns will be filled by the left eigenvectors of `this` Matrix3d
     * (allocated by caller, computed and filled by this function). Note that columns of leftEigenVectors will be
     * mutually perpendicular because `this` matrix is symmetric.
     */
    private applyFastSymmetricJacobi;
    /**
     * Factor `this` matrix as a product `U * lambda * UT` where `U` is an orthogonal matrix and `lambda`
     * is a diagonal matrix.
     *
     * * **Note:** You must apply this function to a `symmetric` matrix. Otherwise, the lower triangle is ignored
     * and the upper triangle is mirrored to the lower triangle to enforce symmetry.
     * * Math details can be found at docs/learning/geometry/Matrix.md
     * @param leftEigenvectors a matrix that its columns will be filled by the left eigenvectors of `this` Matrix3d
     * (allocated by caller, computed and filled by this function). Note that columns of leftEigenVectors will be
     * mutually perpendicular because `this` matrix is symmetric.
     * @param lambda a vector that its entries will be filled by eigenvalues of `this` Matrix3d (allocated by
     * caller, computed and filled by this function).
     */
    fastSymmetricEigenvalues(leftEigenvectors: Matrix3d, lambda: Vector3d): boolean;
    /**
     * Compute the (unit vector) axis and angle for the rotation generated by `this` Matrix3d.
     * * Math details can be found at docs/learning/geometry/Angle.md
     * @returns Returns axis and angle of rotation with result.ok === true when the conversion succeeded.
     */
    getAxisAndAngleOfRotation(): {
        axis: Vector3d;
        angle: Angle;
        ok: boolean;
    };
    /**
     * Rotate columns i and j of `this` matrix to make them perpendicular using the angle that zero-out
     * `thisTranspose * this`.
     * @param i row index of zeroed member.
     * @param j column index of zeroed member.
     * @param matrixU a matrix that its columns will be filled by the right eigenvectors of `thisTranspose * this`
     * (allocated by caller, computed and filled by this function). Note that columns of matrixU will be mutually
     *  perpendicular because `thisTranspose * this` matrix is symmetric.
     */
    private applyJacobiColumnRotation;
    /**
     * Factor `this` matrix as a product `VD * U` where `VD` has mutually perpendicular columns and `U` is orthogonal.
     * @param matrixVD a matrix that its columns will be filled by rotating columns of `this` to make them mutually
     * perpendicular (allocated by caller, computed and filled by this function).
     * @param matrixU a matrix that its columns will be filled by the right eigenvectors of `thisTranspose * this`
     * (allocated by caller, computed and filled by this function). Note that columns of matrixU will be mutually
     *  perpendicular because `thisTranspose * this` matrix is symmetric.
     */
    factorPerpendicularColumns(matrixVD: Matrix3d, matrixU: Matrix3d): boolean;
    /**
     * Factor `this` matrix as a product `V * D * U` where `V` and `U` are orthogonal and `D` is diagonal with
     * positive entries.
     * * This is formally known as the `Singular Value Decomposition` or `SVD`.
     * @param matrixV an orthogonal matrix that its columns will be filled by the left eigenvectors of
     * `thisTranspose * this` (allocated by caller, computed and filled by this function).
     * @param scale singular values of `this` (allocated by caller, computed and filled by this function).
     * The singular values in the `scale` are non-negative and decreasing.
     * @param matrixU an orthogonal matrix that its columns will be filled by the right eigenvectors of
     * `thisTranspose * this` (allocated by caller, computed and filled by this function).
     */
    factorOrthogonalScaleOrthogonal(matrixV: Matrix3d, scale: Point3d, matrixU: Matrix3d): boolean;
    /**
     * Return a matrix that rotates a fraction of the angular sweep from vectorA to vectorB.
     * @param vectorA initial vector position
     * @param fraction fractional rotation (1 means rotate all the way)
     * @param vectorB final vector position
     * @param result optional result matrix.
     */
    static createPartialRotationVectorToVector(vectorA: Vector3d, fraction: number, vectorB: Vector3d, result?: Matrix3d): Matrix3d | undefined;
    /** Returns a matrix that rotates from vectorA to vectorB. */
    static createRotationVectorToVector(vectorA: Vector3d, vectorB: Vector3d, result?: Matrix3d): Matrix3d | undefined;
    /** Create a 90 degree rotation around a principal axis */
    static create90DegreeRotationAroundAxis(axisIndex: number): Matrix3d;
    /** Return (a copy of) the X column */
    columnX(result?: Vector3d): Vector3d;
    /** Return (a copy of) the Y column */
    columnY(result?: Vector3d): Vector3d;
    /** Return (a copy of) the Z column */
    columnZ(result?: Vector3d): Vector3d;
    /** Return the X column magnitude squared */
    columnXMagnitudeSquared(): number;
    /** Return the Y column magnitude squared */
    columnYMagnitudeSquared(): number;
    /** Return the Z column magnitude squared */
    columnZMagnitudeSquared(): number;
    /** Return the X column magnitude */
    columnXMagnitude(): number;
    /** Return the Y column magnitude */
    columnYMagnitude(): number;
    /** Return the Z column magnitude */
    columnZMagnitude(): number;
    /** Return magnitude of columnX cross columnY. */
    columnXYCrossProductMagnitude(): number;
    /** Return the X row magnitude */
    rowXMagnitude(): number;
    /** Return the Y row magnitude  */
    rowYMagnitude(): number;
    /** Return the Z row magnitude  */
    rowZMagnitude(): number;
    /** Return the dot product of column X with column Y */
    columnXDotColumnY(): number;
    /** Return the dot product of column X with column Z */
    columnXDotColumnZ(): number;
    /** Return the dot product of column Y with column Z */
    columnYDotColumnZ(): number;
    /**
     * Dot product of an indexed column with a vector given as x,y,z
     * @param columnIndex index of column. Must be 0,1,2.
     * @param x x component of vector
     * @param y y component of vector
     * @param z z component of vector
     */
    columnDotXYZ(columnIndex: AxisIndex, x: number, y: number, z: number): number;
    /** Return (a copy of) the X row */
    rowX(result?: Vector3d): Vector3d;
    /** Return (a copy of) the Y row */
    rowY(result?: Vector3d): Vector3d;
    /** Return (a copy of) the Z row */
    rowZ(result?: Vector3d): Vector3d;
    /** Return the dot product of the vector parameter with the X column. */
    dotColumnX(vector: XYZ): number;
    /** Return the dot product of the vector parameter with the Y column. */
    dotColumnY(vector: XYZ): number;
    /** Return the dot product of the vector parameter with the Z column. */
    dotColumnZ(vector: XYZ): number;
    /** Return the dot product of the vector parameter with the X row. */
    dotRowX(vector: XYZ): number;
    /** Return the dot product of the vector parameter with the Y row. */
    dotRowY(vector: XYZ): number;
    /** Return the dot product of the vector parameter with the Z row. */
    dotRowZ(vector: XYZ): number;
    /** Return the dot product of the x,y,z with the X row. */
    dotRowXXYZ(x: number, y: number, z: number): number;
    /** Return the dot product of the x,y,z with the Y row. */
    dotRowYXYZ(x: number, y: number, z: number): number;
    /** Return the dot product of the x,y,z with the Z row. */
    dotRowZXYZ(x: number, y: number, z: number): number;
    /** Return the cross product of the Z column with the vector parameter. */
    columnZCrossVector(vector: XYZ, result?: Vector3d): Vector3d;
    /** Set data from xyz parts of Point4d  (w part of Point4d ignored) */
    setColumnsPoint4dXYZ(vectorU: Point4d, vectorV: Point4d, vectorW: Point4d): void;
    /**
     * Set entries in one column of the matrix.
     * @param columnIndex column index (this is interpreted cyclically. See Geometry.cyclic3dAxis for more info).
     * @param value x,yz, values for column.  If undefined, zeros are installed.
     */
    setColumn(columnIndex: number, value: Vector3d | undefined): void;
    /**
     * Set all columns of the matrix. Any undefined vector is zeros.
     * @param vectorX values for column 0
     * @param vectorY values for column 1
     * @param vectorZ optional values for column 2 (it's optional in case column 2 is 000, which is a
     * projection onto the xy-plane)
     */
    setColumns(vectorX: Vector3d | undefined, vectorY: Vector3d | undefined, vectorZ?: Vector3d): void;
    /**
     * Set entries in one row of the matrix.
     * @param rowIndex row index. This is interpreted cyclically (using Geometry.cyclic3dAxis).
     * @param value x,y,z values for row.
     */
    setRow(rowIndex: number, value: Vector3d): void;
    /**
     * Return (a copy of) a column of the matrix.
     * @param i column index. This is interpreted cyclically (using Geometry.cyclic3dAxis).
     * @param result optional preallocated result.
     */
    getColumn(columnIndex: number, result?: Vector3d): Vector3d;
    /**
     * Return a (copy of) a row of the matrix.
     * @param i row index. This is interpreted cyclically (using Geometry.cyclic3dAxis).
     * @param result optional preallocated result.
     */
    getRow(columnIndex: number, result?: Vector3d): Vector3d;
    /**
     * Create a matrix from row vectors.
     * ```
     * equation
     * \begin{bmatrix}U_x & U_y & U_z \\ V_x & V_y & V_z \\ W_x & W_y & W_z \end{bmatrix}
     * ```
     */
    static createRows(vectorU: Vector3d, vectorV: Vector3d, vectorW: Vector3d, result?: Matrix3d): Matrix3d;
    /**
     * Create a matrix that scales along a specified `direction`. This means if you multiply the returned matrix
     * by a `vector`, you get `directional scale` of that `vector`. Suppose `plane` is the plane perpendicular
     * to the `direction`. When scale = 0, `directional scale` is projection of the `vector` to the `plane`.
     * When scale = 1, `directional scale` is the `vector` itself. When scale = -1, `directional scale` is
     * mirror of the `vector` across the `plane`. In general, When scale != 0, the result is computed by first
     * projecting the `vector` to the `plane`, then translating that projection along the `direction` (if scale > 0)
     * or in opposite direction (if scale < 0).
     * ```
     * equation
     * \text{The matrix is } I + (s-1) D D^T
     * \\ \text{with }D\text{ being the normalized direction vector and }s\text{ being the scale.}
     * ```
     * * Visualization can be found at itwinjs.org/sandbox/SaeedTorabi/DirectionalScale
     */
    static createDirectionalScale(direction: Vector3d, scale: number, result?: Matrix3d): Matrix3d;
    /**
     * Create a matrix which sweeps a vector along `sweepVector` until it hits the plane through the origin with the given normal.
     * * To sweep an arbitrary vector U0 along direction W to the vector U1 in the plane through the origin with normal N:
     *   *   `U1 = U0 + W * alpha`
     *   *   `U1 DOT N = (U0 + W * alpha) DOT N = 0`
     *   *   `U0 DOT N = - alpha * W DOT N`
     *   *   `alpha = - U0 DOT N / W DOT N`
     * * Insert the alpha definition in U1:
     *   *   `U1 = U0 -  W * N DOT U0 / W DOT N`
     * * Write vector dot expression N DOT U0 as a matrix product (^T indicates transpose):
     *   *   `U1 = U0 -  W * N^T * U0 / W DOT N`
     * * Note W * N^T is an outer product, i.e. a 3x3 matrix. By associativity of matrix multiplication:
     *   *   `U1 = (I - W * N^T / W DOT N) * U0`
     * * and the matrix to do the sweep for any vector in place of U0 is `I - W * N^T / W DOT N`.
     * @param sweepVector sweep direction
     * @param planeNormal normal to the target plane
     */
    static createFlattenAlongVectorToPlane(sweepVector: Vector3d, planeNormal: Vector3d): Matrix3d | undefined;
    /**
     * Multiply `matrix * point`, treating the point as a column vector on the right.
     * ```
     * equation
     * \matrixXY{A}\columnSubXYZ{U}
     * ```
     * @return the point result
     */
    multiplyPoint(point: Point3d, result?: Point3d): Point3d;
    /**
     * Multiply `matrix * vector`, treating the vector is a column vector on the right.
     * ```
     * equation
     * \matrixXY{A}\columnSubXYZ{U}
     * ```
     * @return the vector result
     */
    multiplyVector(vectorU: XYAndZ, result?: Vector3d): Vector3d;
    /**
     * Multiply `matrix * vector` in place for vector in the array, i.e. treating the vector is a column
     * vector on the right.
     * * Each `vector` is updated to be `matrix * vector`
     */
    multiplyVectorArrayInPlace(data: XYZ[]): void;
    /** Compute `origin - matrix * vector` */
    static xyzMinusMatrixTimesXYZ(origin: XYAndZ, matrix: Matrix3d, vector: XYAndZ, result?: Point3d): Point3d;
    /** Compute `origin + matrix * vector`  using only the xy parts of the inputs. */
    static xyPlusMatrixTimesXY(origin: XAndY, matrix: Matrix3d, vector: XAndY, result?: Point2d): Point2d;
    /** Compute `origin + matrix * vector`  using all xyz parts of the inputs. */
    static xyzPlusMatrixTimesXYZ(origin: XYZ, matrix: Matrix3d, vector: XYAndZ, result?: Point3d): Point3d;
    /** Updates vector to be `origin + matrix * vector` using all xyz parts of the inputs. */
    static xyzPlusMatrixTimesXYZInPlace(origin: XYZ, matrix: Matrix3d, vector: WritableXYAndZ): void;
    /** Compute `origin + matrix * vector` where the final vector is given as direct x,y,z coordinates */
    static xyzPlusMatrixTimesCoordinates(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, result?: Point3d): Point3d;
    /**
     * Treat the 3x3 matrix and origin as upper 3x4 part of a 4x4 matrix, with 0001 as the final row.
     * Multiply the 4x4 matrix by `[x,y,z,w]`
     * ```
     * equation
     * \begin{bmatrix}M_0 & M_1 & M_2 & Ox \\ M_3 & M_4 & M_5 & Oy \\ M_6 & M_7 & M_8 & Oz \\ 0 & 0 & 0 & 1\end{bmatrix} * \begin{bmatrix}x \\ y \\ z \\ w\end{bmatrix}
     * ```
     * @param origin translation part (xyz in column 3)
     * @param matrix matrix part (leading 3x3)
     * @param x x part of multiplied point
     * @param y y part of multiplied point
     * @param z z part of multiplied point
     * @param w w part of multiplied point
     * @param result optional preallocated result.
     */
    static xyzPlusMatrixTimesWeightedCoordinates(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, w: number, result?: Point4d): Point4d;
    /**
     * Treat the 3x3 matrix and origin as upper 3x4 part of a 4x4 matrix, with 0001 as the final row.
     * Multiply the 4x4 matrix by `[x,y,z,w]`
     * ```
     * equation
     * \begin{bmatrix}M_0 & M_1 & M_2 & Ox \\ M_3 & M_4 & M_5 & Oy \\ M_6 & M_7 & M_8 & Oz \\ 0 & 0 & 0 & 1\end{bmatrix} * \begin{bmatrix}x \\ y \\ z \\ w\end{bmatrix}
     * ```
     * @param origin translation part (xyz in column 3)
     * @param matrix matrix part (leading 3x3)
     * @param x x part of multiplied point
     * @param y y part of multiplied point
     * @param z z part of multiplied point
     * @param w w part of multiplied point
     * @param result optional preallocated result.
     */
    static xyzPlusMatrixTimesWeightedCoordinatesToFloat64Array(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, w: number, result?: Float64Array): Float64Array;
    /**
     * Treat the 3x3 matrix and origin as a 3x4 matrix.
     * * Multiply the 3x4 matrix by `[x,y,z,1]`
     * ```
     * equation
     * \begin{bmatrix}M_0 & M_1 & M_2 & Ox \\ M_3 & M_4 & M_5 & Oy \\ M_6 & M_7 & M_8 & Oz\end{bmatrix} * \begin{bmatrix}x \\ y \\ z \\ 1\end{bmatrix}
     * ```
     * @param origin translation part (xyz in column 3)
     * @param matrix matrix part (leading 3x3)
     * @param x x part of multiplied point
     * @param y y part of multiplied point
     * @param z z part of multiplied point
     * @param result optional preallocated result.
     */
    static xyzPlusMatrixTimesCoordinatesToFloat64Array(origin: XYZ, matrix: Matrix3d, x: number, y: number, z: number, result?: Float64Array): Float64Array;
    /**
     * Multiply the transpose matrix times a vector.
     * * This produces the same x,y,z as treating the vector as a row on the left of the (un-transposed) matrix.
     * ```
     * equation
     * \begin{matrix}
     * \text{Treating U as a column to the right of transposed matrix\:  return column}&\columnSubXYZ{V}&=&\matrixTransposeSubXY{A}\columnSubXYZ{U} \\
     * \text{Treating U as a row to the left of untransposed matrix\: return row}&\rowSubXYZ{V}&=&\rowSubXYZ{U}\matrixXY{A}
     * \end{matrix}
     * ```
     * @param result the vector result (optional)
     */
    multiplyTransposeVector(vector: Vector3d, result?: Vector3d): Vector3d;
    /**
     * Multiply the matrix * [x,y,z], i.e. the vector [x,y,z] is a column vector on the right.
     * @param result the vector result (optional)
     */
    multiplyXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
    /**
     * Multiply the matrix * xyz, place result in (required) return value.
     * @param xyz right side
     * @param result the result.
     */
    multiplyXYZtoXYZ(xyz: XYZ, result: XYZ): XYZ;
    /**
     * Multiply the matrix * [x,y,0], i.e. the vector [x,y,0] is a column vector on the right.
     * @param result the vector result (optional)
     */
    multiplyXY(x: number, y: number, result?: Vector3d): Vector3d;
    /**
     * Compute origin + the matrix * [x,y,0].
     * @param result the Point3d result (optional)
     */
    originPlusMatrixTimesXY(origin: XYZ, x: number, y: number, result?: Point3d): Point3d;
    /**
     * Multiply the matrix * (x,y,z) in place, i.e. the vector (x,y,z) is a column vector on the right and
     * the multiplication updates the vector values.
     * @param xyzData the vector data.
     */
    multiplyVectorInPlace(xyzData: XYZ): void;
    /**
     * Multiply the transpose matrix times [x,y,z] in place, i.e. the vector [x,y,z] is a column vector on
     * the right and the multiplication updates the vector values.
     * * This is equivalent to `multiplyTransposeVector` but always returns the result directly in the input.
     * @param vectorU the vector data
     */
    multiplyTransposeVectorInPlace(vectorU: XYZ): void;
    /**
     * Multiply the transpose matrix times column using individual numeric inputs.
     * * This produces the same x,y,z as treating the vector as a row on the left of the (un-transposed) matrix.
     * ```
     * equation
     * \begin{matrix}
     * \text{treating the input as a column vector } \columnXYZ{x}{y}{z}\text{ compute  }&\columnSubXYZ{V} &= &A^T \columnXYZ{x}{y}{z} \\
     * \text{or as a row vector } \rowXYZ{x}{y}{z} \text{ compute }&\rowSubXYZ{V} &= &\rowXYZ{x}{y}{z} A \\
     * \phantom{8888}\text{and return V as a Vector3d} & & &
     * \end{matrix}
     * ````
     * @param result the vector result (optional)
     */
    multiplyTransposeXYZ(x: number, y: number, z: number, result?: Vector3d): Vector3d;
    /**
     * Solve `matrix * result = vector` for an unknown `result`.
     * * This is equivalent to multiplication `result = matrixInverse * vector`.
     * * Result is `undefined` if the matrix is singular (e.g. has parallel columns or a zero magnitude column)
     */
    multiplyInverse(vector: Vector3d, result?: Vector3d): Vector3d | undefined;
    /**
     * Solve `matrixTranspose * result = vector` for an unknown `result`.
     * * This is equivalent to multiplication `result = matrixInverseTranspose * vector`.
     * * Result is `undefined` if the matrix is singular (e.g. has parallel columns or a zero magnitude column)
     */
    multiplyInverseTranspose(vector: Vector3d, result?: Vector3d): Vector3d | undefined;
    /**
     * Multiply `matrixInverse * [x,y,z]`.
     * * This is equivalent to solving `matrix * result = [x,y,z]` for an unknown `result`.
     * * Result is `undefined` if the matrix is singular (e.g. has parallel columns or a zero magnitude column)
     * @return result as a Vector3d or undefined (if the matrix is singular).
     */
    multiplyInverseXYZAsVector3d(x: number, y: number, z: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Multiply `matrixInverse * [x,y,z]` and return result as a `Point4d` with the given weight as the last coordinate.
     * * Equivalent to solving `matrix * result = [x,y,z]` for an unknown `result`.
     * * Result is `undefined` if the matrix is singular (e.g. has parallel columns or a zero magnitude column)
     * @return result as a Point4d with the same weight.
     */
    multiplyInverseXYZW(x: number, y: number, z: number, w: number, result?: Point4d): Point4d | undefined;
    /**
     * Multiply `matrixInverse * [x,y,z]` and return result as `Point3d`.
     * * Equivalent to solving `matrix * result = [x,y,z]` for an unknown `result`.
     * @return result as a Point3d or `undefined` (if the matrix is singular).
     */
    multiplyInverseXYZAsPoint3d(x: number, y: number, z: number, result?: Point3d): Point3d | undefined;
    /**
     * Invoke a given matrix*matrix operation to compute the inverse matrix and set this.inverseCoffs
     * * If either input coffA or coffB is `undefined`, set state to `InverseMatrixState.unknown` but
     * leave the inverseCoffs untouched.
     * @param f the given matrix*matrix operation that is called by this function to compute the inverse.
     * `f` must be a matrix*matrix operation. Otherwise, the function does not generate the inverse properly.
     */
    private finishInverseCoffs;
    /**
     * Multiply `this` matrix times `other` matrix
     * @return the matrix result: this*other
     */
    multiplyMatrixMatrix(other: Matrix3d, result?: Matrix3d): Matrix3d;
    /**
     * Multiply `this` matrix times `inverse of other` matrix
     * @return the matrix result: this*otherInverse
     */
    multiplyMatrixMatrixInverse(other: Matrix3d, result?: Matrix3d): Matrix3d | undefined;
    /**
     * Multiply `inverse of this` matrix times `other` matrix
     * @return the matrix result: thisInverse*other
     */
    multiplyMatrixInverseMatrix(other: Matrix3d, result?: Matrix3d): Matrix3d | undefined;
    /**
     * Multiply `this` matrix times the transpose of `other` matrix
     * ```
     * equation
     * \text{for instance matrix }A\text{ and matrix }B\text{ return matrix }C{\text where }\\\matrixXY{C}=\matrixXY{A}\matrixTransposeSubXY{B}
     * ```
     * @return the matrix result: this*otherTranspose
     */
    multiplyMatrixMatrixTranspose(other: Matrix3d, result?: Matrix3d): Matrix3d;
    /**
     * Multiply the transpose of `this` matrix times `other` matrix
     * ```
     * equation
     * \matrixXY{result}=\matrixXY{\text{this}}\matrixTransposeSubXY{\text{other}}
     * ```
     * @return the matrix result: thisTranspose*other
     */
    multiplyMatrixTransposeMatrix(other: Matrix3d, result?: Matrix3d): Matrix3d;
    /**
     * Multiply `this` Matrix3d (considered to be a Transform with 0 `origin`) times `other` Transform.
     * * **Note:** If `this = [A   0]` and `other = [B   b]`, then `this * other` is defined as [A*B   Ab] because:
     * ```
     * equation
     * \begin{matrix}
     * \text{this matrix }\bold{A}\text{ promoted to block Transform} & \blockTransform{A}{0} \\
     * \text{other Transform with `matrix` part }\bold{B}\text{ and origin part }\bold{b} & \blockTransform{B}{b}\\
     * \text{product}& \blockTransform{A}{0}\blockTransform{B}{b}=\blockTransform{AB}{Ab}
     * \end{matrix}
     * ```
     * @param other the `other` Transform to be multiplied to `this` matrix.
     * @param result optional preallocated `result` to reuse.
     */
    multiplyMatrixTransform(other: Transform, result?: Transform): Transform;
    /**
     * Return the transpose of `this` matrix.
     * * If `result` is passed as argument, then the function copies the transpose of `this` into `result`.
     * * `this` is not changed unless also passed as the result, i.e., `this.transpose(this)` transposes `this` in place.
     */
    transpose(result?: Matrix3d): Matrix3d;
    /**
     * Transpose this matrix in place.
     */
    transposeInPlace(): void;
    /**
     * Return the inverse matrix.
     * The return is undefined if the matrix is singular (e.g. has parallel columns or a zero magnitude column)
     * * If `result == this`, then content of inverse of `this` matrix is copied into `this`. Otherwise, inverse
     * of `this` is stored in `result`.
     * * **Note:** Each Matrix3d object caches its own inverse (`this.inverseCoffs`) and has methods to multiply
     * the inverse times matrices and vectors (e.g., `multiplyMatrixInverseMatrix`, `multiplyMatrixMatrixInverse`,
     * `multiplyInverse`). Hence explicitly constructing this new inverse object is rarely necessary.
     */
    inverse(result?: Matrix3d): Matrix3d | undefined;
    /**
     * Take the dot product of a row (specified by `rowStartA`) of `coffA` and `columnStartB` of `coffB`.
     * * **Note:** We don't validate row/column numbers. Pass 0/3/6 for row 0/1/2 and pass 0/1/2 for column 0/1/2.
     */
    private static rowColumnDot;
    /**
     * Take the cross product of 2 rows (specified by `rowStart0` and `rowStart1`) of `source` and store the result
     * in `columnStart` of `dest`.
     * * **Note:** We don't validate row/column numbers. Pass 0/3/6 for row 0/1/2 and pass 0/1/2 for column 0/1/2.
     */
    private static indexedRowCrossProduct;
    /**
     * Take the cross product of 2 columns (i.e., `colStart0` and `colStart1`) of `this` matrix and store the
     * result in `colStart2` of the same matrix.
     * * **Note:** We don't validate column numbers. Pass 0/1/2 for column 0/1/2.
     */
    private indexedColumnCrossProductInPlace;
    /**
     * Form cross products among columns in axisOrder.
     * For axis order ABC:
     * * form cross product of column A and B, store in C.
     * * form cross product of column C and A, store in B.
     * * [A   B   C] ===> [A   B   AxB] ===> [A   (AxB)xA   AxB]
     *
     * This means that in the final matrix:
     * * first column is same as original column A.
     * * second column is linear combination of original A and B (i.e., is in the plane of original A and B).
     * * third column is perpendicular to first and second columns of both the original and final.
     * * original column C is overwritten and does not participate in the result.
     *
     * The final matrix will have 3 orthogonal columns.
     */
    axisOrderCrossProductsInPlace(axisOrder: AxisOrder): void;
    /**
     * Normalize each column in place.
     * @param originalColumnMagnitudes optional vector to store original column magnitudes.
     * @returns return true if all columns have non-zero lengths. Otherwise, return false.
     * * If false is returned, the magnitudes are stored in the `originalColumnMagnitudes` vector but no columns
     * are altered.
     */
    normalizeColumnsInPlace(originalColumnMagnitudes?: Vector3d): boolean;
    /**
     * Normalize each row in place.
     * @param originalRowMagnitudes optional vector to store original row magnitudes.
     * @returns return true if all rows have non-zero lengths. Otherwise, return false.
     * * If false is returned, the magnitudes are stored in the `originalRowMagnitudes` vector but no rows
     * are altered.
     */
    normalizeRowsInPlace(originalRowMagnitudes?: Vector3d): boolean;
    /**
     * Returns true if the matrix is singular.
     */
    isSingular(): boolean;
    /**
     * Mark this matrix as singular.
     */
    markSingular(): void;
    /**
     * Compute the inverse of `this` Matrix3d. The inverse is stored in `this.inverseCoffs` for later use.
     * @param useCacheIfAvailable if `true`, use the previously computed inverse if available. If `false`,
     * recompute the inverse.
     * @returns return `true` if the inverse is computed. Return `false` if matrix is singular.
     */
    computeCachedInverse(useCacheIfAvailable: boolean): boolean;
    /**
     * Convert a (row,column) index pair to the single index within flattened array of 9 numbers in row-major-order
     * * **Note:** Out of range row/column is interpreted cyclically.
     */
    static flatIndexOf(row: number, column: number): number;
    /**
     * Get elements of column `index` packaged as a Point4d with given `weight`.
     * * **Note:** Out of range index is interpreted cyclically.
     */
    indexedColumnWithWeight(index: number, weight: number, result?: Point4d): Point4d;
    /** Return the entry at specific row and column */
    at(row: number, column: number): number;
    /** Set the entry at specific row and column */
    setAt(row: number, column: number, value: number): void;
    /**
     * Create a Matrix3d whose values are uniformly scaled from `this` Matrix3d.
     * @param scale scale factor to apply.
     * @param result optional result.
     * @returns return the scaled matrix.
     */
    scale(scale: number, result?: Matrix3d): Matrix3d;
    /**
     * Create a Matrix3d whose columns are scaled copies of `this` Matrix3d.
     * @param scaleX scale factor for column 0
     * @param scaleY scale factor for column 1
     * @param scaleZ scale factor for column 2
     * @param result optional result
     */
    scaleColumns(scaleX: number, scaleY: number, scaleZ: number, result?: Matrix3d): Matrix3d;
    /**
     * Scale the columns of `this` Matrix3d in place.
     * @param scaleX scale factor for column 0
     * @param scaleY scale factor for column 1
     * @param scaleZ scale factor for column 2
     */
    scaleColumnsInPlace(scaleX: number, scaleY: number, scaleZ: number): void;
    /**
     * Create a Matrix3d whose rows are scaled copies of `this` Matrix3d.
     * @param scaleX scale factor for row 0
     * @param scaleY scale factor for row 1
     * @param scaleZ scale factor for row 2
     * @param result optional result
     */
    scaleRows(scaleX: number, scaleY: number, scaleZ: number, result?: Matrix3d): Matrix3d;
    /**
     * Scale the rows of `this` Matrix3d in place.
     * @param scaleX scale factor for row 0
     * @param scaleY scale factor for row 1
     * @param scaleZ scale factor for row 2
     */
    scaleRowsInPlace(scaleX: number, scaleY: number, scaleZ: number): void;
    /**
     * Add scaled values from `other` Matrix3d to `this` Matrix3d.
     * @param other Matrix3d with values to be added.
     * @param scale scale factor to apply to the added values.
     */
    addScaledInPlace(other: Matrix3d, scale: number): void;
    /**
     * Add scaled values from an outer product of vectors U and V.
     * * The scaled outer product is a matrix with `rank 1` (all columns/rows are linearly dependent).
     * * This is useful in constructing mirrors and directional scales.
     * ```
     * equation
     * A += s \columnSubXYZ{U}\rowSubXYZ{V}
     * \\ \matrixXY{A} += s \begin{bmatrix}
     * U_x * V_x & U_x * V_y & U_x * V_z \\
     * U_y * V_x & U_y * V_y & U_y * V_z \\
     * U_z * V_x & U_z * V_y & U_z * V_z \end{bmatrix}
     * ```
     * @param vectorU first vector in the outer product.
     * @param vectorV second vector in the outer product.
     * @param scale scale factor to apply to the added values.
     */
    addScaledOuterProductInPlace(vectorU: Vector3d, vectorV: Vector3d, scale: number): void;
    /**
     * Create a rigid matrix (columns and rows are unit length and pairwise perpendicular) for the given eye coordinate.
     * * column 2 is parallel to (x,y,z).
     * * column 0 is perpendicular to column 2 and is in the xy plane.
     * * column 1 is perpendicular to both. It is the "up" vector on the view plane.
     * * Multiplying the returned matrix times a local (view) vector gives the world vector.
     * * Multiplying transpose of the returned matrix times a world vector gives the local (view) vector.
     * * If you want to rotate a given plane (which contains (0,0,0)) to the xy-plane, pass coordinates of the normal
     * vector of your plane into createRigidViewAxesZTowardsEye. The transpose of the returned Matrix3d can be used
     * to rotate your plane to the xy-plane. If plane does not contain (0,0,0) then the plane is rotated to a plane
     * parallel to the xy-plane.
     * @param x eye x coordinate
     * @param y eye y coordinate
     * @param z eye z coordinate
     * @param result optional preallocated result
     */
    static createRigidViewAxesZTowardsEye(x: number, y: number, z: number, result?: Matrix3d): Matrix3d;
    /** Return the determinant of `this` matrix. */
    determinant(): number;
    /**
     * Return an estimate of how independent the columns of `this` matrix are. Near zero is bad (i.e.,
     * columns are almost dependent and matrix is nearly singular). Near 1 is good (i.e., columns are
     * almost independent and matrix is invertible).
     */
    conditionNumber(): number;
    /** Return the sum of squares of all entries */
    sumSquares(): number;
    /** Return the sum of squares of diagonal entries */
    sumDiagonalSquares(): number;
    /** Return the matrix `trace` (sum of diagonal entries) */
    sumDiagonal(): number;
    /** Return the Maximum absolute value of any single entry */
    maxAbs(): number;
    /** Return the maximum absolute difference between corresponding entries of `this` and `other` */
    maxDiff(other: Matrix3d): number;
    /** Test if the matrix is (very near to) an identity */
    get isIdentity(): boolean;
    /** Test if the off diagonal entries are all nearly zero */
    get isDiagonal(): boolean;
    /** Sum of squared differences between symmetric pairs (symmetric pairs have indices (1,3), (2,6), and (5,7).) */
    sumSkewSquares(): number;
    /** Test if the matrix is (very near to) symmetric */
    isSymmetric(): boolean;
    /** Test if the stored inverse is present and marked valid */
    get hasCachedInverse(): boolean;
    /** Test if the below diagonal entries (3,6,7) are all nearly zero */
    get isUpperTriangular(): boolean;
    /** Test if the above diagonal entries (1,2,5) are all nearly zero */
    get isLowerTriangular(): boolean;
    /**
     * If the matrix is diagonal and all diagonals are almost equal, return the first diagonal (entry 0
     * which is same as entry 4 and 8). Otherwise return `undefined`.
     */
    sameDiagonalScale(): number | undefined;
    /**
     * Test if all rows and columns are unit length and are perpendicular to each other, i.e., the matrix is either
     * a `pure rotation` (determinant is +1) or is a `mirror` (determinant is -1).
     * * **Note:** such a matrix is called `orthogonal` and its inverse is its transpose.
     */
    testPerpendicularUnitRowsAndColumns(): boolean;
    /**
     * Test if the matrix is a `rigid` matrix (or `pure rotation`, i.e., columns and rows are unit length and
     * pairwise perpendicular and determinant is +1).
     * @param allowMirror whether to widen the test to return true if the matrix is a `mirror` (determinant is -1).
     */
    isRigid(allowMirror?: boolean): boolean;
    /**
     * Test if all rows and columns are perpendicular to each other and have equal length.
     * If so, the length (or its negative) is the `scale` factor from a set of `orthonormal axes` to
     * the set of axes created by columns of `this` matrix. Otherwise, returns `undefined`.
     * @param result optional pre-allocated object to populate and return
     * @returns returns `{ rigidAxes, scale }` where `rigidAxes` is a Matrix3d with its columns as the rigid axes
     * (with the scale factor removed) and `scale` is the scale factor.
     * * Note that determinant of a rigid matrix is +1.
     * * The context for this method is to determine if the matrix is the product a `rotation` matrix and a uniform
     * `scale` matrix (diagonal matrix with all diagonal entries the same nonzero number).
     */
    factorRigidWithSignedScale(result?: Matrix3d): {
        rigidAxes: Matrix3d;
        scale: number;
    } | undefined;
    /** Test if `this` matrix reorders and/or negates the columns of the `identity` matrix. */
    get isSignedPermutation(): boolean;
    /**
     * Adjust the matrix in place to make is a `rigid` matrix so that:
     * * columns are perpendicular and have unit length.
     * * transpose equals inverse.
     * * mirroring is removed.
     * * This function internally uses `axisOrderCrossProductsInPlace` to make the matrix rigid.
     * @param axisOrder how to reorder the matrix columns
     * @return whether the adjusted matrix is `rigid` on return
     */
    makeRigid(axisOrder?: AxisOrder): boolean;
    /**
     * Create a new orthogonal matrix (perpendicular columns, unit length, transpose is inverse).
     * * Columns are taken from the source Matrix3d in order indicated by the axis order.
     * * Mirroring in the matrix is removed.
     * * This function internally uses `axisOrderCrossProductsInPlace` to make the matrix rigid.
     */
    static createRigidFromMatrix3d(source: Matrix3d, axisOrder?: AxisOrder, result?: Matrix3d): Matrix3d | undefined;
    /**
     * Create a matrix from a quaternion.
     * **WARNING:** There is frequent confusion over whether a "from quaternion" matrix is organized by
     * rows or columns. If you find that the matrix seems to rotate by the opposite angle, transpose it.
     *
     * Some math details can be found at
     * http://marc-b-reynolds.github.io/quaternions/2017/08/08/QuatRotMatrix.html
     */
    static createFromQuaternion(quat: Point4d): Matrix3d;
    /** Calculate quaternion terms used to convert matrix to a quaternion */
    private static computeQuatTerm;
    /**
     * Create `this` matrix to a quaternion.
     * **Note:** This calculation requires `this` matrix to have unit length rows and columns.
     * **WARNING:** There is frequent confusion over whether a "from quaternion" matrix is organized by
     * rows or columns. If you find that the matrix seems to rotate by the opposite angle, transpose it.
     *
     * Some math details can be found at
     * http://marc-b-reynolds.github.io/quaternions/2017/08/08/QuatRotMatrix.html
     */
    toQuaternion(): Point4d;
}
