import { Point4d } from "../geometry4d/point4d";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { IndexedXYZCollection } from "./indexed-xyz-collection";
import { type Plane3dByOriginAndUnitNormal } from "./plane3d-by-origin-and-unit-normal";
import { Point2d } from "./point2d-vector2d";
import { type XYZ, Point3d, Vector3d } from "./point3d-vector3d";
import { Transform } from "./transform";
import { type XAndY, type XYAndZ, type XYZProps } from "./xyz-props";
/**
 * The `NumberArray` class contains static methods that act on arrays of numbers.
 * @public
 */
export declare class NumberArray {
    /** return the sum of values in an array,   The summation is done with correction terms which
     * improves last-bit numeric accuracy.
     */
    static preciseSum(data: number[]): number;
    /** Return true if arrays have identical counts and equal entries (using `!==` comparison) */
    static isExactEqual(dataA: any[] | Float64Array | undefined, dataB: any[] | Float64Array | undefined): boolean;
    /** Return true if arrays have identical counts and entries equal within tolerance */
    static isAlmostEqual(dataA: number[] | Float64Array | undefined, dataB: number[] | Float64Array | undefined, tolerance: number): boolean;
    /** return the sum of numbers in an array.  Note that "PreciseSum" may be more accurate. */
    static sum(data: number[] | Float64Array): number;
    /** test if coordinate x appears (to tolerance by `Geometry.isSameCoordinate`) in this array of numbers */
    static isCoordinateInArray(x: number, data: number[] | undefined): boolean;
    /** Return the max absolute value in a array of numbers. */
    static maxAbsArray(values: number[]): number;
    /** return the max absolute value of a pair of numbers */
    static maxAbsTwo(a1: number, a2: number): number;
    /** Return the max absolute difference between corresponding entries in two arrays of numbers
     * * If sizes are mismatched, only the smaller length is tested.
     */
    static maxAbsDiff(dataA: number[] | Float64Array, dataB: number[] | Float64Array): number;
    /** Return the max absolute difference between corresponding entries in two Float64Array
     * * If sizes are mismatched, only the smaller length is tested.
     */
    static maxAbsDiffFloat64(dataA: Float64Array, dataB: Float64Array): number;
    /**
     * Return an array with indicated start and end points, maximum step size internally
     * @param low low value
     * @param high high value
     * @param step max permitted step
     */
    static createArrayWithMaxStepSize(low: number, high: number, step: number): number[];
    /** copy numbers from variant sources to number[]. */
    static create(source: number[] | Float64Array): number[];
    /** Return a copy of the knots array, with multiplicity of first and last knots raised or lowered to expectedMultiplicity. */
    static cloneWithStartAndEndMultiplicity(knots: number[] | undefined, target0: number, target1: number): number[];
    /** Compute the linear combination s of the numbers and scales.
     * @param data array of numbers d_i.
     * @param scales array of scales s_i. For best results, `scales` should have the same length as `data`.
     * @return s = sum(d_i * s_i), where i ranges from 0 to min(data.length, scales.length).
     */
    static linearCombination(data: number[], scales: number[]): number;
    /** Compute the linear combination s of the colors and scales.
     * * The result is another color if the scales are in [0,1] and sum to 1.
     * @param colors array of colors c_i (rgba in first four bytes).
     * @param scales array of scales s_i. For best results, `scales` should have the same length as `colors`.
     * @return s = sum(c_i * s_i), where i ranges from 0 to min(colors.length, scales.length).
     */
    static linearCombinationOfColors(colors: number[], scales: number[]): number;
}
/**
 * The `Point2dArray` class contains static methods that act on arrays of 2d points.
 * @public
 */
export declare class Point2dArray {
    /** Return true if arrays have same length and matching coordinates. */
    static isAlmostEqual(dataA: undefined | Point2d[], dataB: undefined | Point2d[]): boolean;
    /**
     * Return an array containing clones of the Point3d data[]
     * @param data source data
     */
    static clonePoint2dArray(data: Point2d[]): Point2d[];
    /**
     * Return the number of points when trailing points that match point 0 are excluded.
     * @param data array of XAndY points.
     */
    static pointCountExcludingTrailingWraparound(data: XAndY[]): number;
}
/**
 * The `Vector3dArray` class contains static methods that act on arrays of 3d vectors.
 * @public
 */
export declare class Vector3dArray {
    /** Return true if arrays have same length and matching coordinates. */
    static isAlmostEqual(dataA: undefined | Vector3d[], dataB: undefined | Vector3d[]): boolean;
    /**
     * Return an array containing clones of the Vector3d data[]
     * @param data source data
     */
    static cloneVector3dArray(data: XYAndZ[]): Vector3d[];
}
/**
 * The `Point4dArray` class contains static methods that act on arrays of 4d points.
 * @public
 */
export declare class Point4dArray {
    /** pack each point and its corresponding weight into a buffer of xyzw xyzw ... */
    static packPointsAndWeightsToFloat64Array(data: Point3d[] | Float64Array | number[], weights: number[] | Float64Array, result?: Float64Array): Float64Array | undefined;
    /** pack x,y,z,w in Float64Array. */
    static packToFloat64Array(data: Point4d[], result?: Float64Array): Float64Array;
    /** unpack from  ... to array of Point4d */
    static unpackToPoint4dArray(data: Float64Array): Point4d[];
    /** unpack from xyzw xyzw... array to array of Point3d and array of weight.
     */
    static unpackFloat64ArrayToPointsAndWeights(data: Float64Array, points: Point3d[], weights: number[], pointFormatter?: (x: number, y: number, z: number) => any): void;
    private static readonly _workPoint4d;
    /**
     * Multiply (and replace) each block of 4 values as a Point4d.
     * @param transform transform to apply
     * @param xyzw array of x,y,z,w points.
     */
    static multiplyInPlace(transform: Transform, xyzw: Float64Array): void;
    /** test for near equality of all corresponding numeric values, treated as coordinates. */
    static isAlmostEqual(dataA: Point4d[] | Float64Array | undefined, dataB: Point4d[] | Float64Array | undefined): boolean;
    /** return true iff all xyzw points' altitudes are within tolerance of the plane.*/
    static isCloseToPlane(data: Point4d[] | Float64Array, plane: Plane3dByOriginAndUnitNormal, tolerance?: number): boolean;
}
/**
 * The `Point3dArray` class contains static methods that act on arrays of 3d points.
 * @public
 */
export declare class Point3dArray {
    /** pack x,y,z to `Float64Array` */
    static packToFloat64Array(data: Point3d[]): Float64Array;
    /**
     * Compute the 8 weights of trilinear mapping
     * By appropriate choice of weights, this can be used for both point and derivative mappings.
     * @param weights preallocated array to receive weights.
     * @param u0 low u weight
     * @param u1 high u weight
     * @param v0 low v weight
     * @param v1 high v weight
     * @param w0 low w weight
     * @param w1 high w weight
     */
    static evaluateTrilinearWeights(weights: Float64Array, u0: number, u1: number, v0: number, v1: number, w0: number, w1: number): void;
    /**
     * sum the weighted x components from a point array.
     * * weights.length is the number of summed terms
     * * points must have at least that length
     * @param weights
     * @param points
     */
    static sumWeightedX(weights: Float64Array, points: Point3d[]): number;
    /**
     * sum the weighted x components from a point array.
     * * weights.length is the number of summed terms
     * * points must have at least that length
     * @param weights
     * @param points
     */
    static sumWeightedY(weights: Float64Array, points: Point3d[]): number;
    /**
     * sum the weighted x components from a point array.
     * * weights.length is the number of summed terms
     * * points must have at least that length
     * @param weights
     * @param points
     */
    static sumWeightedZ(weights: Float64Array, points: Point3d[]): number;
    private static readonly _weightUVW;
    private static readonly _weightDU;
    private static readonly _weightDV;
    private static readonly _weightDW;
    /**
     * Compute a point by trilinear mapping.
     * @param points array of 8 points at corners, with x index varying fastest.
     * @param result optional result point
     */
    static evaluateTrilinearPoint(points: Point3d[], u: number, v: number, w: number, result?: Point3d): Point3d;
    /**
     * Compute a point and derivatives wrt uvw by trilinear mapping.
     * * evaluated point is the point part of the transform
     * * u,v,w derivatives are the respective columns of the matrix part of the transform.
     * @param points array of 8 points at corners, with x index varying fastest.
     * @param result optional result transform
     */
    static evaluateTrilinearDerivativeTransform(points: Point3d[], u: number, v: number, w: number, result?: Transform): Transform;
    /** unpack from a number array or Float64Array to an array of `Point3d` */
    static unpackNumbersToPoint3dArray(data: Float64Array | number[]): Point3d[];
    /**
     * return an 2-dimensional array containing all the values of `data` in arrays of numPerBlock
     * @param data simple array of numbers
     * @param numPerBlock number of values in each block at first level down
     */
    static unpackNumbersToNestedArrays(data: Float64Array, numPerBlock: number): any[];
    /**
     * return an 3-dimensional array containing all the values of `data` in arrays numPerRow blocks of numPerBlock
     * @param data simple array of numbers
     * @param numPerBlock number of values in each block at first level down
     */
    static unpackNumbersToNestedArraysIJK(data: Float64Array, numPerBlock: number, numPerRow: number): any[];
    /**  multiply a transform times each x,y,z triple and replace the x,y,z in the packed array */
    static multiplyInPlace(transform: Transform, xyz: Float64Array): void;
    /** Apply Geometry.isAlmostEqual to corresponding coordinates */
    static isAlmostEqual(dataA: Point3d[] | Float64Array | undefined, dataB: Point3d[] | Float64Array | undefined): boolean;
    /** return simple average of all coordinates.   (000 if empty array) */
    static centroid(points: IndexedXYZCollection | Point3d[], result?: Point3d): Point3d;
    /** Return the index of the point most distant from spacePoint */
    static indexOfMostDistantPoint(points: Point3d[], spacePoint: XYZ, farVector: Vector3d): number | undefined;
    /** return the index of the point whose vector from space point has the largest magnitude of cross product with given vector. */
    static indexOfPointWithMaxCrossProductMagnitude(points: Point3d[], spacePoint: Point3d, vector: Vector3d, farVector: Vector3d): number | undefined;
    /** Return the index of the closest point in the array (full xyz) */
    static closestPointIndex(data: XYAndZ[], spacePoint: XYAndZ): number;
    /** return true iff all points' altitudes are within tolerance of the plane.*/
    static isCloseToPlane(data: Point3d[] | Float64Array, plane: Plane3dByOriginAndUnitNormal, tolerance?: number): boolean;
    /**
     * Sum lengths of edges.
     * @param data points.
     */
    static sumEdgeLengths(data: Point3d[] | Float64Array, addClosureEdge?: boolean, maxPointsToUse?: number): number;
    /**
     * Count the number of points, but ...
     * * ignore trailing duplicates of point 0.
     * * return 0 if there are any duplicates within the remaining points.
     * @param points points to examine.
     */
    static countNonDuplicates(points: Point3d[], tolerance?: number): number;
    /**
     * Return an array containing clones of the Point3d data[]
     * @param data source data
     */
    static clonePoint3dArray(data: XYZProps[] | Float64Array): Point3d[];
    /**
     * Return an array containing Point2d with xy parts of each Point3d
     * @param data source data
     */
    static clonePoint2dArray(data: XYAndZ[]): Point2d[];
    /**
     * clone points in the input array, inserting points within each edge to limit edge length.
     * @param points array of points
     * @param maxEdgeLength max length of an edge
     */
    static cloneWithMaxEdgeLength(points: Point3d[], maxEdgeLength: number): Point3d[];
    /** Pack isolated x,y,z args as a json `[x,y,z]` */
    private static xyzToArray;
    /**
     * return similarly-structured array, array of arrays, etc, with the lowest level point data specifically structured as arrays of 3 numbers `[1,2,3]`
     * @param data point data with various leaf forms such as `[1,2,3]`, `{x:1,y:2,z:3}`, `Point3d`
     */
    static cloneDeepJSONNumberArrays(data: MultiLineStringDataVariant): number[][];
    /**
     * clone an array of [[XYZProps]] data, specifically as arrays of 3 numbers
     */
    static cloneXYZPropsAsNumberArray(data: XYZProps[]): number[][];
    /**
     * clone an array of [[XYZProps]] data, specifically as flattened array of number
     */
    static cloneXYZPropsAsFloat64Array(data: XYZProps[]): Float64Array;
    /**
     * return similarly-structured array, array of arrays, etc, with the lowest level point data specifically structured as `Point3d`.
     * @param data point data with various leaf forms such as `[1,2,3]`, `{x:1,y:2,z:3}`, `Point3d`
     */
    static cloneDeepXYZPoint3dArrays(data: MultiLineStringDataVariant): any[];
    /**
     * return perpendicular distance from points[indexB] to the segment points[indexA] to points[indexC].
     * * extrapolation option when projection is outside of fraction range 0..1 are:
     *   * false ==> measure distance to closest endpoint
     *   * true ==> measure distance to extended line segment.
     * (no index checking!)
     */
    static distanceIndexedPointBToSegmentAC(points: Point3d[], indexA: number, indexB: number, indexC: number, extrapolate: boolean): number;
    /** Computes the hull of the XY projection of points.
     * * Returns the hull as an array of Point3d
     * * Optionally returns non-hull points in `insidePoints[]`
     * * If both arrays empty if less than 3 points.
     * *
     */
    static computeConvexHullXY(points: Point3d[], hullPoints: Point3d[], insidePoints: Point3d[], addClosurePoint?: boolean): void;
    /**
     * Return (clones of) points in data[] with min and max x and y parts.
     * @param data array to examine.
     */
    static minMaxPoints(data: Point3d[]): {
        minXPoint: Point3d;
        maxXPoint: Point3d;
        minYPoint: Point3d;
        maxYPoint: Point3d;
    } | undefined;
}
