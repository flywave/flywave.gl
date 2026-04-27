import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { Matrix3d } from "../geometry3d/matrix3d";
import { type XYZ, Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Transform } from "../geometry3d/transform";
import { type XAndY, type XYAndZ } from "../geometry3d/xyz-props";
import { Matrix4d } from "./matrix4d";
/**
 * A MomentData structure exists in several levels:
 * * First level: as a carrier of sums of inertial products that determine moments.
 *   * origin = local origin used as moments are summed.
 *   * sums = array of summed moments.
 *     * The [i,j] entry of the sums is a summed or integrated moment for product of axis i and j.
 *       * axes 0,1,2 are x,y,z
 *         * e.g. entry [0,1] is summed product xy
 *       * axis 3 is "w", which is 1 in sums.
 *         * e.g. entry 03 is summed x
 *    * In this level,
 *        * the `absoluteQuantity` member is undefined.
 *        * the `localToWorldMap` and `radiiOfGyration` are created by have undefined contents.
 *  * Second level: after a call to inertiaProductsToPrincipalAxes, the `localToWorldMap`, `absoluteQuantity` and `radiiOfGyration` are filled in.
 * @public
 */
export declare class MomentData {
    /** Origin used for sums. */
    origin: Point3d;
    /** flag to request deferred origin setup. */
    needOrigin: boolean;
    /** Moment sums.
     * * Set to zero at initialization and if requested later.
     * * Accumulated during data entry phase.
     */
    sums: Matrix4d;
    /** the mapping between principal and world system.
     * * This set up with its inverse already constructed.
     */
    localToWorldMap: Transform;
    /** Return the lower-right (3,3) entry in the sums.
     * * This is the quantity (i.e. length, area, or volume) summed
     */
    get quantitySum(): number;
    /** Return a scale factor to make these sums match the target orientation sign.
     * * 1.0 if `this.quantitySum` has the same sign as `targetSign`.
     * * -1.0 if `this.quantitySum` has the opposite sign from `targetSign`
     */
    signFactor(targetSign: number): number;
    /**
     *  If `this.needOrigin` flag is set, copy `origin` to `this.origin` and clear the flag.
     *
     */
    setOriginIfNeeded(origin: Point3d): void;
    /**
     *  If `this.needOrigin` flag is set, copy `origin` to `this.origin` and clear the flag.
     *
     */
    setOriginFromGrowableXYZArrayIfNeeded(points: GrowableXYZArray): void;
    /**
     *  If `this.needOrigin` flag is set, copy `origin` to `this.origin` and clear the flag.
     *
     */
    setOriginXYZIfNeeded(x: number, y: number, z: number): void;
    /** radii of gyration (square roots of principal second moments)
     */
    radiusOfGyration: Vector3d;
    /** principal quantity (e.g. length, area, or volume).  This is undefined in raw moments, and becomes defined by
     *
     */
    absoluteQuantity?: number;
    private constructor();
    /** Create moments with optional origin.
     * * origin and needOrigin are quirky.
     *   * (undefined, true) sets up to use first incoming point as origin.
     *   * (origin) sets up to use that durable origin, set needsOrigin flag false
     *   * (origin, true) the "true" is meaningless
     *   * (undefined, false) makes 000 the durable origin
     */
    static create(origin?: Point3d | undefined, needOrigin?: boolean): MomentData;
    /**
     * Return the formal tensor of integrated values `[yy+zz,xy,xz][yx,xx+zz,yz][zx,xy,xx+yy]`
     * @param products matrix of (integrated) `[xx,xy,xz][yx,yy,yz][zx,xy,zz]`
     */
    static momentTensorFromInertiaProducts(products: Matrix3d): Matrix3d;
    /** Sort the columns of the matrix for increasing moments. */
    static sortColumnsForIncreasingMoments(axes: Matrix3d, moments: Vector3d): void;
    /**
     * Return the principal moment data for an array of points.
     * @param points array of points
     */
    static pointsToPrincipalAxes(points: Point3d[]): MomentData | undefined;
    /**
     * Compute principal axes from inertial products
     * * The radii of gyration are sorted smallest to largest
     * * Hence x axis is long direction
     * * Hence planar data generates large moment as Z
     * @param origin The origin used for the inertia products.
     * @param inertiaProducts The inertia products -- sums or integrals of [xx,xy,xz,xw; yx,yy, yz,yw; zx,zy,zz,zw; wx,wy,wz,w]
     */
    static inertiaProductsToPrincipalAxes(origin: XYZ, inertiaProducts: Matrix4d): MomentData | undefined;
    /**
     * Test for match among selected members as they exist after `inertiaProductsToPrincipalAxes`
     * * The members considered are
     *   * origin of local to world map (i.e. centroid)
     *   * radius of gyration
     *   * axes of localToWorldMap.
     * * Axis direction tests allow these quirks:
     *   * opposite orientation is considered matched.
     * * Full xyz symmetry: If x,y,z radii are matched, axes are not tested.
     * * Symmetry in xy plane: If x and y radii are matched, the x and y axes area allowed to spin freely.  Only Z direction is tested.
     * * If either or both are undefined, returns false.
     * @param dataA first set of moments
     * @param dataB second set of moments
     */
    static areEquivalentPrincipalAxes(dataA: MomentData | undefined, dataB: MomentData | undefined): boolean;
    /** Clear the MomentData sums to zero, and establish a new origin. */
    clearSums(origin?: Point3d): void;
    /** Accumulate products-of-components for given points. */
    accumulatePointMomentsFromOrigin(points: Point3d[]): void;
    /** revise the accumulated sums to be "around the centroid" */
    shiftOriginAndSumsToCentroidOfSums(): boolean;
    /** revise the accumulated sums
     * * add ax,ay,ax to the origin coordinates.
     * * apply the negative translation to the sums.
     */
    shiftOriginAndSumsByXYZ(ax: number, ay: number, az: number): void;
    /** revise the accumulated sums so they are based at a specified origin. */
    shiftOriginAndSumsToNewOrigin(newOrigin: XYAndZ): void;
    private static _vectorA?;
    private static _vectorB?;
    private static _vectorC?;
    /** compute moments of a triangle from the origin to the given line.
     * Accumulate them to this.sums.
     * * If `pointA` is undefined, use `this.origin` as pointA.
     * * If `this.needOrigin` is set, pointB is used
     */
    accumulateTriangleMomentsXY(pointA: XAndY | undefined, pointB: XAndY, pointC: XAndY): void;
    /** add scaled outer product of (4d, unit weight) point to this.sums */
    accumulateScaledOuterProduct(point: XYAndZ, scaleFactor: number): void;
    /** Accumulate wire moment integral from pointA to pointB */
    accumulateLineMomentsXYZ(pointA: Point3d, pointB: Point3d): void;
    private readonly _point0;
    private readonly _point1;
    /** compute moments of triangles from a base point to the given linestring.
     * Accumulate them to this.sums.
     * * If `pointA` is undefined, use `this.origin` as pointA.
     * * If `this.needOrigin` is set, the first point of the array is captured as local origin for subsequent sums.
     *
     */
    accumulateTriangleToLineStringMomentsXY(sweepBase: XAndY | undefined, points: GrowableXYZArray): void;
    /**
     * * Assemble XX, YY, XY products into a full matrix form [xx,xy,0,0; xy,yy,0,0;0,0,0,0;0,0,0,1].
     * * Sandwich this between transforms with columns [vectorU, vectorV, 0000, origin].  (Column weights 0001) (only xy parts of vectors)
     * * scale by detJ for the xy-only determinant of the vectors.
     * @param productXX
     * @param productXY
     * @param productYY
     * @param area Area in caller's system
     * @param origin Caller's origin
     * @param vectorU Caller's U axis (not necessarily unit)
     * @param vectorV Caller's V axis (not necessarily unit)
     */
    accumulateXYProductsInCentroidalFrame(productXX: number, productXY: number, productYY: number, area: number, origin: XAndY, vectorU: XAndY, vectorV: XAndY): void;
    /**
     * Accumulate sums from other moments.
     * * scale by given scaleFactor (e.g. sign to correct orientation)
     * * pull the origin from `other` if `this` needs an origin.
     * *
     */
    accumulateProducts(other: MomentData, scale: number): void;
    /**
     * Accumulate sums from Matrix4d and origin.
     * * scale by given scaleFactor (e.g. sign to correct orientation)
     * * trap the origin if `this` needs an origin.
     * *
     */
    accumulateProductsFromOrigin(origin: Point3d, products: Matrix4d, scale: number): void;
    /**
     * Convert to a json data object with:
     */
    toJSON(): any;
}
