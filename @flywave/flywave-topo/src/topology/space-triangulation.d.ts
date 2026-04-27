import { LineString3d } from "../curve/line-string3d";
import { type Point3d } from "../geometry3d/point3d-vector3d";
type AnnounceLoopAndTrianglesFunction = (loop: Point3d[], triangles: Point3d[][]) => void;
/**
 * Class with static methods to triangulate various forms of possibly non-planar polygons.
 * @public
 */
export declare class SpacePolygonTriangulation {
    /**
     * * Return a number which is:
     *   * 0 for collapsed (zero area) triangle
     *   * positive for non-zero area
     *   * larger is "better"
     * * Specifically, return (if well defined) the area divided by summed squares of edge lengths.
     * @param point0
     * @param point1
     * @param point2
     */
    static spaceTriangleAspectRatio(point0: Point3d, point1: Point3d, point2: Point3d): number;
    /**
     * * Treat a space quad as two triangles with interior diagonal from point0 to point2
     * * Return the smaller of the aspect ratios of the two triangles.
     * * The quad edges proceed in the order [point0, point1, point2, point3]
     * @param point0 first point of quad
     * @param point1 second point of quad (diagonally opposite of point3)
     * @param point2 third point (diagonally opposite point0)
     * @param point3 fourth point
     */
    static spaceQuadDiagonalAspectRatio(point0: Point3d, point1: Point3d, point2: Point3d, point3: Point3d): number;
    /** "Triangulate" by cutting of the ear with best aspect ratio.  Reject if successive normals have negative dot product with PolygonOps.AreaNormal */
    static triangulateGreedyEarCut(points: Point3d[], announceLoopAndTriangles: AnnounceLoopAndTrianglesFunction): boolean;
    private static triangulateSimplestSpaceLoopGo;
    /**
     * * Emit triangles for a (possibly non-planar) loop for various simple cases:
     *    * only 3 points: just emit that triangle.
     *    * only 4 points: split across a diagonal, choosing the one with better aspect ratios of its two triangles.
     * * BUT
     *    * do not complete the triangulation if perimeter is larger than maxPerimeter (i.e. only consider small areas)
     * * Hence it is expected that the caller will use this as the first attempt, possibly followed by calls to other more adventurous methods.
     */
    static triangulateSimplestSpaceLoop(loop: Point3d[] | LineString3d, announceLoopAndTriangles: AnnounceLoopAndTrianglesFunction, maxPerimeter?: number): boolean;
}
export {};
