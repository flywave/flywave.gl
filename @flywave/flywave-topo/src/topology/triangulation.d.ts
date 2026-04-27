import { IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type XAndY, type XYAndZ } from "../geometry3d/xyz-props";
import { HalfEdge, HalfEdgeGraph, HalfEdgeMask } from "./graph";
import { MarkedEdgeSet } from "./half-edge-mark-set";
/**
 * type for use as signature for xyz data of a single linestring appearing in a parameter list.
 * @public
 */
export type LineStringDataVariant = IndexedXYZCollection | XYAndZ[] | XAndY[] | number[][];
/**
 * type for use as signature for multiple xyz data of multiple linestrings appearing in a parameter list.
 * @public
 */
export type MultiLineStringDataVariant = LineStringDataVariant | LineStringDataVariant[];
/**
 * (static) methods for triangulating polygons
 * * @internal
 */
export declare class Triangulator {
    /** Given the six nodes that make up two bordering triangles, "pinch" and relocate the nodes to flip them
     * * The shared edge mates are c and e.
     * * (abc) are a triangle in CCW order
     * * (dfe) are a triangle in CCW order. (!! node dfe instead of def.)
     */
    private static flipEdgeBetweenTriangles;
    /**
     * * nodeA is a given node
     * * nodeA1 is its nodeA.faceSuccessor
     * * nodeA2 is nodeA1.faceSuccessor, i.e. 3rd node of triangle A
     * * nodeB  is nodeA.edgeMate, i.e. a node in the "other" triangle at nodeA's edge
     * * nodeB1 is nodeB.faceSuccessor
     * * nodeB2 is nodeB1.faceSuccessor, i.e the 3rd node of triangle B
     * Construct (as simple doubles, to avoid object creation) xy vectors from:
     * * (ux,uy): nodeA to nodeA1, i.e. the shared edge
     * * (vx,vy): nodeA to nodeA2,
     * * (wx,wy): nodeA to nodeB2
     * * this determinant is positive if nodeA is "in the circle" of nodeB2, nodeA1, nodeA2
     * * Return true if clearly positive
     * * Return false if clearly negative or almost zero.
     * @param nodeA node on the diagonal edge of candidate for edge flip.
     */
    static computeInCircleDeterminantIsStrongPositive(nodeA: HalfEdge): boolean;
    /**
     *  *  Visit each node of the graph array
     *  *  If a flip would be possible, test the results of flipping using incircle condition
     *  *  If revealed to be an improvement, conduct the flip, mark involved nodes as unvisited, and repeat until all nodes are visited
     */
    static flipTriangles(graph: HalfEdgeGraph): number;
    /**
     *  *  Visit each node of the graph array
     *  *  If a flip would be possible, test the results of flipping using incircle condition
     *  *  If revealed to be an improvement, conduct the flip, mark involved nodes as unvisited, and repeat until all nodes are visited
     */
    static flipTrianglesInEdgeSet(graph: HalfEdgeGraph, edgeSet: MarkedEdgeSet): number;
    /** Create a graph with a triangulation points.
     * * The outer limit of the graph is the convex hull of the points.
     * * The outside loop is marked `HalfEdgeMask.EXTERIOR`
     */
    static createTriangulatedGraphFromPoints(points: Point3d[]): HalfEdgeGraph | undefined;
    /**
     * * Only one outer loop permitted.
     * * Largest area loop is assumed outer.
     * @param loops an array of loops
     * @returns triangulated graph, or undefined if bad data.
     */
    static createTriangulatedGraphFromLoops(loops: LineStringDataVariant[]): HalfEdgeGraph | undefined;
    /**
     * Triangulate all positive area faces of a graph.
     */
    static triangulateAllPositiveAreaFaces(graph: HalfEdgeGraph): boolean;
    /**
     * Triangulate the polygon made up of by a series of points.
     * * The loop may be either CCW or CW -- CCW order will be used for triangles.
     * * To triangulate a polygon with holes, use createTriangulatedGraphFromLoops
     */
    static createTriangulatedGraphFromSingleLoop(data: LineStringDataVariant): HalfEdgeGraph | undefined;
    /**
     * cautiously split the edge starting at baseNode.
     * * If baseNode is null, create a trivial loop with the single vertex at xy
     * * if xy is distinct from the coordinates at both baseNode and its successor, insert xy as a new node within that edge.
     * * also include z coordinate if present.
     */
    private static interiorEdgeSplit;
    /** Return length of data without wraparound point(s), if present */
    private static getUnwrappedLength;
    /** Create a loop from coordinates.
     * * Return a pointer to any node on the loop.
     * * no masking or other markup is applied.
     */
    static directCreateFaceLoopFromCoordinates(graph: HalfEdgeGraph, data: LineStringDataVariant): HalfEdge | undefined;
    /** Create chains from coordinates.
     * * Return array of pointers to base node of the chains.
     * * no masking or other markup is applied (save id).
     * @param graph New edges are built in this graph
     * @param data coordinate data
     * @param id id to attach to (both side of all) edges
     */
    static directCreateChainsFromCoordinates(graph: HalfEdgeGraph, data: MultiLineStringDataVariant, id?: number): HalfEdge[];
    /**
     * @param graph the containing graph
     * @param base The last node of a newly created loop.  (i.e. its `faceSuccessor` has the start xy)
     * @param returnPositiveAreaLoop if true, return the start node on the side with positive area.  otherwise return the left side as given.
     * @param maskForBothSides mask to apply on both sides.
     * @param maskForOtherSide mask to apply to the "other" side of the loop.
     * @return the loop's start node or its vertex successor, chosen to be the positive or negative loop per request.
     */
    private static maskAndOrientNewFaceLoop;
    /**
     * create a circular doubly linked list of internal and external nodes from polygon points in the specified winding order
     * * This applies the masks used by typical applications:
     *   * HalfEdgeMask.BOUNDARY on both sides
     *   * HalfEdgeMask.PRIMARY_EDGE on both sides.
     * * Use `createFaceLoopFromCoordinatesAndMasks` for detail control of masks.
     */
    static createFaceLoopFromCoordinates(graph: HalfEdgeGraph, data: LineStringDataVariant, returnPositiveAreaLoop: boolean, markExterior: boolean): HalfEdge | undefined;
    /**
     * create a circular doubly linked list of internal and external nodes from polygon points.
     * * Optionally jump to the "other" side so the returned loop has positive area
     * @param graph graph to receive the new edges
     * @param data array with x,y coordinates
     * @param returnPositiveAreaLoop if false, return an edge proceeding around the loop in the order given.  If true, compute the loop area and flip return the side with positive area.
     * @param maskForBothSides mask to apply on both sides.
     * @param maskForOtherSide mask to apply on the "other" side from the returned loop.
     */
    static createFaceLoopFromCoordinatesAndMasks(graph: HalfEdgeGraph, data: LineStringDataVariant, returnPositiveAreaLoop: boolean, maskForBothSides: HalfEdgeMask, maskForOtherSide: HalfEdgeMask): HalfEdge | undefined;
    /** Cut off an ear, forming a new face loop of nodes
     * @param ear the vertex being cut off.
     * *  Form two new nodes, alpha and beta, which have the coordinates one step away from the ear vertex.
     * *  Reassigns the pointers such that beta is left behind with the new face created
     * *  Reassigns the pointers such that alpha becomes the resulting missing node from the remaining polygon
     * * Reassigns prevZ and nextZ pointers
     */
    private static joinNeighborsOfEar;
    private static isInteriorTriangle;
    /**
     * Perform 0, 1, or more edge flips to improve aspect ratio just behind an ear that was just cut.
     * @param ear the triangle corner which just served as the ear node.
     * @returns the node at the back corner after flipping."appropriately positioned" node for the usual advance to ear.faceSuccessor.edgeMate.faceSuccessor.
     */
    private static doPostCutFlips;
    /**
     * main ear slicing loop which triangulates a polygon (given as a linked list)
     * While there still exists ear nodes that have not yet been triangulated...
     *
     * *  Check if the ear is hashed, and can easily be split off. If so, "join" that ear.
     * *  If not hashed, move on to a separate ear.
     * *  If no ears are currently hashed, attempt to cure self intersections or split the polygon into two before continuing
     */
    private static triangulateSingleFace;
    /** @internal  */
    private static sDebugGraph;
    /** @internal */
    private static sEnableDebugGraphCapture;
    /**
     * * returns the (possibly undefined) debug graph.
     * * sets the debug graph to undefined.
     * * disables subsequent saving.
     * @internal */
    static claimDebugGraph(): HalfEdgeGraph | undefined;
    /** Call (from within the triangulator) to announce a graph to be saved for debug.
     * * If debug graph capture is not enabled, do nothing.
     * * If debug graph capture is enabled, save this graph.
     * * This is called by internal steps at point of failure to preserve the failing graph for unit test examination.
     * @internal */
    static setDebugGraph(graph: HalfEdgeGraph | undefined): void;
    /**
     * * Clear the debug graph
     * * Set capture enabled to indicated value.
     * * Intended use:
     *   * By default "enabled" is false so there is no activity in the debug graph.
     *   * A unit test which needs to see graph after failure calls clearAndEnableDebugGraphCapture (true)
     *   * run the triangulation step
     *   * call claimDebugGraph.
     *   * claimDebugGraph reverts everything to default no-capture state.
     * @internal */
    static clearAndEnableDebugGraphCapture(value: boolean): void;
    /**
     * Whether a and b are in same vertex loop, or at the same xy location.
     * @internal
     */
    private static findAroundOrAtVertex;
    private static readonly _edgeInterval;
    private static readonly _earRange;
    private static readonly _edgeRange;
    private static readonly _planes;
    /** Check whether a polygon node forms a valid ear with adjacent nodes */
    private static isEar;
    /** link holeLoopNodes[1], holeLoopNodes[2] etc into the outer loop, producing a single-ring polygon without holes
     *
     */
    private static spliceLeftMostNodesOfHoles;
    /** For use in sorting -- return (signed) difference (a.x - b.x) */
    private static compareX;
    /** find a bridge between vertices that connects hole with an outer ring and and link it */
    private static eliminateHole;
    /**
     *  David Eberly algorithm for finding a bridge between hole and outer polygon:
     *  https://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf
     */
    private static findHoleBridge;
    private static getLeftmost;
    /**
     * Check if a point lies within a triangle.
     * * In other words, the areas of the 3 triangles formed by an edge of abc and p all have zero or positive area.
     */
    private static pointInTriangle;
    /** Check if node p lies strictly inside the triangle abc. */
    private static nodeInTriangle;
    /** signed area of a triangle
     * EDL 2/21 This is negative of usual CCW area.  Beware in callers !!!
     * (This originates in classic earcut code.)
     */
    private static signedCWTriangleArea;
    /** signed area of a triangle, with small positive corrected to zero by relTol
     */
    private static signedTolerancedCCWTriangleArea;
    /** check if two points are equal */
    private static isAlmostEqualXAndYXY;
    /** check if a b is inside the sector around a */
    private static locallyInside;
    /**
     * link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
     * if one belongs to the outer ring and another to a hole, it merges it into a single ring
     * * Returns the base of the new edge at the "a" end.
     * * "a" and "b" still represent the same physical pieces of edges
     * @returns Returns the (base of) the new half edge, at the "a" end.
     */
    private static splitFace;
    /**
     * Triangulate a single face with (linear time) logic applicable only if the lowNode is the lowest node.
     * @returns false if any monotonicity condition is violated.
     */
    static triangulateSingleMonotoneFace(graph: HalfEdgeGraph, start: HalfEdge): boolean;
}
