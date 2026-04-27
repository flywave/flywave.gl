import { type PlaneAltitudeEvaluator } from "../geometry";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { IndexedReadWriteXYZCollection } from "./indexed-xyz-collection";
import { type Matrix3d } from "./matrix3d";
import { type Plane3dByOriginAndUnitNormal } from "./plane3d-by-origin-and-unit-normal";
import { Point2d } from "./point2d-vector2d";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { Range1d, Range3d } from "./range";
import { Transform } from "./transform";
import { type XYAndZ } from "./xyz-props";
/** `GrowableXYArray` manages a (possibly growing) Float64Array to pack xy coordinates.
 * @public
 */
export declare class GrowableXYZArray extends IndexedReadWriteXYZCollection {
    /**
     * array of packed xyz xyz xyz components
     */
    private _data;
    /**
     * Number of xyz triples (not floats) in the array
     */
    private _xyzInUse;
    /**
     * capacity in xyz triples. (not floats)
     */
    private _xyzCapacity;
    /**
     * multiplier used by ensureCapacity to expand requested reallocation size
     */
    private readonly _growthFactor;
    /** Construct a new GrowablePoint3d array.
     * @param numPoints initial capacity in xyz triples (default 8)
     * @param growthFactor used by ensureCapacity to expand requested reallocation size (default 1.5)
     */
    constructor(numPoints?: number, growthFactor?: number);
    /** Copy xyz points from source array. Does not reallocate or change active point count.
     * @param source array to copy from
     * @param sourceCount copy the first sourceCount points; all points if undefined
     * @param destOffset copy to instance array starting at this point index; zero if undefined
     * @return count and offset of points copied
     */
    protected copyData(source: Float64Array | number[], sourceCount?: number, destOffset?: number): {
        count: number;
        offset: number;
    };
    /** The number of points in use. When the length is increased, the array is padded with zeroes. */
    get length(): number;
    set length(newLength: number);
    /** Return the number of float64 in use. */
    get float64Length(): number;
    /** Return the raw packed data.
     * * Note that the length of the returned Float64Array is a count of doubles, and includes the excess capacity
     */
    float64Data(): Float64Array;
    /** If necessary, increase the capacity to the new number of points.  Current coordinates and point count (length) are unchanged. */
    ensureCapacity(pointCapacity: number, applyGrowthFactor?: boolean): void;
    /**
     * * If pointCount is less than current length, just reset current length to pointCount, effectively trimming active points but preserving original capacity.
     * * If pointCount is greater than current length, reallocate to exactly pointCount, copy existing points, and optionally pad excess with zero.
     * @param pointCount new number of active points in array
     * @param padWithZero when increasing point count, whether to zero out new points (default false)
     */
    resize(pointCount: number, padWithZero?: boolean): void;
    /**
     * Make a copy of the (active) points in this array.
     * (The clone does NOT get excess capacity)
     */
    clone(result?: GrowableXYZArray): GrowableXYZArray;
    /** Create an array from various point data formats.
     * Valid inputs are:
     * * Point2d
     * * Point3d
     * * An array of 2 doubles
     * * An array of 3 doubles
     * * A GrowableXYZArray
     * * Any json object satisfying Point3d.isXYAndZ
     * * Any json object satisfying Point3d.isXAndY
     * * A Float64Array of doubles, interpreted as xyzxyz
     * * An array of any of the above
     * @param data source points.
     * @param result optional pre-allocated GrowableXYZArray to clear and fill.
     */
    static create(data: any, result?: GrowableXYZArray): GrowableXYZArray;
    /** Restructure MultiLineStringDataVariant as array of GrowableXYZArray */
    static createArrayOfGrowableXYZArray(data: MultiLineStringDataVariant): GrowableXYZArray[] | undefined;
    /** push a point to the end of the array */
    push(toPush: XYAndZ): void;
    /** push all points of an array */
    pushAll(points: Point3d[]): void;
    /** Push points from variant sources.
     * Valid inputs are:
     * * Point2d
     * * Point3d
     * * An array of 2 doubles
     * * An array of 3 doubles
     * * A GrowableXYZArray
     * * Any json object satisfying Point3d.isXYAndZ
     * * Any json object satisfying Point3d.isXAndY
     * * A Float64Array of doubles, interpreted as xyzxyz
     * * An array of any of the above
     */
    pushFrom(p: any): void;
    /**
     * Replicate numWrap xyz values from the front of the array as new values at the end.
     * @param numWrap number of xyz values to replicate
     */
    pushWrap(numWrap: number): void;
    /** append a new point with given x,y,z */
    pushXYZ(x: number, y: number, z: number): void;
    /** Shift all data forward to make space for numPoints at the front.
     * * Leading (3*numPoints) doubles are left with prior contents.
     * * _xyzInUse count is increased
     */
    private shiftForward;
    /** prepend a new point with given x,y,z
     * * Remark: this copies all content forward.
     */
    pushFrontXYZ(x: number, y: number, z: number): void;
    /** prepend a new point at the front of the array.
     *
     */
    pushFront(toPush: XYAndZ): void;
    /** move the coordinates at fromIndex to toIndex.
     * * No action if either index is invalid.
     */
    moveIndexToIndex(fromIndex: number, toIndex: number): void;
    /** Remove one point from the back.
     * * NOTE that (in the manner of std::vector native) this is "just" removing the point -- no point is NOT returned.
     * * Use `back ()` to get the last x,y,z assembled into a `Point3d `
     */
    pop(): void;
    /**
     * Test if index is valid for an xyz (point or vector) within this array
     * @param index xyz index to test.
     */
    isIndexValid(index: number): boolean;
    /**
     * Clear all xyz data, but leave capacity unchanged.
     */
    clear(): void;
    /**
     * Get a point by index, strongly typed as a Point3d.  This is unchecked.  Use getPoint3dAtCheckedPointIndex to have validity test.
     * @param pointIndex index to access
     * @param result optional result
     */
    getPoint3dAtUncheckedPointIndex(pointIndex: number, result?: Point3d): Point3d;
    /**
     * Get a point by index, strongly typed as a Point2d.  This is unchecked.  Use getPoint2dAtCheckedPointIndex to have validity test.
     * @param pointIndex index to access
     * @param result optional result
     */
    getPoint2dAtUncheckedPointIndex(pointIndex: number, result?: Point2d): Point2d;
    /** copy xyz into strongly typed Point3d */
    getPoint3dAtCheckedPointIndex(pointIndex: number, result?: Point3d): Point3d | undefined;
    /** access x of indexed point */
    getXAtUncheckedPointIndex(pointIndex: number): number;
    /** access y of indexed point */
    getYAtUncheckedPointIndex(pointIndex: number): number;
    /** access y of indexed point */
    getZAtUncheckedPointIndex(pointIndex: number): number;
    /** copy xy into strongly typed Point2d */
    getPoint2dAtCheckedPointIndex(pointIndex: number, result?: Point2d): Point2d | undefined;
    /** copy xyz into strongly typed Vector3d */
    getVector3dAtCheckedVectorIndex(vectorIndex: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Read coordinates from source array, place them at index within this array.
     * @param destIndex point index where coordinates are to be placed in this array
     * @param source source array
     * @param sourceIndex point index in source array
     * @returns true if destIndex and sourceIndex are both valid.
     */
    transferFromGrowableXYZArray(destIndex: number, source: GrowableXYZArray, sourceIndex: number): boolean;
    /**
     * push coordinates from the source array to the end of this array.
     * @param source source array
     * @param sourceIndex xyz index within the source.  If undefined, entire source is pushed.
     * @returns number of points pushed.
     */
    pushFromGrowableXYZArray(source: GrowableXYZArray, sourceIndex?: number): number;
    /**
     * Set the coordinates of a single point.
     * @param pointIndex index of point to set
     * @param value coordinates to set
     */
    setAtCheckedPointIndex(pointIndex: number, value: XYAndZ): boolean;
    /**
     * Set the coordinates of a single point given as coordinates
     * @param pointIndex index of point to set
     * @param x x coordinate
     * @param y y coordinate
     * @param z z coordinate
     */
    setXYZAtCheckedPointIndex(pointIndex: number, x: number, y: number, z: number): boolean;
    /**
     * Copy all points into a simple array of Point3d
     */
    getPoint3dArray(): Point3d[];
    /** multiply each point by the transform, replace values. */
    static multiplyTransformInPlace(transform: Transform, data: GrowableXYZArray[] | GrowableXYZArray): void;
    /** multiply each point by the transform, replace values. */
    multiplyTransformInPlace(transform: Transform): void;
    /** reverse the order of points. */
    reverseInPlace(): void;
    /** multiply each xyz (as a vector) by matrix, replace values. */
    multiplyMatrix3dInPlace(matrix: Matrix3d): void;
    /** multiply each xyz (as a vector) by matrix inverse transpose, renormalize the vector, replace values.
     * * This is the way to apply a matrix (possibly with skew and scale) to a surface normal, and
     *      have it end up perpendicular to the transformed in-surface vectors.
     * * Return false if matrix is not invertible or if any normalization fails.
     */
    multiplyAndRenormalizeMatrix3dInverseTransposeInPlace(matrix: Matrix3d): boolean;
    /** multiply each xyz (as a point) by a homogeneous matrix and update as the normalized point
     *
     */
    multiplyMatrix4dAndQuietRenormalizeMatrix4d(matrix: Matrix4d): void;
    /** multiply each point by the transform, replace values. */
    tryTransformInverseInPlace(transform: Transform): boolean;
    /** Extend `range` to extend by all points. */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** get range of points. */
    getRange(transform?: Transform): Range3d;
    /** Initialize `range` with coordinates in this array. */
    setRange(range: Range3d, transform?: Transform): void;
    /** Sum the lengths of segments between points. */
    sumLengths(): number;
    /**
     * Multiply each x,y,z by the scale factor.
     * @param factor
     */
    scaleInPlace(factor: number): void;
    /** test if all points are within tolerance of a plane. */
    isCloseToPlane(plane: Plane3dByOriginAndUnitNormal, tolerance?: number): boolean;
    /**
     * * If not already closed, push a copy of the first point.
     * * If already closed within tolerance, force exact copy
     * * otherwise leave unchanged.
     */
    forceClosure(tolerance?: number): void;
    /** Compute a point at fractional coordinate between points i and j */
    interpolate(i: number, fraction: number, j: number, result?: Point3d): Point3d | undefined;
    /**
     * * Compute a point at fractional coordinate between points i and j of source
     * * push onto this array.
     */
    pushInterpolatedFromGrowableXYZArray(source: GrowableXYZArray, i: number, fraction: number, j: number): void;
    /** Sum the signed areas of the projection to xy plane */
    areaXY(): number;
    /** Compute a vector from index origin i to indexed target j  */
    vectorIndexIndex(i: number, j: number, result?: Vector3d): Vector3d | undefined;
    /** Compute a vector from origin to indexed target j */
    vectorXYAndZIndex(origin: XYAndZ, j: number, result?: Vector3d): Vector3d | undefined;
    /** Compute the cross product of vectors from from indexed origin to indexed targets i and j */
    crossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number, result?: Vector3d): Vector3d | undefined;
    /** Compute the dot product of pointIndex with [x,y,z] */
    evaluateUncheckedIndexDotProductXYZ(pointIndex: number, x: number, y: number, z: number): number;
    /** Compute the dot product of pointIndex with [x,y,z] */
    evaluateUncheckedIndexPlaneAltitude(pointIndex: number, plane: PlaneAltitudeEvaluator): number;
    /**
     * * compute the cross product from indexed origin t indexed targets targetAIndex and targetB index.
     * * accumulate it to the result.
     */
    accumulateCrossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number, result: Vector3d): void;
    /**
     * * compute the cross product from indexed origin t indexed targets targetAIndex and targetB index.
     * * accumulate it to the result.
     */
    accumulateScaledXYZ(index: number, scale: number, sum: Point3d): void;
    /** Compute the cross product of vectors from from origin to indexed targets i and j */
    crossProductXYAndZIndexIndex(origin: XYAndZ, targetAIndex: number, targetBIndex: number, result?: Vector3d): Vector3d | undefined;
    /** Return the distance between an array point and the input point. */
    distanceIndexToPoint(i: number, spacePoint: XYAndZ): number | undefined;
    /**
     * Return distance squared between indicated points.
     * @param i first point index
     * @param j second point index
     */
    distanceSquaredIndexIndex(i: number, j: number): number | undefined;
    /**
     * Return distance between indicated points.
     * @param i first point index
     * @param j second point index
     */
    distanceIndexIndex(i: number, j: number): number | undefined;
    /** Return the distance between points in distinct arrays. */
    static distanceBetweenPointsIn2Arrays(arrayA: GrowableXYZArray, i: number, arrayB: GrowableXYZArray, j: number): number | undefined;
    /** test for near equality between two `GrowableXYZArray`. */
    static isAlmostEqual(dataA: GrowableXYZArray | undefined, dataB: GrowableXYZArray | undefined): boolean;
    /** Return an array of block indices sorted per compareLexicalBlock function */
    sortIndicesLexical(): Uint32Array;
    /** compare two blocks in simple lexical order. */
    compareLexicalBlock(ia: number, ib: number): number;
    /** Access a single double at offset within a block.  This has no index checking. */
    component(pointIndex: number, componentIndex: number): number;
    /**
     * add points at regular steps from `other`
     * @param source
     * @param pointIndex0
     * @param step
     * @param numAdd
     */
    addSteppedPoints(other: GrowableXYZArray, pointIndex0: number, step: number, numAdd: number): void;
    /**
     * find the min and max distance between corresponding indexed points.   Excess points are ignored.
     * @param arrayA first array
     * @param arrayB second array
     */
    static distanceRangeBetweenCorrespondingPoints(arrayA: GrowableXYZArray, arrayB: GrowableXYZArray): Range1d;
    /**
     * remove trailing point(s) within tolerance of the start point.
     * @param points
     * @param tolerance
     */
    static removeClosure(points: IndexedReadWriteXYZCollection, tolerance?: number): void;
    /**
     * Compute frame for a triangle formed by three (unchecked!) points identified by index.
     * * z direction of frame is 001.
     * * Transform axes from origin to targetA and targetB
     * * in local coordinates (u,v,w) the xy interior of the triangle is `u>=0, v>= 0, w>= 0, u+v+w<1`
     * * Return undefined if transform is not invertible, e.g. if points are in a vertical plane.
     */
    fillLocalXYTriangleFrame(originIndex: number, targetAIndex: number, targetBIndex: number, result?: Transform): Transform | undefined;
    /**
     * Pass the (x,y,z) of each point to a function which returns a replacement for one of the 3 components.
     * @param componentIndex Index (0,1,2) of component to be replaced.
     * @param func function to be called as `func(x,y,z)`, returning a replacement value for componentIndex
     */
    mapComponent(componentIndex: 0 | 1 | 2, func: (x: number, y: number, z: number) => number): void;
}
