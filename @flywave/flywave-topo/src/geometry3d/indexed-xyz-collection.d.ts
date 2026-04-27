import { type XYZ, Point3d, Vector3d } from "./point3d-vector3d";
import { Range3d } from "./range";
import { type XYAndZ } from "./xyz-props";
/**
 * abstract base class for read-only access to XYZ data with indexed reference.
 * * This allows algorithms to work with Point3d[] or GrowableXYZ.
 *   * GrowableXYZArray implements these for its data.
 *   * Point3dArrayCarrier carries a (reference to) a Point3d[] and implements the methods with calls on that array reference.
 * * In addition to "point by point" accessors, other abstract members compute commonly useful vector data "between points".
 * * Methods that create vectors among multiple indices allow callers to avoid creating temporaries.
 * @public
 */
export declare abstract class IndexedXYZCollection {
    /**
     * Return the point at `index` as a strongly typed Point3d.
     * @param index index of point within the array
     * @param result caller-allocated destination
     * @returns undefined if the index is out of bounds
     */
    abstract getPoint3dAtCheckedPointIndex(index: number, result?: Point3d): Point3d | undefined;
    /**
     * Return the point at `index` as a strongly typed Point3d, without checking the point index validity.
     * @param index index of point within the array
     * @param result caller-allocated destination
     * @returns undefined if the index is out of bounds
     */
    abstract getPoint3dAtUncheckedPointIndex(index: number, result?: Point3d): Point3d;
    /**
     * Get from `index` as a strongly typed Vector3d.
     * @param index index of point within the array
     * @param result caller-allocated destination
     * @returns undefined if the index is out of bounds
     */
    abstract getVector3dAtCheckedVectorIndex(index: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Return a vector from the point at `indexA` to the point at `indexB`
     * @param indexA index of point within the array
     * @param indexB index of point within the array
     * @param result caller-allocated vector.
     * @returns undefined if either index is out of bounds
     */
    abstract vectorIndexIndex(indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Return a vector from `origin` to the point at `indexB`
     * @param origin origin for vector
     * @param indexB index of point within the array
     * @param result caller-allocated vector.
     * @returns undefined if index is out of bounds
     */
    abstract vectorXYAndZIndex(origin: XYAndZ, indexB: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Return a vector from the point at `indexA` to `target`
     * @param indexA index of point within the array
     * @param target target for vector
     * @param result caller-allocated vector.
     * @returns undefined if index is out of bounds
     */
    vectorIndexXYAndZ(indexA: number, target: XYAndZ, result?: Vector3d): Vector3d | undefined;
    /**
     * Return the dot product of the vectors from the point at `origin` to the points at `indexA` and `indexB`.
     * @param origin index of point within the array; origin of both vectors
     * @param indexA index of point within the array; target of the first vector
     * @param indexA index of point within the array; target of the second vector
     * @returns undefined if index is out of bounds
     */
    dotProductIndexIndexIndex(origin: number, indexA: number, indexB: number): number | undefined;
    /**
     * Return the dot product of the vectors from the point at `origin` to the point at `indexA` and to `targetB`.
     * @param origin index of point within the array; origin of both vectors
     * @param indexA index of point within the array; target of the first vector
     * @param targetB target for second vector
     * @returns undefined if index is out of bounds
     */
    dotProductIndexIndexXYAndZ(origin: number, indexA: number, targetB: XYAndZ): number | undefined;
    /**
     * Return the cross product of the vectors from `origin` to points at `indexA` and `indexB`
     * @param origin origin for vector
     * @param indexA index of first target within the array
     * @param indexB index of second target within the array
     * @param result caller-allocated vector.
     * @returns undefined if either index is out of bounds
     */
    abstract crossProductXYAndZIndexIndex(origin: XYAndZ, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Return the cross product of the vectors from `origin` to the point at `indexA` and to `targetB`
     * @param origin index of point within the array; origin of both vectors
     * @param indexA index of point within the array; target of the first vector
     * @param targetB target of second vector
     * @param result optional caller-allocated result to fill and return
     * @returns undefined if an index is out of bounds
     */
    crossProductIndexIndexXYAndZ(origin: number, indexA: number, targetB: XYAndZ, result?: Vector3d): Vector3d | undefined;
    /**
     * Return the cross product of vectors from `origin` to points at `indexA` and `indexB`
     * @param origin origin for vector
     * @param indexA index of first target within the array
     * @param indexB index of second target within the array
     * @param result optional caller-allocated vector.
     * @returns undefined if either index is out of bounds
     */
    abstract crossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result?: Vector3d): Vector3d | undefined;
    /**
     * Return the cross product of vectors from origin point at `indexA` to target points at `indexB` and `indexC`
     * @param origin index of origin
     * @param indexA index of first target within the array
     * @param indexB index of second target within the array
     * @param result caller-allocated vector.
     * @returns return true if indexA, indexB both valid
     */
    abstract accumulateCrossProductIndexIndexIndex(origin: number, indexA: number, indexB: number, result: Vector3d): void;
    /**
     * read-only property for number of XYZ in the collection.
     */
    abstract get length(): number;
    /**
     * Return distance squared between indicated points.
     * @param index0 first point index
     * @param index1 second point index
     */
    abstract distanceSquaredIndexIndex(index0: number, index1: number): number | undefined;
    /**
     * Return distance squared between the point at index0 and target.
     * @param index0 first point index
     * @param target second point
     */
    distanceSquaredIndexXYAndZ(index0: number, target: XYAndZ): number | undefined;
    /**
     * Return distance between indicated points.
     * @param index0 first point index
     * @param index1 second point index
     */
    abstract distanceIndexIndex(index0: number, index1: number): number | undefined;
    /** Adjust index into range by modulo with the length. */
    cyclicIndex(i: number): number;
    /** Return the range of the points. */
    getRange(): Range3d;
    /**
     * For each run of points with indices i+1 to i+n within distance tolerance of points[i], return the indices i+1, ..., i+n.
     * @return ordered array of 0-based indices of duplicate points
     */
    findOrderedDuplicates(tolerance?: number): number[];
    /** Accumulate scale times the x,y,z values at index.
     * * No action if index is out of bounds.
     */
    abstract accumulateScaledXYZ(index: number, scale: number, sum: Point3d): void;
    /** Compute the linear combination s of the indexed p_i and given scales s_i.
     * @param scales array of scales. For best results, scales should have same length as the instance.
     * @param result optional pre-allocated object to fill and return
     * @return s = sum(p_i * s_i), where i ranges from 0 to min(this.length, scales.length).
     */
    linearCombination(scales: number[], result?: Point3d | Vector3d): XYZ;
    /**
     * Interpolate the points at the given indices.
     * @param index0 index of point p0 within the array
     * @param fraction fraction f such that returned point is p0 + f * (p1 - p0)
     * @param index1 index of point p1 within the array
     * @param result optional caller-allocated result to fill and return
     * @returns undefined if an index is out of bounds
     */
    interpolateIndexIndex(index0: number, fraction: number, index1: number, result?: Point3d): Point3d | undefined;
    /** access x of indexed point */
    abstract getXAtUncheckedPointIndex(pointIndex: number): number;
    /** access y of indexed point */
    abstract getYAtUncheckedPointIndex(pointIndex: number): number;
    /** access z of indexed point */
    abstract getZAtUncheckedPointIndex(pointIndex: number): number;
    /** Return iterator over the points in this collection. Usage:
     * ```ts
     *  for (const point: Point3d of collection.points) { ... }
     * ```
     */
    get points(): Iterable<Point3d>;
    /** convert to Point3d[] */
    getArray(): Point3d[];
    /** Return the first point, or undefined if the array is empty. */
    front(result?: Point3d): Point3d | undefined;
    /** Return the last point, or undefined if the array is empty. */
    back(result?: Point3d): Point3d | undefined;
}
/**
 * abstract base class extends IndexedXYZCollection, adding methods to push, peek, and pop, and rewrite.
 * @public
 */
export declare abstract class IndexedReadWriteXYZCollection extends IndexedXYZCollection {
    /** push a (clone of) point onto the collection
     * * point itself is not pushed -- xyz data is extracted into the native form of the collection.
     */
    abstract push(data: XYAndZ): void;
    /**
     * push a new point (given by coordinates) onto the collection
     * @param x x coordinate
     * @param y y coordinate
     * @param z z coordinate
     */
    abstract pushXYZ(x?: number, y?: number, z?: number): void;
    /** remove the final point. */
    abstract pop(): void;
    /**  clear all entries */
    abstract clear(): void;
    /** reverse the points in place. */
    abstract reverseInPlace(): void;
}
