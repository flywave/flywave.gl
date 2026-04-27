import { Point3d } from "../geometry3d/point3d-vector3d";
import { type HalfEdgeGraph } from "./graph";
import { HalfEdgePositionDetail } from "./half-edge-position-detail";
/**
 * Context for repeated insertion of new points in a graph.
 * * Initial graph should have clean outer boundary. (e.g. as typically marked with HalfEdgeMask.EXTERIOR)
 * * After each insertion, the current "position" within the graph is remembered so that each subsequent insertion
 *     can reuse that position as start for walking to the new point.
 */
export declare class InsertAndRetriangulateContext {
    private readonly _graph;
    private readonly _edgeSet;
    private _searcher;
    private constructor();
    /** Create a new context referencing the graph. */
    static create(graph: HalfEdgeGraph): InsertAndRetriangulateContext;
    /** Query the (pointer to) the graph in the context. */
    get graph(): HalfEdgeGraph;
    private retriangulateFromBaseVertex;
    /** Reset the "current" position to unknown state. */
    reset(): void;
    /** Return a (reference to!) the current position in the graph */
    get currentPosition(): HalfEdgePositionDetail;
    /**
     * Linear search through the graph
     * * Returns a HalfEdgePositionDetail for the nearest edge or vertex.
     * @param xyz
     */
    searchForNearestEdgeOrVertex(xyz: Point3d): HalfEdgePositionDetail;
    searchForNearestVertex(xyz: Point3d): HalfEdgePositionDetail;
    resetSearch(xyz: Point3d, maxDim: number): void;
    insertAndRetriangulate(xyz: Point3d, newZWins: boolean): boolean;
    moveToPoint(movingPosition: HalfEdgePositionDetail, xyz: Point3d, announcer?: (position: HalfEdgePositionDetail) => boolean): boolean;
}
