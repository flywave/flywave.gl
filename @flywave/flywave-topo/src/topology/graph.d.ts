import { LineSegment3d } from "../curve/line-segment3d";
import { Point2d, Vector2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Transform } from "../geometry3d/transform";
import { type XAndY, type XYAndZ } from "../geometry3d/xyz-props";
/**
 * * Each node of the graph has a mask member.
 * * The mask member is a number which is used as set of single bit boolean values.
 * * Particular meanings of the various bits are HIGHLY application dependent.
 *   * The EXTERIOR mask bit is widely used to mark nodes that are "outside" the active areas
 *   * The PRIMARY_EDGE bit is widely used to indicate linework created directly from input data, hence protected from triangle edge flipping.
 *   * The BOUNDARY bit is widely used to indicate that crossing this edge is a transition from outside to inside.
 *   * VISITED is used locally in many searches.
 *      * Never use VISITED unless the search logic is highly self contained.
 * @internal
 */
export declare enum HalfEdgeMask {
    /**  Mask commonly set consistently around exterior faces.
     * * A boundary edge with interior to one side, exterior to the other will have EXTERIOR only on the outside.
     * * An an edge inserted "within a purely exterior face" can have EXTERIOR on both sides.
     * * An interior edge (such as added during triangulation) will have no EXTERIOR bits.
     */
    EXTERIOR = 1,
    /** Mask commonly set (on both sides) of original geometry edges that are transition from outside from to inside.
     * * At the moment of creating an edge from primary user boundary loop coordinates, the fact that an edge is BOUNDARY is often clear even though
     *  there is uncertainty about which side should be EXTERIOR.
     */
    BOUNDARY_EDGE = 2,
    /** Mask commonly set (on both sides) of original geometry edges, but NOT indicating that the edge is certainly a boundary between outside and inside.
     * * For instance, if geometry is provided as stray sticks (not loops), it can be marked PRIMARY_EDGE but neither BOUNDARY_EDGE nor EXTERIOR_EDGE
     */
    PRIMARY_EDGE = 4,
    /** Mask used for low level searches to identify previously-visited nodes */
    VISITED = 16,
    /** Mask applied to triangles by earcut triangulator */
    TRIANGULATED_FACE = 256,
    /** mask applied in a face with 2 edges. */
    NULL_FACE = 512,
    /** no mask bits */
    NULL_MASK = 0,
    /** The "upper 12 " bits of 32 bit integer. */
    ALL_GRAB_DROP_MASKS = 4293918720,// 12 masks reserved for grab/drop.
    /** all mask bits */
    ALL_MASK = 4294967295
}
/** function signature for function of one node with no return type restrictions
 * @internal
 */
export type NodeFunction = (node: HalfEdge) => any;
/** function signature for function of one node, returning a number
 * @internal
 */
export type NodeToNumberFunction = (node: HalfEdge) => number;
/** function signature for function of one node, returning a boolean
 * @internal
 */
export type HalfEdgeToBooleanFunction = (node: HalfEdge) => boolean;
/** function signature for function of a node and a mask, returning a number
 * @internal
 */
export type HalfEdgeAndMaskToBooleanFunction = (node: HalfEdge, mask: HalfEdgeMask) => boolean;
/** function signature for function of a graph and a node, returning a boolean
 * @internal
 */
export type GraphNodeFunction = (graph: HalfEdgeGraph, node: HalfEdge) => boolean;
/** Non-topological data members in a half edge.
 * These are not part of adjacency and masking logic.
 */
/** member fields for a half edge (which is also commonly called a node)
 * @internal
 */
export interface HalfEdgeUserData {
    /** Vertex x coordinate */
    x: number;
    /** Vertex y coordinate */
    y: number;
    /** Vertex z coordinate */
    z: number;
    /** angle used for sort-around-vertex */
    sortAngle?: number;
    /** numeric value for application-specific tagging (e.g. sorting) */
    sortData?: number;
    /** application-specific data for the edge identifier.
     * * edge split operations are expected to copy this to new sub-edges.
     */
    edgeTag?: any;
    /** application-specific data for the face loop
     * * edge split operations are expected to copy this to new sub-edges.
     */
    faceTag?: any;
}
/**
 *
 * * A HalfEdge is "one side of an edge" in a structure of faces, edges and vertices.  From a node there are navigational links to:
 * ** "faceSuccessor" -- the next half edge in a loop around a face.
 * ** "facePredecessor" -- the previous half edge in a loop around a face.
 * ** "edgeMate"  -- the node's partner on the other side of the edge.
 * * The next, prev, and mate are the essential connectivity.  Additional node content is for application-specific
 *     uses.  The most useful ones are:
 * ** x,y -- coordinates in the xy plane
 * ** z -- z coordinate.  This is normally ignored during planar setup, but used for output.
 * ** buffer -- a integer value manipulated as individual bits.
 * * In properly connected planar graph, interior face loops are counterclockwise.  But that property (along with
 *      expected masking) is a result of extensive validation of inputs, and is not true in intermediate phases
 *      of graph manipulation.
 * @internal
 */
export declare class HalfEdge implements HalfEdgeUserData {
    /** Vertex index in some parent object's numbering. */
    i: number;
    /** bitmask bits, used to mark nodes as part of a triangle(idx 0) or visited when flipping(idx 1) */
    maskBits: number;
    /** Vertex x coordinate */
    x: number;
    /** Vertex y coordinate */
    y: number;
    /** Vertex z coordinate */
    z: number;
    /** angle used for sort-around-vertex */
    sortAngle?: number;
    /** numeric value for application-specific tagging (e.g. sorting) */
    sortData?: number;
    /** application-specific data for the edge identifier.
     * * edge split operations are expected to copy this to new sub-edges.
     */
    edgeTag?: any;
    /** application-specific data for the face loop
     * * edge split operations are expected to copy this to new sub-edges.
     */
    faceTag?: any;
    private _id;
    /** id assigned sequentially during construction --- useful for debugging. */
    get id(): any;
    private _facePredecessor;
    private _faceSuccessor;
    private _edgeMate;
    /** previous half edge "around the face"
     */
    get facePredecessor(): HalfEdge;
    /** next half edge "around the face" */
    get faceSuccessor(): HalfEdge;
    /** Half edge on the other side of this edge.
     */
    get edgeMate(): HalfEdge;
    /** Take numStep face steps and return y coordinate
     * * positive steps are through faceSuccessor
     * * negative steps are through facePredecessor
     */
    faceStepY(numStep: number): number;
    /**
     * * Create 2 half edges.
     * * The two edges are joined as edgeMate pair.
     * * The two edges are a 2-half-edge face loop in both the faceSuccessor and facePredecessor directions.
     * @returns Returns the reference to the first half edge created
     */
    static createHalfEdgePair(heArray: HalfEdge[] | undefined): HalfEdge;
    /**
     * * Create 2 half edges.
     * * The two edges are joined as edgeMate pair.
     * * The two edges are a 2-half-edge face loop in both the faceSuccessor and facePredecessor directions.
     * * Properties x,y,z,i are inserted in each
     * @returns Returns the reference to the first half edge created
     */
    static createHalfEdgePairWithCoordinates(xA: number, yA: number, zA: number, iA: number, xB: number, yB: number, zB: number, iB: number, heArray: HalfEdge[] | undefined): HalfEdge;
    /**
     * * set heA <==> heB pointer relation through heA._faceSuccessor and heB._facePredecessor
     * * This changes heA._faceSuccessor and heB._facePredecessor, but not heA._facePredecessor and heB._faceSuccessor.
     * * this must always be done with another call to reestablish the entire double-linked list.
     */
    private static setFaceLinks;
    /**
     * * set heA <==> heB pointer relation edgeMate
     */
    private static setEdgeMates;
    /**
     * * Create a new vertex within the edge from base.
     * * Insert it "within" the base edge.
     * * This requires two new half edges.
     * * if the base is undefined, create a single-edge loop.
     * * This (unlike pinch) breaks the edgeMate pairing of the base edge.
     * * This preserves xyz and i properties at all existing vertices.
     * * on each side, if edgeTag is present it is copied to the new edge.
     * @returns Returns the reference to the half edge created.
     */
    static splitEdge(baseA: undefined | HalfEdge, xA: number, yA: number, zA: number, iA: number, heArray: HalfEdge[] | undefined): HalfEdge;
    /**
     * * Create a new sliver face "inside" an existing edge.
     * * Insert it "within" the base edge.
     * * This requires two new half edges.
     * * if the base is undefined, create a single-edge loop.
     * * This (unlike pinch) breaks the edgeMate pairing of the base edge.
     * * This preserves xyz and i properties at all existing vertices.
     * * The two new half edges are a sliver face (via their predecessor and successor)
     * * Each new edge mates to one existing edge.
     * @returns Returns the reference to the half edge created.
     */
    static splitEdgeCreateSliverFace(baseA: HalfEdge, heArray: HalfEdge[] | undefined): HalfEdge;
    private static readonly _edgePropertyMasks;
    /**
     * Copy "edge based" content of fromNode to toNode
     * * edgeTag
     * * masks in _edgePropertyMasks: EXTERIOR, BOUNDARY_EDGE, NULL_FACE, PRIMARY_EDGE
     * @param fromNode
     * @param toNode
     */
    static transferEdgeProperties(fromNode: HalfEdge, toNode: HalfEdge): void;
    private static _totalNodesCreated;
    constructor(x?: number, y?: number, z?: number, i?: number);
    /**
     * Return the next outbound half edge around this vertex in the CCW direction
     */
    get vertexSuccessor(): HalfEdge;
    /**
     * Return the next outbound half edge around this vertex in the CW direction
     */
    get vertexPredecessor(): HalfEdge;
    /**
     * Set mask bits on this HalfEdge
     * @param mask mask to apply
     */
    setMask(mask: HalfEdgeMask): void;
    /**
     * Get mask bits from this HalfEdge
     * @param mask mask to query
     */
    getMask(mask: HalfEdgeMask): number;
    /**
     * Clear mask bits from this HalfEdge
     * @param mask mask to clear
     */
    clearMask(mask: HalfEdgeMask): void;
    /**
     * Set a mask at all nodes around a vertex.
     * @param mask mask to apply to the half edges around this HalfEdge's vertex loop
     */
    setMaskAroundVertex(mask: HalfEdgeMask): void;
    /**
     * Set x,y,z at all nodes around a vertex.
     * @param mask mask to apply to the half edges around this HalfEdge's vertex loop
     */
    setXYZAroundVertex(x: number, y: number, z: number): void;
    /**
     * Apply a mask to all edges around a face.
     * @param mask mask to apply to the half edges around this HalfEdge's face loop
     */
    setMaskAroundFace(mask: HalfEdgeMask): void;
    /**
     * Apply a mask to both sides of an edge.
     * @param mask mask to apply to this edge and its `edgeMate`
     */
    setMaskAroundEdge(mask: HalfEdgeMask): void;
    /**
     * Clear a mask on both sides of an edge.
     * @param mask mask to clear on this edge and its `edgeMate`
     */
    clearMaskAroundEdge(mask: HalfEdgeMask): void;
    /** Returns the number of edges around this face. */
    countEdgesAroundFace(): number;
    /** Return true if other is in the vertex loop around this. */
    findAroundVertex(other: HalfEdge): boolean;
    /** Return true if other is in the face loop around this. */
    findAroundFace(other: HalfEdge): boolean;
    /**
     * @return whether the mask is set (or unset) on all nodes of the face loop
     */
    isMaskedAroundFace(mask: HalfEdgeMask, value?: boolean): boolean;
    /**
     * Apply a edgeTag and mask to all edges around a face.
     * optionally apply it to all edge mates.
     * @param edgeTag tag to apply
     * @param bothSides If true, also apply the tag to the mates around the face.
     */
    setMaskAndEdgeTagAroundFace(mask: HalfEdgeMask, tag: any, applyToMate?: boolean): void;
    /** Returns the number of edges around vertex. */
    countEdgesAroundVertex(): number;
    /** Returns the number of nodes found with the given mask value around this vertex loop. */
    countMaskAroundFace(mask: HalfEdgeMask, value?: boolean): number;
    /** Returns the number of nodes found with the given mask value around this vertex loop.   */
    countMaskAroundVertex(mask: HalfEdgeMask, value?: boolean): number;
    /** Returns the first node with given mask value around this vertex loop.   */
    findMaskAroundVertex(mask: HalfEdgeMask, value?: boolean): HalfEdge | undefined;
    /** Returns the first node with given mask value around this face loop.   */
    findMaskAroundFace(mask: HalfEdgeMask, value?: boolean): HalfEdge | undefined;
    /** Returns the first node with given mask value on this edge (i.e. examining this and this.mate)  */
    findMaskAroundEdge(mask: HalfEdgeMask, value?: boolean): HalfEdge | undefined;
    /** Set a mask, and return prior value.
     * @param mask mask to apply
     */
    testAndSetMask(mask: HalfEdgeMask): number;
    /**
     * Set (copy) the this.x, this.y, this.z from node.x, node.y, node.z
     * @param node node containing xyz
     */
    setXYZFrom(node: HalfEdge): void;
    /**
     * Set (copy) the this.x, this.y, this.z from xyz.x, xyz.y, xyz.z
     * @param node source with x,y,z properties
     */
    setXYZ(xyz: XYAndZ): void;
    /**
     * Test if mask bits are set in the node's bitMask.
     * @return Return true (as a simple boolean, not a mask) if any bits of the mask parameter match bits of the node's bitMask
     */
    isMaskSet(mask: HalfEdgeMask): boolean;
    /** (static!) method to test if a mask is set on a node.
     * This is used as filter in searches.
     * @returns true iff `node.isMaskSet (mask)`
     */
    static filterIsMaskOn(node: HalfEdge, mask: HalfEdgeMask): boolean;
    /** (static!) method to test if a mask is set on a node.
     * This is used as filter in searches.
     * @returns true iff `!node.isMaskSet (mask)`
     */
    static filterIsMaskOff(node: HalfEdge, mask: HalfEdgeMask): boolean;
    /**
     * Create an edge with initial id,x,y at each end.
     * @param id0 id for first node
     * @param x0  x coordinate for first node
     * @param y0  y coordinate for first node
     * @param id1 id for second node
     * @param x1 x coordinate for second node
     * @param y1 y coordinate for second node
     */
    static createEdgeXYXY(id0: any, x0: number, y0: number, id1: any, x1: number, y1: number): HalfEdge;
    /** "pinch" ...
     *
     * * is the universal manipulator for manipulating a node's next and prev pointers
     * * swaps face predecessors of nodeA and nodeB.
     * *  is its own inverse.
     * *  if nodeA, nodeB are in different face loops, the loops join to one loop.
     * *  if nodeA, nodeB are in the same face loop, the loop splits into two loops.
     */
    static pinch(nodeA: HalfEdge, nodeB: HalfEdge): void;
    /**
     * Pinch this half edge out of its base vertex loop.
     * @return the surviving HalfEdge in the vertex loop, or undefined if the instance HalfEdge is already dangling
     */
    yankFromVertexLoop(): HalfEdge | undefined;
    /** Turn all pointers to undefined so garbage collector can reuse the object.
     *  This is to be called only by a Graph object that is being decommissioned.
     */
    decommission(): void;
    /** Return the node. This identity function is useful as the NodeFunction in collector methods. */
    static nodeToSelf(node: HalfEdge): any;
    /** Return the id of a node.  Useful for collector methods. */
    static nodeToId(node: HalfEdge): any;
    /** Return the id of a node.Useful for collector methods. */
    static nodeToIdString(node: HalfEdge): any;
    /** Return the [id, [x,y]] of a node.  Useful for collector methods. */
    static nodeToIdMaskXY(node: HalfEdge): {
        id: any;
        mask: any;
        xy: number[];
    };
    /** Return the [id, [x,y]] of a node.  Useful for collector methods. */
    static nodeToIdXYString(node: HalfEdge): string;
    /** Return the [id, [x,y],z] of a node.  Useful for collector methods. */
    static nodeToIdXYZString(node: HalfEdge): string;
    /** Create a string representation of the mask
     * * Null mask is empty string.
     * * Appended characters B,P,X for Boundary, Primary, Exterior mask bits.
     */
    static nodeToMaskString(node: HalfEdge): string;
    /** Return [x,y] with coordinates of node */
    static nodeToXY(node: HalfEdge): number[];
    /** Return Vector2d to face successor, with only xy coordinates */
    vectorToFaceSuccessorXY(result?: Vector2d): Vector2d;
    /** Return Vector3d to face successor */
    vectorToFaceSuccessor(result?: Vector3d): Vector3d;
    /** Return Vector3d to face successor */
    vectorToFacePredecessor(result?: Vector3d): Vector3d;
    /** test if spaceNode is in the sector at sectorNode */
    static isNodeVisibleInSector(spaceNode: HalfEdge, sectorNode: HalfEdge): boolean;
    /** Returns Return cross product (2d) of vectors from baseA to targetA and baseB to targetB */
    static crossProductXYToTargets(base: HalfEdge, targetA: HalfEdge, targetB: HalfEdge): number;
    /** Returns Return dot product (2d) of vectors along two edges. */
    static dotProductNodeToNodeVectorsXY(baseA: HalfEdge, targetA: HalfEdge, baseB: HalfEdge, targetB: HalfEdge): number;
    /** Return cross product (2d) of vectors from nodeA to nodeB and nodeB to nodeC
     */
    static crossProductXYAlongChain(nodeA: HalfEdge, nodeB: HalfEdge, nodeC: HalfEdge): number;
    /**
     * Compute whether the sector defined by the chain of nodes is convex.
     * * This computation ignores z-coordinates and connectivity, so the nodes are not required to be in the same face loop.
     * @param nodeA the first node in the chain, nominally the face predecessor of nodeB
     * @param nodeB the second node in the chain; the node at the sector vertex
     * @param nodeC the third node in the chain, nominally the face successor of nodeB
     * @param signedAreaTol optional signed area tolerance to use in test for parallel vectors.
     *   Typically this is a fraction of the sector's face's signed area. We can't compute area here, so if undefined, zero tolerance is used.
     * @returns true iff the sector is convex
     */
    static isSectorConvex(nodeA: HalfEdge, nodeB: HalfEdge, nodeC: HalfEdge, signedAreaTol?: number): boolean;
    /**
     * Compute whether the sector at this node is convex.
     * * This computation ignores z-coordinates.
     * @param signedAreaTol optional signed area tolerance to use in test for parallel vectors.
     *   If undefined, a fraction ([[Geometry.smallMetricDistanceSquared]]) of the computed signed area is used.
     *   Pass zero to skip toleranced computation.
     * @returns true iff the sector is convex and its two edges are not antiparallel.
     */
    isSectorConvex(signedAreaTol?: number): boolean;
    /**
     * Compute whether this face is convex.
     * * This computation ignores z-coordinates.
     * @param tolerance optional relative tolerance to use in test for parallel vectors.
     *   Default value is [[Geometry.smallMetricDistanceSquared]].
     *   Pass zero to skip toleranced computation.
     * @returns true iff this face is convex.
     */
    isFaceConvex(tolerance?: number): boolean;
    /**
     * Isolate the edge from the graph by yanking each end from its vertex loop.
     */
    isolateEdge(): void;
    /**
     * @return whether this edge is isolated from the rest of the graph.
     */
    get isIsolatedEdge(): boolean;
    /** Return true if `this` is lexically below `other`, comparing y first then x. */
    belowYX(other: HalfEdge): boolean;
    /** Returns Returns true if the node does NOT have Mask.EXTERIOR_MASK set. */
    static testNodeMaskNotExterior(node: HalfEdge): boolean;
    /** Returns Returns true if the edge mate has Mask.EXTERIOR_MASK set. */
    static testMateMaskExterior(node: HalfEdge): boolean;
    /** Returns radians between this edge and its face predecessor edge, using all three coordinates x,y,z and given normal to resolve sweep direction.
     *   * The returned angle is positive, i.e. may be larger than PI radians.
     */
    static sectorSweepRadiansXYZ(node: HalfEdge, normal: Vector3d): number;
    /** Returns Returns true if the face has positive area in xy parts. */
    static testFacePositiveAreaXY(node: HalfEdge): boolean;
    /** Return true if x and y coordinates of this and other are exactly equal */
    isEqualXY(other: XAndY | HalfEdge): boolean;
    /** Return distance between xy coordinates of this and other node */
    distanceXY(other: HalfEdge): number;
    /** Return distance between xyz coordinates of this and other node */
    distanceXYZ(other: HalfEdge): number;
    /**
     *
     * * Evaluate f(node) at each node around a face loop.
     * * Collect the function values.
     * @returns Return the array of function values.
     */
    collectAroundFace(f?: NodeFunction): any[];
    /**
     * search around a vertex for nodes that have a specified mask setting.
     * @param vertexSeed first node to search
     * @param mask target mask
     * @param value target value for mask on half edges.
     * @param collectedNodes optional array to be cleared and receive masked nodes
     */
    collectMaskedEdgesAroundVertex(mask: HalfEdgeMask, value?: boolean, result?: HalfEdge[]): HalfEdge[];
    /**
     *
     * * Evaluate f(node) at each outbound node around this node's vertex loop.
     * * Collect the function values.
     * @returns Return the array of function values.
     */
    collectAroundVertex(f?: NodeFunction): any[];
    /**
     *
     * * Evaluate f(node) at each node around a face loop.
     * * Sum the function values
     * @returns Return the sum
     */
    sumAroundFace(f: NodeToNumberFunction): number;
    /**
     *
     * * Evaluate f(node) at each outbound node around this node's vertex loop.
     * * Sum the function values
     * @returns Return the sum
     */
    sumAroundVertex(f: NodeToNumberFunction): number;
    /** For all the nodes in the face loop of the given node, clear out the mask given */
    clearMaskAroundFace(mask: HalfEdgeMask): void;
    /** For all the nodes in the vertex loop of the given node, clear out the mask given */
    clearMaskAroundVertex(mask: HalfEdgeMask): void;
    /**
     * Compute the signed sum of xy areas of triangles from first node to edges.
     * * A positive area is counterclockwise.
     * * A negative area is clockwise.
     * @returns signed area of this node's face
     */
    signedFaceArea(): number;
    /**
     * interpolate xy coordinates between this node and its face successor.
     * @param fraction fractional position along this edge.
     * @param result xy coordinates
     */
    fractionToPoint2d(fraction: number, result?: Point2d): Point2d;
    /**
     * interpolate xy coordinates between this node and its face successor.
     * @param fraction fractional position along this edge.
     * @param result xy coordinates
     */
    fractionToPoint3d(fraction: number, result?: Point3d): Point3d;
    /**
     * * interpolate xy coordinates at fractionAlong between this node and its face successor.
     * * shift to left by fractionPerpendicular
     * @param fraction fractional position along this edge.
     * @param result xy coordinates
     */
    fractionAlongAndPerpendicularToPoint2d(fractionAlong: number, fractionPerpendicular: number, result?: Point2d): Point2d;
    /**
     * return the 3d coordinates at this half edge base
     */
    getPoint3d(result?: Point3d): Point3d;
    /**
     * return the 2d coordinates at this half edge base
     */
    getPoint2d(result?: Point2d): Point2d;
    /**
     * return a 3d vector from start to end of this half edge.
     */
    getVector3dAlongEdge(result?: Vector3d): Vector3d;
    /**
     * return a 2d vector from start to end of this half edge
     */
    getVector2dAlongEdge(result?: Vector2d): Vector2d;
    /**
     * Return the interpolated x coordinate between this node and its face successor.
     * @param fraction fractional position along this edge.
     */
    fractionToX(fraction: number): number;
    /**
     * Return the interpolated y coordinate between this node and its face successor.
     * @param fraction fractional position along this edge.
     */
    fractionToY(fraction: number): number;
    /**
     * Return the interpolated z coordinate between this node and its face successor.
     * @param fraction fractional position along this edge.
     */
    fractionToZ(fraction: number): number;
    /**
     * * Compute fractional coordinates of the intersection of edges from given base nodes
     * * If parallel or colinear, return undefined.
     * * If (possibly extended) lines intersect, return the fractions of intersection as x,y in the result.
     * @param nodeA0 Base node of edge A
     * @param nodeB0 Base node of edge B
     * @param result optional preallocated result
     */
    static transverseIntersectionFractions(nodeA0: HalfEdge, nodeB0: HalfEdge, result?: Vector2d): Vector2d | undefined;
    /**
     * * Compute fractional coordinates of the intersection of a horizontal line with an edge.
     * * If the edge is horizontal with (approximate) identical y, return the node.
     * * If the edge is horizontal with different y, return undefined.
     * * If the edge is not horizontal, return the fractional position (possibly outside 0..1) of the intersection.
     * @param node0 Base node of edge
     */
    static horizontalScanFraction(node0: HalfEdge, y: number): number | undefined | HalfEdge;
    /**
     * * Compute fractional coordinates of the intersection of a horizontal line with an edge.
     * * If the edge is horizontal return undefined (no test for horizontal at y!!!)
     * * If the edge is not horizontal and y is between its end y's, return the fraction
     * @param node0 Base node of edge
     */
    static horizontalScanFraction01(node0: HalfEdge, y: number): number | undefined;
    /**
     * Copy various data from source to this.
     * @param source other half edge.
     * @param XYZ copy simple coordinates
     * @param copyVertexData true to copy data belonging to the vertex. (i.e. the "i" member)
     * @param copyVertexData true to copy data belonging to the edge. (i.e. call transferEdgeData)
     * @param copyFaceData true to copy faceTag
     */
    copyDataFrom(source: HalfEdge, copyXYZ: boolean, copyVertexData: boolean, copyEdgeData: boolean, copyFaceData: boolean): void;
}
/**
 * A HalfEdgeGraph has:
 * * An array of (pointers to ) HalfEdge objects.
 * * A pool of masks for grab/drop use by algorithms.
 * @internal
 */
export declare class HalfEdgeGraph {
    /** Simple array with pointers to all the half edges in the graph. */
    allHalfEdges: HalfEdge[];
    private readonly _maskManager;
    private _numNodesCreated;
    constructor();
    /** Ask for a mask (from the graph's free pool.) for caller's use.
     * * Optionally clear the mask throughout the graph.
     */
    grabMask(clearInAllHalfEdges?: boolean): HalfEdgeMask;
    /**
     * Return `mask` to the free pool.
     */
    dropMask(mask: HalfEdgeMask): void;
    /**
     * * Create 2 half edges forming 2 vertices, 1 edge, and 1 face
     * * The two edges are joined as edgeMate pair.
     * * The two edges are a 2-half-edge face loop in both the faceSuccessor and facePredecessor directions.
     * * The two edges are added to the graph's HalfEdge set
     * @returns Return pointer to the first half edge created.
     */
    createEdgeXYZXYZ(xA?: number, yA?: number, zA?: number, iA?: number, xB?: number, yB?: number, zB?: number, iB?: number): HalfEdge;
    /**
     * * Create 2 half edges forming 2 vertices, 1 edge, and 1 face
     * * The two edges are joined as edgeMate pair.
     * * The two edges are a 2-half-edge face loop in both the faceSuccessor and facePredecessor directions.
     * * The two edges are added to the graph's HalfEdge set
     * * Coordinates are set to zero.
     * * ids are installed in the two half edges.
     * @returns Return pointer to the first half edge created.  (This has idA as its id.)
     */
    createEdgeIdId(iA?: number, iB?: number): HalfEdge;
    /**
     * * create an edge from coordinates x,y,z to (the tail of) an existing half edge.
     * @returns Return pointer to the half edge with tail at x,y,z
     */
    createEdgeXYZHalfEdge(xA: number, yA: number, zA: number, iA: number, node: HalfEdge, iB?: number): HalfEdge;
    /**
     * * create an edge from coordinates x,y,z to (the tail of) an existing half edge.
     * @returns Return pointer to the half edge with tail at x,y,z
     */
    createEdgeHalfEdgeHalfEdge(nodeA: HalfEdge, idA: number, nodeB: HalfEdge, idB?: number): HalfEdge;
    /**
     * * Create 2 half edges forming 2 vertices, 1 edge, and 1 face
     * * The two edges are joined as edgeMate pair.
     * * The two edges are a 2-half-edge face loop in both the faceSuccessor and facePredecessor directions.
     * * The two edges are added to the graph's HalfEdge set
     * @returns Return pointer to the first half edge created.
     */
    createEdgeXYAndZ(xyz0: XYAndZ, id0: number, xyz1: XYAndZ, id1: number): HalfEdge;
    /**
     * * Insert a vertex in the edge beginning at base.
     * * this creates two half edges.
     * * The base of the new edge is 'after' the (possibly undefined) start node in its face loop.
     * * The existing mate retains its base xyz and i properties but is no longer the mate of base.
     * * The base and existing mate each become mates with a new half edge.
     * @returns Returns the reference to the half edge created.
     */
    splitEdge(base: undefined | HalfEdge, xA?: number, yA?: number, zA?: number, iA?: number): HalfEdge;
    /**
     * * Create a sliver face "within" an edge.
     * * this creates two half edges.
     * * The existing edges both stay in their same face loops and retain coordinates and i value.
     * * Each existing edge's mate is a new edge (rather than original mate)
     * * Coordinates are copied to the new edges at respective vertices.
     * * New faceTag and edgeTag undefined.
     * * i members are copied around their respective vertices.
     * @returns Returns the reference to the half edge created.
     */
    splitEdgeCreateSliverFace(base: HalfEdge): HalfEdge;
    /**
     * * Insert a vertex in the edge beginning at base, with coordinates specified as a fraction along the existing edge.
     * * this creates two half edges.
     * * The base of the new edge is 'after' the (possibly undefined) start node in its face loop.
     * * The existing mate retains its base xyz and i properties but is no longer the mate of base.
     * * The base and existing mate each become mates with a new half edge.
     * @returns Returns the reference to the half edge created.
     */
    splitEdgeAtFraction(base: HalfEdge, fraction: number): HalfEdge;
    /** This is a destructor-like action that eliminates all interconnection among the graph's nodes.
     * After this is called the graph is unusable.
     */
    decommission(): void;
    /** create two nodes of a new edge.
     * @returns Return one of the two nodes, which the caller may consider as the start of the edge.
     */
    addEdgeXY(x0: number, y0: number, x1: number, y1: number): HalfEdge;
    /** Clear selected bits in all nodes of the graph. */
    clearMask(mask: HalfEdgeMask): void;
    /** Set selected bits in all nodes of the graph. */
    setMask(mask: HalfEdgeMask): void;
    /** toggle selected bits in all nodes of the graph. */
    reverseMask(mask: HalfEdgeMask): void;
    /**
     * Return the number of nodes that have a specified mask bit set.
     * @param mask mask to count
     */
    countMask(mask: HalfEdgeMask): number;
    /** Return an array LineSegment3d.
     * * The array has one segment per edge
     * * The coordinates are taken from a node and its face successor.
     * * On each edge, the line segment start at the HalfEdge with lower id than its edgeMate.
     */
    collectSegments(): LineSegment3d[];
    /** Returns the number of vertex loops in a graph structure */
    countVertexLoops(): number;
    /** Returns the number of face loops */
    countFaceLoops(): number;
    /**
     * Returns the number of face loops satisfying a filter function with mask argument.
     *
     */
    countFaceLoopsWithMaskFilter(filter: HalfEdgeAndMaskToBooleanFunction, mask: HalfEdgeMask): number;
    /** Returns an array of nodes, where each node represents a starting point of a face loop.
     */
    collectFaceLoops(): HalfEdge[];
    /** Returns an array of nodes, where each node represents a starting point of a vertex loop.
     */
    collectVertexLoops(): HalfEdge[];
    /**
     * * Visit each facet of the graph once.
     * * Call the announceFace function
     * * continue search if announceFace(graph, node) returns true
     * * terminate search if announce face (graph, node) returns false
     * @param  announceFace function to apply at one node of each face.
     */
    announceFaceLoops(announceFace: GraphNodeFunction): void;
    /**
     * * Visit each edge of the graph once.
     * * Call the announceEdge function.
     * * the edge mate will NOT appear in an announceEdge call.
     * * continue search if announceEdge(graph, node) returns true
     * * terminate search if announceEdge (graph, node) returns false
     * @param  announceEdge function to apply at one node of each edge.
     */
    announceEdges(announceEdge: GraphNodeFunction): void;
    /**
     * * Visit each vertex loop of the graph once.
     * * Call the announceVertex function
     * * continue search if announceVertex(graph, node) returns true
     * * terminate search if announce vertex (graph, node) returns false
     * @param  announceVertex function to apply at one node of each face.
     */
    announceVertexLoops(announceVertex: GraphNodeFunction): void;
    /**
     * * Visit each half edge (node) of the graph once.
     * * Call the announceNode function
     * * continue search if announceNode(graph, node) returns true
     * * terminate search if announce face (graph, node) returns false
     * @param  announceNode function to apply at one node of each face.
     */
    announceNodes(announceNode: GraphNodeFunction): void;
    /** Return the number of nodes in the graph */
    countNodes(): number;
    /** Apply transform to the xyz coordinates in the graph. */
    transformInPlace(transform: Transform): void;
    /**
     * disconnect and delete all nodes that satisfy a filter condition.
     * @param deleteThisNode returns true to delete the corresponding edge. Should act symmetrically on the edgeMate.
     * @returns the number of nodes deleted (twice the number of deleted edges).
     */
    yankAndDeleteEdges(deleteThisNode: NodeFunction): number;
    /**
     * Delete all isolated edges.
     * @return the number of nodes deleted (twice the number of deleted edges).
     */
    deleteIsolatedEdges(): number;
}
