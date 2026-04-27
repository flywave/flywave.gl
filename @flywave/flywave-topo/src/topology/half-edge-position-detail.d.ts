import { Point3d } from "../geometry3d/point3d-vector3d";
import { type XYAndZ } from "../geometry3d/xyz-props";
import { type HalfEdge } from "./graph";
/**
 * Enumeration of categorization of "where" a HalfEdgePositionDetail is sitting in the graph.
 */
export declare enum HalfEdgeTopo {
    /** No known position */
    None = 0,
    /**  Sitting at a vertex, reached by a ray in this sector */
    Vertex = 1,
    /** Sitting on an edge */
    Edge = 2,
    /** Face point (before hitting barrier edge) */
    Face = 3,
    /** Exterior point (after hitting barrier edge at fraction)
     * Fraction is 0 if exterior point "in sweep around exterior corner"
     */
    ExteriorFace = 4
}
/**
 * Description of a generalized position within a graph, categorized as:
 * * "at a certain node around a vertex"
 * * "at a fractional position along an edge
 * * "within a face"
 */
export declare class HalfEdgePositionDetail {
    /** the relevant node */
    private _node?;
    /** The current coordinates */
    x: number;
    y: number;
    z: number;
    /** fractional position along edge.   Only defined if the topo tag is `HalfEdgeTopo.Edge` */
    private _edgeFraction?;
    /** Enumeration of status vertex, edge, or face status. */
    private _topo;
    /** first data tag */
    private _iTag?;
    /** second data tag */
    private _dTag?;
    /** Special case for point on edge or vertex but target beyond and exterior. */
    private _isExteriorTarget?;
    /** Constructor.
     * * The point is CAPTURED.  (static `create` methods normally clone their inputs.)
     */
    private constructor();
    /** Copy (clones of) all data from other */
    setFrom(other: HalfEdgePositionDetail): void;
    /** reset to null topo state. */
    resetAsUnknown(): void;
    /**  Create with null data. */
    static create(): HalfEdgePositionDetail;
    getITag(): number | undefined;
    setITag(value: number): void;
    getDTag(): number | undefined;
    setDTag(value: number): void;
    getTopo(): HalfEdgeTopo;
    /** Create with node, fraction along edge, marked as "HalfEdgeTopo.Edge".  Compute interpolated xyz on the edge */
    static createEdgeAtFraction(node: HalfEdge, edgeFraction: number): HalfEdgePositionDetail;
    /** reassign contents so this instance becomes a face hit.
     * @param node new node value. If missing, current node is left unchanged.
     * @param xyz new coordinates. if missing, current coordinates are left unchanged.
     */
    resetAsFace(node?: HalfEdge, xyz?: XYAndZ): this;
    /** reassign contents so this instance has dTag but no node or HalfEdgeTopo
     */
    resetAsUndefinedWithTag(dTag: number): this;
    /** reassign contents so this instance becomes an edge hit
     * @param node new node value.
     * @param edgeFraction new edge fraction.   xyz is recomputed from this edge and its face successor.
     */
    resetAtEdgeAndFraction(node: HalfEdge, edgeFraction: number): this;
    /** Create at a node.
     * * Take xyz from the node.
     */
    static createVertex(node: HalfEdge): HalfEdgePositionDetail;
    /** Mark as "HalfEdgeTopo.Vertex"
     */
    resetAsVertex(node: HalfEdge): this;
    /**  Set the flag for an exterior relationship to target. */
    setIsExteriorTarget(isExterior: boolean | undefined): void;
    /** Copy x,y,z from the node to this instance local values. */
    setXYZFromNode(node: HalfEdge): void;
    /**
     * Return the (possibly undefined) edge fraction.
     */
    get edgeFraction(): number | undefined;
    /**  property access for the flag for an exterior relationship to target.
     * * undefined flag is returned as false.
     */
    get isExteriorTarget(): boolean;
    /** Return true if this detail is marked as being within a face. */
    get isFace(): boolean;
    /** Return true if this detail is marked as being within an edge. */
    get isEdge(): boolean;
    /** Return true if this detail is marked as being at a vertex. */
    get isVertex(): boolean;
    /** Return true if this detail has no vertex, edge, or face qualifier. */
    get isUnclassified(): boolean;
    /** Return the node reference from this detail */
    get node(): HalfEdge | undefined;
    /** Return the (clone of, or optional filled in result) coordinates from this detail. */
    clonePoint(result?: Point3d): Point3d;
    isAtXY(x: number, y: number): boolean;
}
