import { type HalfEdge, type HalfEdgeGraph, HalfEdgeMask } from "./graph";
/**
 * A class to manage a set of edges as both (a) an array of possible members and (b) mask bits.
 * * A half edge is "in the MarkSet" if its mask is set.
 * * The MarkSet array is a superset of the half edges in the set.
 * * Entry of a HalfEdge into the set is indicated by both
 *    * adding the HalfEdge to the array
 *    * setting the mask on the half edge, edge, face, or vertex
 * * Half edges can "go out of the MarkSet" if the mask is cleared.
 *   * This clearing can happen independently of the array management.
 *   * Hence the array can contain half edges that are no longer in the MarkSet
 *   * the "remove" methods monitor this.
 * * Derived classes expand this concept for edge, vertex, or face MarkSets.
 *   * a single representative of an edge, vertex, or face is entered to the array
 *   * all edges around the edge, vertex, or face are marked with the mask
 *   * Hence the array contains one or more representatives of the edge, face, or vertex
 * * This allows quick query for both:
 *   * Testing the mask gives constant time test of whether a HalfEdge is in the set
 *   * access through the array gives direct access to the HalfEdge pointers
 * @internal
 */
export declare abstract class AbstractHalfEdgeGraphMarkSet {
    private readonly _graph;
    private readonly _candidates;
    protected _mask: HalfEdgeMask;
    protected constructor(graph: HalfEdgeGraph, mask: HalfEdgeMask);
    /** remove all nodes from the set.
     * * This pops from the array, clearing masks as the pop.
     * * Note that it does NOT walk the entire graph to clear masks.
     */
    clear(): void;
    /**
     * count the number of active members.
     * * This is the number of HalfEdges which are (a) in the array and (b) masked.
     */
    getLength(): number;
    /**
     * Return the number of candidates.
     * * This may be more than `getLength ()`
     * * This will typically only be called by the iterator.
     */
    getNumCandidates(): number;
    /** Read property accessor: return the graph */
    get graph(): HalfEdgeGraph;
    /** return borrowed assets (the mask!) to the graph. */
    teardown(): void;
    /** (Read property) return the mask used to mark members of the set. */
    get mask(): HalfEdgeMask;
    /** pop and return the last node out of the array, without testing if it is still marked. */
    protected popAndReturn(): HalfEdge | undefined;
    /**
     * * read at an index in the candidates array.
     * * if that candidate has the mask, return it.
     * * otherwise return undefined.
     * * REMARK: This is only to be called by the iterator.
     */
    getAtIndex(index: number): HalfEdge | undefined;
    /** Add a node to the set.  This means
     * * Set the mask
     * * push the node on the array
     * * (BUT!) If the node already has the mask, do nothing.
     * * This base class method affects only the single given HalfEdge.
     * * Derived classes for edge, face, and vertex will override this method and also set the mask around the larger structures.
     * @returns true if the HalfEdge is a new member of the set, false if it was already in the set.
     */
    addToSet(candidate: HalfEdge): boolean;
    /** Test if `candidate` is already in the set.
     * * This examines only the mask.
     */
    isCandidateInSet(candidate: HalfEdge): boolean;
    /**
     * * If the candidate is not marked as a member of the MarkSet, do nothing.
     * * If the candidate is marked:
     *   * clear the mask
     *   * but do NOT search the array.
     *   * As the array is searched, the candidate will appear and be ignored because the mask is not set.
     * @param candidate
     * @return true if the candidate was a member (an hence removed), false if the candidate was not masked.
     */
    removeFromSet(candidate: HalfEdge): boolean;
    /**
     *  * Search the array to find any current set member
     *  * If found, clear its mask and return it.
     *  * If unmasked HalfEdges are found in the array, they are removed from the array.
     */
    chooseAndRemoveAny(): HalfEdge | undefined;
    /** Set mask on candidate -- i.e. edge, face, vertex, or single half edge as required.
     * * Base class only changes the candidate mask.
     * * Derived classes change more masks around edge, face, or vertex.
     */
    protected abstract setMaskInScope(candidate: HalfEdge | undefined): void;
    /** Clear mask on candidate -- i.e. edge, face, vertex, or single half edge as required.
     * * Base class only changes the candidate mask.
     * * Derived classes change more masks around edge, face, or vertex.
     */
    protected abstract clearMaskInScope(candidate: HalfEdge | undefined): void;
    /**
     * Return the number of half edges that would be set/cleared when dealing with this candidate.
     * * This is always 1 for HalfEdgeMarkSet
     * @param candidate
     */
    abstract countHalfEdgesAroundCandidate(candidate: HalfEdge | undefined): number;
    /** Create an iterator over member HalfEdges */
    [Symbol.iterator](): IterableIterator<HalfEdge>;
    /**
     * * visit all half edges around face.
     * * Add each to mark set.
     */
    addAroundFace(seed: HalfEdge): void;
    /**
     * * visit all half edges around vertex.
     * * Add each to mark set.
     */
    addAroundVertex(seed: HalfEdge): void;
}
/**
 * AbstractHalfEdgeGraphMarkSet specialized to manage the masks on individual half edges
 * @internal
 */
export declare class MarkedHalfEdgeSet extends AbstractHalfEdgeGraphMarkSet {
    constructor(graph: HalfEdgeGraph, mask: HalfEdgeMask);
    /** Create a new 'HalfEdgeMarkSet', operating on half edges with only themselves as scope.
     * * Returns undefined if unable to get a mask for the graph.
     * * Undefined return can only happen if the caller is failing to return grabbed masks.
     */
    static create(graph: HalfEdgeGraph): MarkedHalfEdgeSet | undefined;
    /**
     * * Set mask on candidate's edge.
     * * This overrides the base class implementation.
     */
    protected setMaskInScope(candidate: HalfEdge): void;
    /**
     * * Clear mask on candidate's edge.
     * * This overrides the base class implementation.
     */
    protected clearMaskInScope(candidate: HalfEdge): void;
    /**
     * Return the number of half edges that would be set/cleared when dealing with this candidate.
     * * This is always 1 for EdgeMarkSet
     * * return 0 for undefined candidate
     * @param candidate
     */
    countHalfEdgesAroundCandidate(candidate: HalfEdge | undefined): number;
}
/**
 * AbstractHalfEdgeGraphMarkSet specialized to manage the mask on both sides of edges.
 * @internal
 */
export declare class MarkedEdgeSet extends AbstractHalfEdgeGraphMarkSet {
    constructor(graph: HalfEdgeGraph, mask: HalfEdgeMask);
    /** Create a new 'HalfEdgeMarkSet', operating on half edges with only themselves as scope.
     * * Returns undefined if unable to get a mask for the graph.
     * * Undefined return can only happen if the caller is failing to return grabbed masks.
     */
    static create(graph: HalfEdgeGraph): MarkedEdgeSet | undefined;
    /**
     * * Set mask on candidate's edge.
     * * This overrides the base class implementation.
     */
    protected setMaskInScope(candidate: HalfEdge): void;
    /**
     * * Clear mask on candidate's edge.
     * * This overrides the base class implementation.
     */
    protected clearMaskInScope(candidate: HalfEdge): void;
    /**
     * Return the number of half edges that would be set/cleared when dealing with this candidate.
     * * This is always 2 for EdgeMarkSet
     * @param candidate
     */
    countHalfEdgesAroundCandidate(candidate: HalfEdge | undefined): number;
}
/**
 * AbstractHalfEdgeGraphMarkSet specialized to manage the mask around faces
 * @internal
 */
export declare class MarkedFaceSet extends AbstractHalfEdgeGraphMarkSet {
    constructor(graph: HalfEdgeGraph, mask: HalfEdgeMask);
    /** Create a new 'HalfEdgeMarkSet', operating on half edges with only themselves as scope.
     * * Returns undefined if unable to get a mask for the graph.
     * * Undefined return can only happen if the caller is failing to return grabbed masks.
     */
    static create(graph: HalfEdgeGraph): MarkedFaceSet | undefined;
    /**
     * * Set mask on (all nodes around) candidate's face
     * * This overrides the base class implementation.
     */
    protected setMaskInScope(candidate: HalfEdge): void;
    /**
     * * Clear mask on (all nodes around) candidate's face.
     * * This overrides the base class implementation.
     */
    protected clearMaskInScope(candidate: HalfEdge): void;
    /**
     * Return the number of half edges that would be set/cleared when dealing with this candidate.
     * * This is the "aroundFace" count.
     * @param candidate
     */
    countHalfEdgesAroundCandidate(candidate: HalfEdge | undefined): number;
}
/**
 * AbstractHalfEdgeGraphMarkSet specialized to manage the mask around faces
 * @internal
 */
export declare class MarkedVertexSet extends AbstractHalfEdgeGraphMarkSet {
    constructor(graph: HalfEdgeGraph, mask: HalfEdgeMask);
    /** Create a new 'HalfEdgeMarkSet', operating on half edges with only themselves as scope.
     * * Returns undefined if unable to get a mask for the graph.
     * * Undefined return can only happen if the caller is failing to return grabbed masks.
     */
    static create(graph: HalfEdgeGraph): MarkedVertexSet | undefined;
    /**
     * * Set mask on (all nodes around) candidate's face
     * * This overrides the base class implementation.
     */
    protected setMaskInScope(candidate: HalfEdge): void;
    /**
     * * Clear mask on (all nodes around) candidate's face.
     * * This overrides the base class implementation.
     */
    protected clearMaskInScope(candidate: HalfEdge): void;
    /**
     * Return the number of half edges that would be set/cleared when dealing with this candidate.
     * * This is the "aroundVertex" count.
     * @param candidate
     */
    countHalfEdgesAroundCandidate(candidate: HalfEdge | undefined): number;
}
