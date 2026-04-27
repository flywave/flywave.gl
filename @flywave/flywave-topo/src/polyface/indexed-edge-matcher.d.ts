/**
 * * For boundary sorting, an edge is a (packed!) Float64Array.
 * * Fixed entry positions are:
 *   * [0] is start vertex index (in CCW order around its facet)
 *   * [1] is end vertex index (in CCW order around its facet)
 *   * [2] is facet index.
 */
export declare class SortableEdge extends Float64Array {
    /** Return the vertex index that appears first in the order stored.  */
    get vertexIndexA(): number;
    /** Return the vertex index that appears second in the order stored.  */
    get vertexIndexB(): number;
    /** Return the facet index.  */
    get facetIndex(): number;
    /** return true if vertexIndexA is less than vertexIndexB */
    get isLowHigh(): boolean;
    /** Return the vertex index with lower numeric value */
    get lowVertexIndex(): number;
    /** Return the vertex index with higher numeric value */
    get highVertexIndex(): number;
    /** Return true if the vertices edgeA and edgeB are the same vertex indices in opposite order */
    static areDirectedPartners(edgeA: SortableEdge, edgeB: SortableEdge): boolean;
    /** Return true if the vertices edgeA and edgeB are the same vertex indices with no consideration of order */
    static areUndirectedPartners(edgeA: SortableEdge, edgeB: SortableEdge): boolean;
    /** Return numeric relationship of edgeA and edgeB:
     * * 1 if they share start and end in the same order
     * * -1 if they share start and end in reversed order
     * * 0 otherwise.
     */
    static relativeOrientation(edgeA: SortableEdge, edgeB: SortableEdge): number;
    get isNullEdge(): boolean;
    /**
     * lexical comparison of two edges.
     * * If the edges have the same vertex pair (in same or opposite order) they will end up adjacent in a sort
     * * If the edges have 0 or 1 shared vertex indices, the one with lowest low comes first.
     * @param edgeA first edge
     * @param edgeB second edge
     */
    static lessThan(edgeA: SortableEdge, edgeB: SortableEdge): number;
    constructor(vertexA: number, vertexB: number, facetIndex: number);
    toJSON(): any;
    static clusterToJSON(data: SortableEdgeCluster): any;
    static clusterArrayToJSON(data: SortableEdgeCluster[]): any[];
}
export type SortableEdgeCluster = SortableEdge | SortableEdge[];
/**
 * An IndexedEdgeMatcher carries an array (`edges`) of edges start & end indices for sorting and subsequent analyses (such as testing for closed mesh)
 */
export declare class IndexedEdgeMatcher {
    edges: SortableEdge[];
    constructor();
    /**
     * push a new edge.
     * @returns the edge (as emplaced at the back of the sortableEdge array)
     * @param vertexA start vertex
     * @param vertexB end vertex
     * @param facetIndex facet index
     */
    addEdge(vertexA: number, vertexB: number, facetIndex: number): SortableEdge;
    /**
     * Push edges all around a facet, returning to vertexArray[0]
     * @param vertexArray array of vertex indices around facet
     * @param facetIndex
     */
    addPath(vertexArray: number[], facetIndex: number, closeLoop?: boolean): void;
    /** Sort the edge index array. */
    sort(): void;
    /** Create a single or compound SortableEdgeCluster in dest. */
    private collectSortableEdgeCluster;
    /**
     * sort the edges, and look for three categories of paired edges:
     * * caller must allocate all result arrays of interest.
     * * Any combination of the result arrays may be `undefined`, indicating that category is to be ignored.
     * * Any combination of the result arrays may be aliased as the same target, in which case those to categories are merged into the target.
     * * For instance, to ignore manifold pairs and collect all others (singleton, null, and other) as a single array `allOther`, create `const allOther = []` as an empty array and call
     * `sortAndCollectClusters (undefined, allOther, allOther, allOther);`
     * @param manifoldPairs optional array to receive pairs of properly mated SortableEdgePairs, i.e. simple interior edges adjacent to two facets in opposing directions.
     * @param singletons optional array to receive edges that are simple boundary edges.
     * @param nullEdges optional array to receive arrays of null edges (same start and end vertex)
     * @param allOtherClusters optional array to receive arrays in which all the edges are partners in an undirected sense but not a simple directed pair.
     */
    sortAndCollectClusters(manifoldPairs: SortableEdgeCluster[] | undefined, singletons?: SortableEdgeCluster[], nullEdges?: SortableEdgeCluster[], allOtherClusters?: SortableEdgeCluster[]): void;
}
