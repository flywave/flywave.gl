import { type IndexedXYZCollection } from "./indexed-xyz-collection";
import { Plane3dByOriginAndUnitNormal } from "./plane3d-by-origin-and-unit-normal";
import { Point3d } from "./point3d-vector3d";
import { Range1d } from "./range";
/**
 * PolylineOps is a collection of static methods operating on polylines.
 * @public
 */
export declare class PolylineOps {
    /**
     * Return a Range1d with the shortest and longest edge lengths of the polyline.
     * @param points points to examine.
     */
    static edgeLengthRange(points: Point3d[]): Range1d;
    /**
     * Return a simplified subset of given points.
     * * Points are removed by the Douglas-Puecker algorithm, viz https://en.wikipedia.org/wiki/Ramer–Douglas–Peucker_algorithm
     * * This is a global search, with multiple passes over the data.
     * @param source
     * @param chordTolerance
     */
    static compressByChordError(source: Point3d[], chordTolerance: number): Point3d[];
    /**
     * Return a simplified subset of given points, omitting points if very close to their neighbors.
     * * This is a local search, with a single pass over the data.
     * @param source input points
     * @param maxEdgeLength
     */
    static compressShortEdges(source: Point3d[] | IndexedXYZCollection, maxEdgeLength: number): Point3d[];
    /**
     * Return a simplified subset of given points, omitting points of the triangle with adjacent points is small.
     * * This is a local search, with a single pass over the data.
     * @param source input points
     * @param maxEdgeLength
     */
    static compressSmallTriangles(source: Point3d[], maxTriangleArea: number): Point3d[];
    /**
     * Return a simplified subset of given points, omitting points if close to the edge between neighboring points before and after
     * * This is a local search, with a single pass over the data for each pass.
     * @param source input points
     * @param maxDistance omit points if this close to edge between points before and after
     * @param numPass max number of times to run the filter.  numPass=2 is observed to behave well.
     *
     */
    static compressByPerpendicularDistance(source: Point3d[], maxDistance: number, numPass?: number): Point3d[];
    private static squaredDistanceToInterpolatedPoint;
    /**
     * test if either
     *   * points[indexA] matches pointQ
     *   * line from points[indexA] to points[indexB] overlaps points[indexA] to pointQ
     * @param points
     * @param pointQ
     * @param tolerance
     */
    private static isDanglerConfiguration;
    /**
     * Return a simplified subset of given points, omitting points on "danglers" that depart and return on a single path.
     * @param source input points
     * @param closed if true, an edge returning to point 0 is implied even if final point does not match.
     * @param tolerance tolerance for near-zero distance.
     */
    static compressDanglers(source: Point3d[], closed?: boolean, tolerance?: number): Point3d[];
    /**
     * Add closure points to a polyline or array of polylines
     * @param data points.
     */
    static addClosurePoint(data: Point3d[] | Point3d[][]): void;
    /**
     * Remove closure points a polyline or array of polylines
     * @param data points.
     */
    static removeClosurePoint(data: Point3d[] | Point3d[][]): void;
    /** Create an array of planes.
     * * First plane has origin at first centerline point, with unit normal directed at the next point.
     * * Intermediate planes have origin at intermediate points, with unit normals computed from the average of unit vectors along the incoming and outgoing segments.
     * * Last plane has origin at last centerline point, with unit normal directed from previous point.
     * * All sets of adjacent coincident points are reduced to a single point.
     *    * Hence the output array may have fewer points than the centerline.
     * * If there are one or fewer distinct input points, the return is undefined
     * @param centerline points to reside in output planes
     * @param wrapIfPhysicallyClosed if true and the first and last centerline points are the same, then the first and last output planes are averaged and equated (cloned).
     */
    static createBisectorPlanesForDistinctPoints(centerline: IndexedXYZCollection | Point3d[], wrapIfPhysicallyClosed?: boolean): Plane3dByOriginAndUnitNormal[] | undefined;
}
