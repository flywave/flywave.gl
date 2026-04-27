import { Angle } from "../geometry3d/angle";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { HalfEdgeGraph } from "./graph";
/**
 * Context manager to hold a vu graph and do spine operations
 *
 * Spine calculations determine both (a) a "skeletal" network of linework that follows the interior
 *      path through within the boundaries, and (b) a block decomposition into quads and triangles.
 *
 * Usage pattern:
 * ```
 *    const sc = new HalfEdgeGraphSpineContext();
 *   // Data setup ....
 *    foreach polygon or polyline
 *        {
 *        sc.InsertEdges (edgePoints, bClosed)
 *        }
 *   // Analysis steps ...
 *     * bParity = true to treat the data as a "polygon".  The interior is determined by parity rules
 *                   and the triangulation and spine are only constructed "inside"
 *     * bParity = false if "all" spaces are to be triangulated and spined.
 *     * minSplitRadians -- suggested value 0.3.  If this value is large, it will encourage add internal
 *     *     edges from a vertex to an edge 'across' the polygon even if it creates small angles.
 *     * minDiagonalAngle -- suggested value 1.0.  If this value is large (up to about 1.5 as max) it favors
 *     *     using triangles to navigate turns.  If it is small, it favors using skewed quadrilaterals.
 *    sc.TriangulateForSpine (bParity, minSplitRadians)
 *    sc.MarkBoxes (true, minDiagonalAngle);
 *    edges = sc.GetSpineEdges ();
 * ```
 * @internal
 */
export declare class HalfEdgeGraphSpineContext {
    /** The Evolving graph */
    private readonly _spineGraph;
    /** mask marking edges that have been paired into quads */
    private readonly _diagonalMask;
    private readonly _boxMask;
    get graph(): HalfEdgeGraph;
    /**
     * Create a context with an empty graph.
     * * Reserve masks for specialized markup.
     */
    constructor();
    /**
     * Release resources to the graph.
     */
    teardown(): void;
    private addEdge;
    private getBoxCorners;
    private diagonalKeyFunc;
    private selectTriangleInteriorPoint;
    private markBox;
    private setSortedDiagonalMasks;
    private splitOK;
    private addPerpendicularsToBoundaries;
    private getSpineEdgesInQuad;
    private getSpineEdgesInTriangle;
    /** Add a polyline to the graph.
     * * This may be called multiple times
     */
    insertEdges(xyzIn: Point3d[], bClosed: boolean): void;
    /**
     * Look for trivial (2 edge) faces that have exteriorMask and non-masked on both sides.
     * * clear the mask
     * @param exteriorMask
     */
    private purgeNullFaces;
    private static readonly _regularize1;
    private static readonly _regularize2;
    /**
     * Triangulate the graph for the edges that have been inserted.
     * @param applyParity if true ()
     * @param minSplitRadians smallest allowed angle in the split sector that is split.
     */
    triangulateForSpine(applyParity?: boolean, minSplitRadians?: number): void;
    /**
     * Retrieve edges of the spine as arrays of points.
     * @param bIncludeInterior true to include fully internal segments
     * @param bIncludeFinal true to include segments that terminate at a boundary
     * @param bIncludeCornerSpokes
     * @return array of line data.
     */
    getSpineEdges(bIncludeInterior?: boolean, bIncludeFinal?: boolean, bIncludeCornerSpokes?: boolean): Point3d[][];
    /**
     * Intermediate markup step to identify quads between corresponding boundary edges.
     * * search for and mark triangle edges that should be treated as diagonal of a quad
     * * Angle logic is:
     *   * In a candidate quad (formed by joining triangles that share an edge)
     *   * form segments between opposite edges of the quad.
     *   * compute angles between these segments and the edges of their quads.
     *   * if this angle is larger than minAngleRadians, accept this as a quad.
     *   * recommended angle is between 15 and 5 degrees; 50 degrees is typical
     * @param bDeleteDiagonals if true, eliminate the diagonals.
     * @param minAngleRadians angle tolerance, as described above.
     */
    consolidateTrianglesToQuads(bDeleteDiagonals: boolean, minAngle?: Angle): number;
}
