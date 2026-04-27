import { type HalfEdgeGraph, HalfEdge } from "./graph";
/**
 * * Context for regularizing single faces.
 * @internal
 */
export declare class RegularizationContext {
    static announceEdge?: (graph: HalfEdgeGraph, nodeA: HalfEdge, nodeB: HalfEdge, scale: number) => void;
    constructor(graph: HalfEdgeGraph);
    /**
     * These are public only for testing.
     */
    graph: HalfEdgeGraph;
    /** array of edges directed upward.  Turn can be left or right, but is not large enough to be a min or max */
    upEdges: HalfEdge[];
    /** array of edges directed downward, Turn can be left or right, but is not large enough to be a min or max */
    downEdges: HalfEdge[];
    /** Array of edges whose start is an upward peak (right turn, inbound up, outbound down) */
    topPeaks: HalfEdge[];
    /** Array of edges whose start is an downward peak (right turn, inbound down, outbound up) */
    bottomPeaks: HalfEdge[];
    /** Array of edges at local minima (left turn, inbound down, outbound up).  Ensuing chain is up */
    localMin: HalfEdge[];
    /** Array of edges at local maxima (left turn, inbound up, outbound down).  Ensuing chain is down */
    localMax: HalfEdge[];
    /**
     * Collect (and classify) all the edges around a single face.
     * * The various arrays are collected: upEdges, downEdges, topPeaks, bottomPeaks, upChains, downChains
     * @param faceSeed face to examine
     */
    collectVerticalEventsAroundFace(faceSeed: HalfEdge): void;
    /**
     * Collect (and classify) all the edges in an array.
     * * The various arrays are collected: upEdges, downEdges, topPeaks, bottomPeaks, upChains, downChains
     * @param candidateEdges array of edges.
     */
    collectVerticalEventFromEdgesInAndArray(candidateEdges: HalfEdge[]): void;
    private swapArrays;
    /**
     * Find the edge (among candidates) which is first struck by a "rightward" scan from node
     * * comparisonFunction determines scan sense
     *   * HalfEdge.compareNodeYXTheta is an upward scan.
     *   * HalfEdge.compareNodeYXThetaDownward is a downward scan.
     * @param node
     * @param candidates Array of nodes to search
     * @param nodeComparisonFunction function for lexical comparison.
     */
    private findTopVisibleEdge;
    /**
     *
     * @param downPeak a "bottom" node where the interior CCW loop has a local min
     * @param downEdgeStart (optional) node at the start (heading downwards!) of an edge that brackets downPeak on the left.
     * @param upEdgeStart  (optional) node at the start (heading up!) of the edge that brackets downPeak on the right.
     */
    private highestUpPeakConnection;
    private updateMaxNode;
    private negateXY;
    private downwardConnectionFromBottomPeak;
    /** Search around the vertex of nodeA for a nodeA1 such that nodeB is visible in the sector at nodeA1 */
    private findVisibleSector;
    /**
     * Create an edge from (some node around the vertex of) nodeA to (some node around the vertex of) nodeB.
     * * looking around the vertex for alternate insertion corrects cusp insertion errors.
     * @param nodeA
     * @param nodeB
     */
    private joinNodes;
    /**
     * Regularize a single face.
     * * Insert edge from any downward interior vertex to something lower
     * * Insert an edge from each upward interior vertex to something higher.
     * * The face is split into smaller faces
     * * Each final face has at most one "min" and one "max", and is easy to triangulate with a bottom to top sweep.
     * * Normal usage is to sweep in both directions, i.e. use the default (true,true) for the upSweep and downSweep parameters.
     * @param faceSeed any representative half edge on the face
     * @param upSweep true to do the upward sweep.
     * @param downSweep true to do the downward sweep.
     */
    private runRegularization;
    /**
     * Regularize a single face.
     * * Insert edge from any downward interior vertex to something lower
     * * Insert an edge from each upward interior vertex to something higher.
     * * The face is split into smaller faces
     * * Each final face has at most one "min" and one "max", and is easy to triangulate with a bottom to top sweep.
     * * Normal usage is to sweep in both directions, i.e. use the default (true,true) for the upSweep and downSweep parameters.
     * @param faceSeed any representative half edge on the face
     * @param upSweep true to do the upward sweep.
     * @param downSweep true to do the downward sweep.
     */
    regularizeFace(faceSeed: HalfEdge, upSweep?: boolean, downSweep?: boolean): void;
    regularizeGraph(upSweep?: boolean, downSweep?: boolean): void;
    /** test if a single face is monotone;  if so, return its (single) min */
    static isMonotoneFace(seed: HalfEdge): HalfEdge | undefined;
    /** Return faces filtered by area and test function.
     * * find one arbitrary representative of each face
     * * offer the candidate to the mutate function.
     * * collect results
     * @param mappedSeeds when filter returns a HalfEdge, collect it here
     * @param unmappedSeeds when filter does not return a half edge, collect the candidate.
     */
    static collectMappedFaceRepresentatives(graph: HalfEdgeGraph, positiveAreaOnly: boolean, mutate: (seed: HalfEdge) => HalfEdge | undefined, mappedEdges: HalfEdge[] | undefined, unMappedSeeds: HalfEdge[] | undefined): void;
}
