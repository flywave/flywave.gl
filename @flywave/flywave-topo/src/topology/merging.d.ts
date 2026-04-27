import { LineSegment3d } from "../curve/line-segment3d";
import { Range3d } from "../geometry3d/range";
import { ClusterableArray } from "../numerics/clusterable-array";
import { HalfEdge, HalfEdgeGraph, HalfEdgeMask } from "./graph";
import { type MultiLineStringDataVariant } from "./triangulation";
export declare class GraphSplitData {
    numUpEdge: number;
    numIntersectionTest: number;
    numSplit: number;
    numPopOut: number;
    numA0B0: number;
    numA0B1: number;
    constructor();
}
/**
 * Structure for data used when sorting outbound edges "around a node"
 */
export declare class VertexNeighborhoodSortData {
    index: number;
    radiusOfCurvature: number;
    node: HalfEdge;
    radians?: number;
    constructor(index: number, key: number, node: HalfEdge, radians?: number);
}
/** Function signature for announcing a vertex neighborhood during sorting. */
export type AnnounceVertexNeighborhoodSortData = (data: VertexNeighborhoodSortData[]) => any;
/**
 * * Assorted methods used in algorithms on HalfEdgeGraph.
 * @internal
 */
export declare class HalfEdgeGraphOps {
    /** Compare function for sorting with primary y compare, secondary  x compare. */
    static compareNodesYXUp(a: HalfEdge, b: HalfEdge): 0 | 1 | -1;
    /** Return true if nodeB (a) is lower than both its neighbors and (b) inflects as a downward peak (rather than an upward trough) */
    static isDownPeak(nodeB: HalfEdge): boolean;
    /** return the cross product of vectors from base to targetA and base to targetB
     * @param base base vertex of both vectors.
     * @param targetA target vertex of first vector
     * @param targetB target vertex of second vector
     */
    static crossProductToTargets(base: HalfEdge, targetA: HalfEdge, targetB: HalfEdge): number;
    static graphRange(graph: HalfEdgeGraph): Range3d;
    /** Returns an array of all nodes (both ends) of edges created from segments. */
    static segmentArrayToGraphEdges(segments: LineSegment3d[], returnGraph: HalfEdgeGraph, mask: HalfEdgeMask): HalfEdge[];
    /**
     * * Visit all nodes in `graph`.
     * * invoke `pinch(node, vertexPredecessor)`
     * * this leaves the graph as isolated edges.
     * @param graph graph to modify
     */
    static isolateAllEdges(graph: HalfEdgeGraph): void;
    /**
     * Compute convexity of a sector of a super-face.
     * @param base node whose edge is to be tested for removal
     * @param ignore edges with this mask (on either side) are ignored for the purposes of computing convexity
     * @param barrier edges with this mask (on either side) will not be removed
     * @param signedAreaTol optional signed area tolerance to use in test for parallel vectors
     * @return whether removing the edge at base would create a convex sector in the super-face
     */
    private static isSectorConvexAfterEdgeRemoval;
    /**
     * Mask edges between faces if the union of the faces is convex.
     * Uses a greedy algorithm with no regard to quality of resulting convex faces.
     * Best results when input faces are convex.
     * @param graph graph to examine and mark
     * @param mark the mask used to mark (both sides of) removable edges
     * @param barrier edges with this mask (on either side) will not be marked. Defaults to HalfEdgeMask.BOUNDARY_EDGE.
     * @return number of edges masked (half the number of HalfEdges masked)
     */
    static markRemovableEdgesToExpandConvexFaces(graph: HalfEdgeGraph, mark: HalfEdgeMask, barrier?: HalfEdgeMask): number;
    /**
     * Collect edges between faces if the union of the faces is convex.
     * Uses a greedy algorithm with no regard to quality of resulting convex faces.
     * Best results when input faces are convex.
     * @param graph graph to examine
     * @param barrier edges with this mask (on either side) will not be collected. Defaults to HalfEdgeMask.BOUNDARY_EDGE.
     * @return one HalfEdge per removable edge
     */
    static collectRemovableEdgesToExpandConvexFaces(graph: HalfEdgeGraph, barrier?: HalfEdgeMask): HalfEdge[] | undefined;
    /**
     * Remove edges between faces if the union of the faces is convex.
     * Uses a greedy algorithm with no regard to quality of resulting convex faces.
     * Best results when input faces are convex.
     * @param graph graph to modify
     * @param barrier edges with this mask (on either side) will not be removed. Defaults to HalfEdgeMask.BOUNDARY_EDGE.
     * @return number of edges deleted
     */
    static expandConvexFaces(graph: HalfEdgeGraph, barrier?: HalfEdgeMask): number;
    /**
     * Test desired faces for convexity.
     * @param graph graph to examine
     * @param avoid faces with this mask will not be examined. Defaults to HalfEdgeMask.EXTERIOR.
     * @return whether every face in the graph is convex
     */
    static isEveryFaceConvex(graph: HalfEdgeGraph, avoid?: HalfEdgeMask): boolean;
}
/**
 * Note: this class uses hardcoded micrometer coordinate/cluster tolerance throughout.
 * @internal
 */
export declare class HalfEdgeGraphMerge {
    static getCommonThetaEndIndex(clusters: ClusterableArray, order: Uint32Array, kA: number, kB: number): number;
    private static _announceVertexNeighborhoodFunction?;
    /**
     * public property setter for a function to be called with sorted edge data around a vertex.
     */
    static set announceVertexNeighborhoodFunction(func: AnnounceVertexNeighborhoodSortData | undefined);
    private static doAnnounceVertexNeighborhood;
    private static secondarySortAroundVertex;
    /** Return the sort key for sorting by curvature.
     * * This is the signed distance from the curve at the edge start, to center of curvature.
     * * NOTE: Currently does not account for higher derivatives in the case of higher-than-tangent match.
     */
    static curvatureSortKey(node: HalfEdge): number;
    /** Whether the HalfEdge is part of a null face, as marked by [[clusterAndMergeXYTheta]]. */
    static isNullFace(node: HalfEdge): boolean;
    /** Simplest merge algorithm:
     * * collect array of (x,y,theta) at all nodes
     * * lexical sort of the array.
     * * twist all vertices together.
     * * This effectively creates valid face loops for a planar subdivision if there are no edge crossings.
     * * If there are edge crossings, the graph can be a (highly complicated) Klein bottle topology.
     * * Mask.NULL_FACE is cleared throughout and applied within null faces.
     */
    static clusterAndMergeXYTheta(graph: HalfEdgeGraph, outboundRadiansFunction?: (he: HalfEdge) => number): void;
    private static buildVerticalSweepPriorityQueue;
    private static snapFractionToNode;
    private static computeIntersectionFractionsOnEdges;
    /**
     * Split edges at intersections.
     * * This is a large operation.
     * @param graph
     */
    static splitIntersectingEdges(graph: HalfEdgeGraph): GraphSplitData;
    /**
     * Returns a graph structure formed from the given LineSegment array
     *
     * *  Find all intersections among segments, and split them if necessary
     * *  Record endpoints of every segment in the form X, Y, Theta; This information is stored as a new node and sorted to match up
     *      vertices.
     * *  For vertices that match up, pinch the nodes to create vertex loops, which in closed objects, will also eventually form face
     *      loops
     */
    static formGraphFromSegments(lineSegments: LineSegment3d[]): HalfEdgeGraph;
    /**
     * * Input is random linestrings, not necessarily loops
     * * Graph gets full splitEdges, regularize, and triangulate.
     * @returns triangulated graph, or undefined if bad data.
     */
    static formGraphFromChains(chains: MultiLineStringDataVariant, regularize?: boolean, mask?: HalfEdgeMask): HalfEdgeGraph | undefined;
}
