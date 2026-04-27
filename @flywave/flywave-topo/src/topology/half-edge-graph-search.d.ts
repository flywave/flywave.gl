import { type HalfEdge, type HalfEdgeToBooleanFunction, type NodeToNumberFunction, HalfEdgeGraph, HalfEdgeMask } from "./graph";
import { SignedDataSummary } from "./signed-data-summary";
/**
 * Interface for an object that executes boolean tests on edges.
 */
export interface HalfEdgeTestObject {
    testEdge(h: HalfEdge): boolean;
}
/**
 */
export declare class HalfEdgeMaskTester {
    private readonly _targetMask;
    private readonly _targetValue;
    /**
     *
     * @param mask mask to test in `testEdge` function
     * @param targetValue value to match for true return
     */
    constructor(mask: HalfEdgeMask, targetValue?: boolean);
    /** Return true if the value of the targetMask matches the targetValue */
    testEdge(edge: HalfEdge): boolean;
}
export declare class HalfEdgeGraphSearch {
    /**
     * * for each node of face, set the mask push to allNodesStack
     * * push the faceSeed on onePerFaceStack[]
     */
    private static pushAndMaskAllNodesInFace;
    /**
     * Search an array of faceSeed nodes for the face with the most negative area.
     * @param oneCandidateNodePerFace array containing one node from each face to be considered.
     * @returns node on the minimum area face, or undefined if no such face (e.g., all faces have zero area).
     */
    static findMinimumAreaFace(oneCandidateNodePerFace: HalfEdgeGraph | HalfEdge[], faceAreaFunction?: NodeToNumberFunction): HalfEdge | undefined;
    /**
     * static method for face area computation -- useful as function parameter in collect FaceAreaSummary.
     * * This simply calls `node.signedFaceArea ()`
     * @param node instance for signedFaceArea call.
     */
    static signedFaceArea(node: HalfEdge): number;
    /**
     *
     * Return a summary structure data about face (or other numeric quantity if the caller's areaFunction returns other value)
     * * The default areaFunction computes area of polygonal face.
     * * Callers with curved edge graphs must supply their own area function.
     * @param source graph or array of nodes to examine
     * @param collectAllNodes flag to pass to the SignedDataSummary constructor to control collection of nodes.
     * @param areaFunction function to all to obtain area (or other numeric value)
     */
    static collectFaceAreaSummary(source: HalfEdgeGraph | HalfEdge[], collectAllNodes?: boolean, areaFunction?: NodeToNumberFunction): SignedDataSummary<HalfEdge>;
    /**
     * * Test if the graph is triangulated.
     * * Return false if:
     *   * Positive area face with more than 3 edges
     *   * more than 1 negative area face with `allowMultipleNegativeAreaFaces` false
     * * 2-edge faces are ignored.
     */
    static isTriangulatedCCW(source: HalfEdgeGraph | HalfEdge[], allowMultipleNegativeAreaFaces?: boolean, numPositiveExceptionsAllowed?: number): boolean;
    /**
     * Search to all accessible faces from given seed.
     * * The returned array contains one representative node in each face of the connected component.
     * * If (nonnull) parity mask is given, on return:
     *    * It is entirely set or entirely clear around each face
     *    * It is entirely set on all faces that are an even number of face-to-face steps away from the seed.
     *    * It is entirely clear on all faces that are an odd number of face-to-face steps away from the seed.
     * @param seedEdge first edge to search.
     * @param visitMask mask applied to all faces as visited.
     * @param parityMask mask to apply (a) to first face, (b) to faces with alternating parity during the search.
     */
    private static parityFloodFromSeed;
    /**
     * * Search the given faces for the one with the minimum area.
     * * If the mask in that face is OFF, toggle it on (all half edges of) all the faces.
     * * In a properly merged planar subdivision there should be only one true negative area face per component.
     * @param graph parent graph
     * @param parityMask mask which was previously set with alternating parity, but with an arbitrary start face.
     * @param faces array of faces to search.
     */
    private static correctParityInSingleComponent;
    /** Apply correctParityInSingleComponent to each array in components. (Quick exit if mask in NULL_MASK) */
    private static correctParityInComponentArrays;
    /**
     * Collect arrays gathering faces by connected component.
     * @param graph graph to inspect
     * @param parityEdgeTester (optional) function to test if an edge is a parity change (e.g., a boundary edge).
     * @param parityMask (optional, along with parityEdgeTester) mask to apply indicating parity.  If this is Mask.NULL_MASK, there is no record of parity.
     */
    static collectConnectedComponentsWithExteriorParityMasks(graph: HalfEdgeGraph, parityEdgeTester: HalfEdgeTestObject | undefined, parityMask?: HalfEdgeMask): HalfEdge[][];
    /**
     * Test if (x,y) is inside (1), on an edge (0) or outside (-1) a face.
     * @param seedNode any node on the face loop
     * @param x x coordinate of test point.
     * @param y y coordinate of test point.
     */
    static pointInOrOnFaceXY(seedNode: HalfEdge, x: number, y: number): number | undefined;
    /**
     * Announce nodes that are "extended face boundary" by conditions (usually mask of node and mate) in test functions.
     * * After each node, the next candidate in reached by looking "around the head vertex loop" for the next boundary.
     *   * "Around the vertex" from nodeA means
     *      * First look at nodeA.faceSuccessor;
     *      * Then look at vertexPredecessor around that vertex loop.
     * * Each accepted node is passed to announceNode, and marked with the visit mask.
     * * The counter of the announceEdge function is zero for the first edge, then increases with each edge.
     * @param seed start node.
     * @param isBoundaryEdge
     * @param announceEdge
     */
    static collectExtendedBoundaryLoopFromSeed(seed: HalfEdge, visitMask: HalfEdgeMask, isBoundaryEdge: HalfEdgeToBooleanFunction, announceEdge: (edge: HalfEdge, counter: number) => void): void;
    /**
     * Collect arrays of nodes "around the boundary" of a graph with extraneous (non-boundary) edges.
     * * The "boundary" is nodes that do NOT have the exterior mask, but whose mates DO have the exterior mask.
     * * After each node, the next candidate in reached by looking "around the head vertex loop" for the next boundary.
     *   * "Around the vertex" from nodeA means
     *      * First look at nodeA.faceSuccessor;
     *      * Then look at vertexPredecessor around that vertex loop.
     * * Each accepted node is passed to announceNode, and marked with the visit mask.
     * @param seed start node.
     * @param isBoundaryNode
     * @param announceNode
     */
    static collectExtendedBoundaryLoopsInGraph(graph: HalfEdgeGraph, exteriorMask: HalfEdgeMask): HalfEdge[][];
}
