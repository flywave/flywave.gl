import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { GrowableXYZArray } from "./growable-xyz-array";
import { IndexedXYCollection } from "./indexed-xy-collection";
import { type Matrix3d } from "./matrix3d";
import { Point2d, Vector2d } from "./point2d-vector2d";
import { Point3d } from "./point3d-vector3d";
import { type Range2d } from "./range";
import { type Transform } from "./transform";
import { type XAndY, type XYAndZ } from "./xyz-props";
/** `GrowableXYArray` manages a (possibly growing) Float64Array to pack xy coordinates.
 * @public
 */
export declare class GrowableXYArray extends IndexedXYCollection {
    /**
     * array of packed xy xy xy components
     */
    private _data;
    /**
     * Number of xy tuples (not floats) in the array
     */
    private _xyInUse;
    /**
     * capacity in xy tuples. (not floats)
     */
    private _xyCapacity;
    /**
     * multiplier used by ensureCapacity to expand requested reallocation size
     */
    private readonly _growthFactor;
    /** Construct a new GrowablePoint2d array.
     * @param numPoints initial capacity in xy tuples (default 8)
     * @param growthFactor used by ensureCapacity to expand requested reallocation size (default 1.5)
     */
    constructor(numPoints?: number, growthFactor?: number);
    /** Copy xy points from source array. Does not reallocate or change active point count.
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
    /** If necessary, increase the capacity to a new pointCount.  Current coordinates and point count (length) are unchanged. */
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
    clone(): GrowableXYArray;
    /** Create an array populated from
     * Valid inputs are:
     * * Point2d
     * * Point3d
     * * An array of 2 doubles
     * * An array of 3 doubles
     * * A GrowableXYZArray
     * * A GrowableXYArray
     * * Any json object satisfying Point3d.isXAndY
     * * A Float64Array of doubles, interpreted as xyxy
     * * An array of any of the above
     */
    static create(data: any, result?: GrowableXYArray): GrowableXYArray;
    /** Restructure MultiLineStringDataVariant as array of GrowableXYZArray
     * @deprecated in 4.x. Moved to GrowableXYZArray class.
     */
    static createArrayOfGrowableXYZArray(data: MultiLineStringDataVariant): GrowableXYZArray[] | undefined;
    /** push a point to the end of the array */
    push(toPush: XAndY): void;
    /** push all points of an array */
    pushAll(points: XAndY[]): void;
    /** push all points of an array */
    pushAllXYAndZ(points: XYAndZ[] | GrowableXYZArray): void;
    /** Push points from variant sources.
     * Valid inputs are:
     * * Point2d
     * * Point3d
     * * An array of 2 doubles
     * * A GrowableXYArray
     * * A GrowableXYZArray
     * * Any json object satisfying Point3d.isXAndY
     * * A Float64Array of doubles, interpreted as xyxy
     * * An array of any of the above
     */
    pushFrom(p: any): void;
    /**
     * Replicate numWrap xy values from the front of the array as new values at the end.
     * @param numWrap number of xy values to replicate
     */
    pushWrap(numWrap: number): void;
    /** push a point given by x,y coordinates */
    pushXY(x: number, y: number): void;
    /** Remove one point from the back.
     * * NOTE that (in the manner of std::vector native) this is "just" removing the point -- no point is NOT returned.
     * * Use `back ()` to get the last x,y assembled into a `Point2d `
     */
    pop(): void;
    /**
     * Test if index is valid for an xy (point or vector) within this array
     * @param index xy index to test.
     */
    isIndexValid(index: number): boolean;
    /**
     * Clear all xy data, but leave capacity unchanged.
     */
    clear(): void;
    /**
     * Get a point by index, strongly typed as a Point2d.  This is unchecked.  Use atPoint2dIndex to have validity test.
     * @param pointIndex index to access
     * @param result optional result
     */
    getPoint2dAtUncheckedPointIndex(pointIndex: number, result?: Point2d): Point2d;
    /**
     * Get x coordinate by point index, with no index checking
     * @param pointIndex index to access
     */
    getXAtUncheckedPointIndex(pointIndex: number): number;
    /**
     * Get y coordinate by point index, with no index checking
     * @param pointIndex index to access
     */
    getYAtUncheckedPointIndex(pointIndex: number): number;
    /**
     * Gather all points as a Point2d[]
     */
    getPoint2dArray(): Point2d[];
    /** copy xy into strongly typed Point2d */
    getPoint2dAtCheckedPointIndex(pointIndex: number, result?: Point2d): Point2d | undefined;
    /** copy xy into strongly typed Vector2d */
    getVector2dAtCheckedVectorIndex(vectorIndex: number, result?: Vector2d): Vector2d | undefined;
    /**
     * Read coordinates from source array, place them at index within this array.
     * @param destIndex point index where coordinates are to be placed in this array
     * @param source source array
     * @param sourceIndex point index in source array
     * @returns true if destIndex and sourceIndex are both valid.
     */
    transferFromGrowableXYArray(destIndex: number, source: GrowableXYArray, sourceIndex: number): boolean;
    /**
     * push coordinates from the source array to the end of this array.
     * @param source source array
     * @param sourceIndex xy index within the source.  If undefined, push entire contents of source
     * @returns number of points pushed.
     */
    pushFromGrowableXYArray(source: GrowableXYArray, sourceIndex?: number): number;
    /**
     * * Compute a point at fractional coordinate between points i and j of source
     * * push onto this array.
     */
    pushInterpolatedFromGrowableXYArray(source: GrowableXYArray, i: number, fraction: number, j: number): void;
    /**
     * Create an array of xy points from source xyz points.
     * @param source source array of xyz
     * @param transform optional transform to apply to xyz points.
     * @param dest optional result.
     */
    static createFromGrowableXYZArray(source: GrowableXYZArray, transform?: Transform, dest?: GrowableXYArray): GrowableXYArray;
    /**
     * Return the first point, or undefined if the array is empty.
     */
    front(result?: Point2d): Point2d | undefined;
    /**
     * Return the last point, or undefined if the array is empty.
     */
    back(result?: Point2d): Point2d | undefined;
    /**
     * Set the coordinates of a single point.
     * @param pointIndex index of point to set
     * @param value coordinates to set
     */
    setAtCheckedPointIndex(pointIndex: number, value: XAndY): boolean;
    /**
     * Set the coordinates of a single point given as coordinates.
     * @param pointIndex index of point to set
     * @param x x coordinate
     * @param y y coordinate
     */
    setXYAtCheckedPointIndex(pointIndex: number, x: number, y: number): boolean;
    /**
     * Set the coordinates of a single point given as coordinates.
     * @deprecated in 3.x. Use setXYAtCheckedPointIndex instead
     */
    setXYZAtCheckedPointIndex(pointIndex: number, x: number, y: number): boolean;
    /**
     * Copy all points into a simple array of Point3d with given z.
     */
    getPoint3dArray(z?: number): Point3d[];
    /** reverse the order of points. */
    reverseInPlace(): void;
    /** multiply each point by the transform, replace values. */
    multiplyTransformInPlace(transform: Transform): void;
    /** multiply each xy (as a vector) by matrix, replace values. */
    multiplyMatrix3dInPlace(matrix: Matrix3d): void;
    /** multiply each point by the transform, replace values. */
    tryTransformInverseInPlace(transform: Transform): boolean;
    /** Extend a `Range2d`, optionally transforming the points. */
    extendRange(rangeToExtend: Range2d, transform?: Transform): void;
    /** sum the lengths of segments between points. */
    sumLengths(): number;
    /**
     * Multiply each x,y by the scale factor.
     * @param factor
     */
    scaleInPlace(factor: number): void;
    /** Compute a point at fractional coordinate between points i and j */
    interpolate(i: number, fraction: number, j: number, result?: Point2d): Point2d | undefined;
    /** Sum the signed areas of the projection to xy plane */
    areaXY(): number;
    /** Compute a vector from index origin i to indexed target j  */
    vectorIndexIndex(i: number, j: number, result?: Vector2d): Vector2d | undefined;
    /** Compute a vector from origin to indexed target j */
    vectorXAndYIndex(origin: XAndY, j: number, result?: Vector2d): Vector2d | undefined;
    /** Compute the cross product of vectors from from indexed origin to indexed targets i and j */
    crossProductIndexIndexIndex(originIndex: number, targetAIndex: number, targetBIndex: number): number | undefined;
    /** Compute the cross product of vectors from from origin to indexed targets i and j */
    crossProductXAndYIndexIndex(origin: XAndY, targetAIndex: number, targetBIndex: number): number | undefined;
    /** Return the distance between two points in the array. */
    distance(i: number, j: number): number | undefined;
    /** Return the distance between an array point and the input point. */
    distanceIndexToPoint(i: number, spacePoint: Point2d): number | undefined;
    /** Test for nearly equal arrays. */
    static isAlmostEqual(dataA: GrowableXYArray | undefined, dataB: GrowableXYArray | undefined): boolean;
    /** Return an array of block indices sorted per compareLexicalBlock function */
    sortIndicesLexical(): Uint32Array;
    /** compare two blocks in simple lexical order. */
    compareLexicalBlock(ia: number, ib: number): number;
    /** Access a single double at offset within a block.  This has no index checking. */
    component(pointIndex: number, componentIndex: number): number;
    /** Toleranced equality test */
    isAlmostEqual(other: GrowableXYArray, tolerance?: number): boolean;
}
