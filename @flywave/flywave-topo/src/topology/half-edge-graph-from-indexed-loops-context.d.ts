import { HalfEdge, HalfEdgeGraph } from "./graph";
/**
 * Context for building a half edge graph from loops defined only by indices.
 * * Direct use case:
 *   * Create the context.
 *   * Repeatedly call insertLoop(indicesAroundLoop) to announce various loops.
 *   * Finish by accessing the graph property.
 * @internal
 */
export declare class HalfEdgeGraphFromIndexedLoopsContext {
    constructor();
    private readonly _unmatchedEdges;
    private readonly _graph;
    get graph(): HalfEdgeGraph;
    private readonly _halfEdgesAroundCurrentLoop;
    private indexPairToString;
    /** Create a loop with specified indices at its vertices.
     * * For an edge with index pair [indexA, indexB]:
     *   * if [indexB, indexA] has never appeared, a HalfEdge mated pair is created.
     *      * One of that mated pair becomes a HalfEdge in this loop.
     *      * The other is "unmatched"
     *      * When announceMatedHalfEdges(halfEdge) is called:
     *         * halfEdge and its mate are "new"
     *         * all coordinates are zeros.
     *         * each contains (as its halfEdge.id property) one index of the [indexA,indexB] pair.
     *         * those coordinates and indices will never be referenced again by this construction sequence -- the caller is free to mutate them as needed.
     *   * if [indexB, indexA] appeared previously (and its outer HalfEdge was left "unmatched"),
     *              the "unmatched" HalfEdge is used in the loop being constructed.
     * @param indices Array of indices around the edge.  This is accessed cyclically.
     * @param announceMatedHalfEdges optional function to be called as mated pairs are created. At the call,
     *     the given HalfEdge and its mate will have a pair of successive indices from the array.
     */
    insertLoop(indices: number[], announceMatedHalfEdges?: (halfEdge: HalfEdge) => void): HalfEdge | undefined;
}
