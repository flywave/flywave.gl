import { type GrowableXYZArray } from "./growable-xyz-array";
import { type IndexedReadWriteXYZCollection, type IndexedXYZCollection } from "./indexed-xyz-collection";
import { type Point3d } from "./point3d-vector3d";
/** context class for Puecker-Douglas polyline compression, viz https://en.wikipedia.org/wiki/Ramer–Douglas–Peucker_algorithm
 * @internal
 */
export declare class PolylineCompressionContext {
    /** Caller provides source and tolerance.
     * * pointer to source is retained, but contents of source are never modified.
     */
    private constructor();
    private readonly _source;
    private readonly _dest;
    /** Squared tolerance for equal point. */
    private readonly _toleranceSquared;
    /** push (clone of) the point at index i from the source to the growing result.
     * * index is adjusted cyclically to source index range by modulo.
     */
    private acceptPointByIndex;
    /** work data used by find max deviation */
    private static readonly _vector01;
    private static readonly _vectorQ;
    /**
     * Return index of max magnitude of cross product of vectors (index to index+1) and (index to index+2)
     * * Return undefined if unable to find a nonzero cross product.
     * @param i0 first cross product central index.
     * @param i1 last cross product central index.
     */
    private indexOfMaxCrossProduct;
    /**
     * Return interior index where max deviation in excess of tolerance occurs.
     * @param i0 first index of interval
     * @param i1 INCLUSIVE final index
     */
    private indexOfMaxDeviation;
    /**
     *
     * @param i0 first active point index
     * @param i1 last active point index (INCLUSIVE -- not "one beyond")
     * @param chordTolerance
     * @param result
     */
    private recursiveCompressByChordErrorGo;
    /**
     * Return a point array with a subset of the input points.
     * * This is a global analysis (Douglas-Peucker)
     * @param source input points.
     * @param chordTolerance Points less than this distance from a retained edge may be ignored.
     */
    static compressPoint3dArrayByChordError(source: Point3d[], chordTolerance: number): Point3d[];
    /**
     * * Return a polyline with a subset of the input points.
     * * This is a global analysis (Douglas-Peucker)
     * * Global search for vertices that are close to edges between widely separated neighbors.
     * * Recurses to smaller subsets.
     * @param source input points
     * @param dest output points.  Must be different from source.
     * @param chordTolerance Points less than this distance from a retained edge may be ignored.
     */
    static compressCollectionByChordError(source: IndexedXYZCollection, dest: IndexedReadWriteXYZCollection, chordTolerance: number): void;
    /** Copy points from source to dest, omitting those too close to predecessor.
     * * First and last points are always preserved.
     */
    static compressInPlaceByShortEdgeLength(data: GrowableXYZArray, edgeLength: number): void;
    /** Copy points from source to dest, omitting those too close to predecessor.
     * * First and last points are always preserved.
     */
    static compressInPlaceBySmallTriangleArea(data: GrowableXYZArray, triangleArea: number): void;
    /** Copy points from source to dest, omitting those too close to edge between neighbors.
     * * First and last points are always preserved.
     */
    static compressInPlaceByPerpendicularDistance(data: GrowableXYZArray, perpendicularDistance: number, maxExtensionFraction?: number): void;
    /**
     * IF the first and last points are close AND first and last segments are colinear, remove first and last points.  Prior second to last becomes replicated start and end.
     * * Expected to be called "last" after other compressions, so points "next to" shared first and last are good to keep.
     * @param points
     * @param perpendicularDistance
     */
    static compressColinearWrapInPlace(points: Point3d[], tolerance: number): void;
}
