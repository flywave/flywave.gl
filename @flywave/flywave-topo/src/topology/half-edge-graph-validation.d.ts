import { type HalfEdge, type HalfEdgeGraph, type HalfEdgeMask } from "./graph";
/** HalfEdgePointerInspector has methods to check HalfEdge objects for pointer errors.
 * * For a one-step test of the whole graph,
 */
export declare class HalfEdgePointerInspector {
    numUndefinedEdgeMate: number;
    numUndefinedFS: number;
    numUndefinedFP: number;
    numFSFPError: number;
    numMatePairError: number;
    numTested: number;
    numWithMatchedEdgeMate: number;
    /** Clear all counts */
    clearCounts(): void;
    /** Inspect a single half edge.   Increment counters according to the half edge's pointers. */
    inspectHalfEdge(he: HalfEdge): void;
    /** Return true if all pointer pairings are correct for a complete half edge graph:
     * * For each he:  `he.edgeMate.edgeMate === he`
     * * For each he:  `he.faceSuccessor.facePredecessor !== he`
     * * For each he:  `he.facePredecessor.faceSuccessor !== he`
     */
    get isValidClosedHalfEdgeGraph(): boolean;
    /** Return true if all counts are correct for a half edge graph that has complete pairings:
     * * For each he:  `he.edgeMate.edgeMate === he`
     * * For each he:  `he.faceSuccessor.facePredecessor !== he`
     * * For each he:  `he.facePredecessor.faceSuccessor !== he`
     */
    get isValidHalfEdgeGraphAllowRaggedBoundary(): boolean;
    /** inspect all half edges of graph.
     * All pointer counts are left in member vars for later inspection.
     */
    inspectHalfEdges(graph: HalfEdgeGraph): void;
    /** Inspect a graph's pointer properties.
     * @param expectAllMates [in] true for "complete" graph with
     * @returns true if all pointers are valid
     */
    static inspectGraph(graph: HalfEdgeGraph, expectAllMates: boolean): boolean;
}
/** static methods to inspect mask consistency properties in HalfEdgeGraph. */
export declare class HalfEdgeMaskValidation {
    /**
     * Test if a mask is used consistently around faces.
     * * At the low level, there is no actual traversal around faces.  It is only necessary to verify that the mask matches for each HalfEdge and its faceSuccessor.
     * @returns Return true if mask is "all or nothing around all faces"
     *
     */
    static isMaskConsistentAroundAllFaces(graph: HalfEdgeGraph, mask: HalfEdgeMask): boolean;
}
