import { Range2d, Range3d } from "../geometry3d/range";
import { type HalfEdge, type NodeToNumberFunction, HalfEdgeGraph, HalfEdgeMask } from "../topology/graph";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { type CurvePrimitive } from "./curve-primitive";
import { type AnyRegion } from "./curve-types";
import { LineSegment3d } from "./line-segment3d";
import { Loop } from "./loop";
import { ParityRegion } from "./parity-region";
import { type GraphCheckPointFunction, RegionBinaryOpType } from "./region-ops";
/**
 * base class for callbacks during region sweeps.
 * * At start of a component, `startComponent(node)` is called announcing a representative node on the outermost face.
 *   * A Component in this usage is a component that is edge connected when ignoring "exterior bridge edges".
 * * As each face is entered, `enterFace(facePathStack, newFaceNode)` is called
 *   * facePathStack[0] is the outermost node of the path from the outer face.
 *   * facePathStack[1] is its inside mate.
 *   * facePathStack[2k] is the outside node at crossing to face at depth k.
 *   * facePathStack[2k+1] is the node where face at depth k was entered.
 *   * newFaceNode is the entry node (redundant of stack tip)
 *  * On retreat from a face, `leaveFace(facePathStack, faceNode)` is called.
 *  * At end of component, `finishComponent (node)` is called.
 * * The base class is fully implemented to do nothing during the sweep.
 * @internal
 */
declare abstract class RegionOpsFaceToFaceSearchCallbacks {
    /** Announce a representative node on the outer face of a component */
    startComponent(_node: HalfEdge): boolean;
    /** Announce return to outer face */
    finishComponent(_node: HalfEdge): boolean;
    /** Announce face entry */
    enterFace(_facePathStack: HalfEdge[], _newFaceNode: HalfEdge): boolean;
    /** Announce face exit */
    leaveFace(_facePathStack: HalfEdge[], _newFaceNode: HalfEdge): boolean;
}
/** Function signature ot announce classification of a face.
 * The `faceType` parameters are
 * * -1 for a fully exterior face.  This is a negative area face.
 * * 0 for a positive area face classified as "out" for the boolean.
 * * 1 for a positive area face classified as "in" for the boolean.
 */
type AnnounceClassifiedFace = (graph: HalfEdgeGraph, faceSeed: HalfEdge, faceType: -1 | 0 | 1, area: number) => void;
/**
 * Low level graph search for face classification.
 * @internal
 */
export declare class RegionOpsFaceToFaceSearch {
    /**
     * run a DFS with face-to-face step announcements.
     * * false return from any function terminates search immediately.
     * * all reachable nodes assumed to have both visit masks clear.
     * @param graph containing graph.
     * @param seed first node to visit.
     * @param faceHasBeenVisited mask marking faces that have been seen.
     * @param nodeHasBeenVisited mask marking node-to-node step around face.
     *
     */
    static faceToFaceSearchFromOuterLoop(_graph: HalfEdgeGraph, seed: HalfEdge, faceHasBeenVisited: HalfEdgeMask, nodeHasBeenVisited: HalfEdgeMask, callbacks: RegionOpsFaceToFaceSearchCallbacks): void;
    /** Complete multi-step process for polygon binary booleans starting with arrays of coordinates.
     * * Each of the binary input terms is a collection of loops
     *   * Within the binary term, in/out is determined by edge-crossing parity rules.
     * * Processing steps are
     *   * Build the loops for each set.
     *      * Each edge labeled with 1 or 2 as binary term identifier.
     *   * find crossings among the edges.
     *      * Edges are split as needed, but split preserves the edgeTag
     *   * sort edges around vertices
     *   * add regularization edges so holes are connected to their parent.
     */
    static doPolygonBoolean(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, faceSelectFunction: (inA: boolean, inB: boolean) => boolean, graphCheckPoint?: GraphCheckPointFunction): HalfEdgeGraph | undefined;
    /** Complete multi-step process for polygon binary booleans starting with arrays of coordinates.
     * * the manyLoopsAndParitySets input is an array.
     * * Each entry is one or more loops.
     * * An entry that is "just points" is a simple loop.
     * * An entry that is itself an array of arrays of points is a set of loops with "parity" -- relation:
     *    * typically the first is an outer loop an others are holes.
     *    * but if there is self intersection or multiple outer loops, parity rules are applied to decide inner and outer.
     * * Processing steps are
     *   * Build the loops for each set.
     *      * Each edge labeled with index to the outer array.
     *   * find crossings among the edges.
     *      * Edges are split as needed, but split preserves the edgeTag
     *   * sort edges around vertices
     *   * add regularization edges so holes are connected to their parent.
     *   * assign inside/outside by parity within each set and overall union.
     */
    static doBinaryBooleanBetweenMultiLoopInputs(dataA: MultiLineStringDataVariant[], opA: RegionGroupOpType, binaryOp: RegionBinaryOpType, dataB: MultiLineStringDataVariant[], opB: RegionGroupOpType, purgeSliverExteriorFaces: boolean): HalfEdgeGraph | undefined;
}
/**
 * Enumeration of operation types "within a group operand" for a `RegionBooleanContext`.
 * @internal
 */
export declare enum RegionGroupOpType {
    Union = 0,
    Parity = 1,
    Intersection = 2,
    NonBounding = -1
}
/**
 * Each loop or parity region in a `RegionBooleanContext` is recorded as a `RegionGroupMember`, which carries
 * * the Loop or parityRegion object
 * * a numeric indication of the sweep state (parity) during the classification search.
 * * a reference to the parent group (which in turn leads back to the `RegionBooleanContext`)
 * @internal
 */
declare class RegionGroupMember {
    region: Loop | ParityRegion | CurvePrimitive | MultiLineStringDataVariant;
    sweepState: number;
    parentGroup: RegionGroup;
    constructor(region: Loop | ParityRegion | CurvePrimitive | MultiLineStringDataVariant, parentGroup: RegionGroup);
    clearState(): void;
}
/**
 * A `RegionGroup` is
 * * An array of `RegionGroupMembers`, carrying the regions of the Ai or Bi part of the boolean expression.
 * * The `RegionGroupOpType` to be applied among those members.
 * * Pointer to the containing context
 * * The count of number of regions known to be "in" as the search progresses.
 * @internal
 */
export declare class RegionGroup {
    members: RegionGroupMember[];
    groupOpType: RegionGroupOpType;
    parent: RegionBooleanContext;
    private _numIn;
    constructor(parent: RegionBooleanContext, groupOpType: RegionGroupOpType);
    /** deep clear of state data -- group header plus all members */
    clearState(): void;
    range(): Range3d;
    /** Ask if the current _numIn count qualifies as an "in" for this operation type.
     */
    getInOut(): boolean;
    addMember(data: AnyRegion | AnyRegion[] | LineSegment3d | undefined, allowLineSegment?: boolean): void;
    recordMemberStateChange(oldState: number, newState: number): void;
}
/**
 * A `RegionBooleanContext` carries structure and operations for binary operations between two sets of regions.
 * * In the binary operation OP (union, intersection, parity, difference), the left and right operands
 *     are each a composite union, difference, or parity among multiple inputs, i.e.
 *   * (operationA among Ai) OP (operationB among Bi)
 *   * where the Ai are one set of regions, being combined by operationA
 *   * and the Bi are the another set of regions, being combined by operationB
 * * Each group of Ai and Bi is a `RegionGroup`
 * * This is an extremely delicate structure.
 * * Members are public because of the unique variety of queries, but should only be used for queries.
 * * The graph and curves in the booleans are connected by an extended pointer chain:
 *    * (HalfEdge in Graph).edgeTag points to a CurveLocationDetail
 *    * (CurveLocationDetail).curve points to a curve
 *    * (Curve).parent points to RegionGroupMember
 *    * (RegionGroupMember) points to RegionGroup
 *    * (RegionGroup) points to RegionBooleanBinaryContext
 * * So..when a graph sweep crosses an edge,
 *    * the chain leads to a parity count in the RegionGroupMember
 *    * that can change the number of members active in the RegionGroup
 *    * which can change the state of the context.
 * @internal
 */
export declare class RegionBooleanContext implements RegionOpsFaceToFaceSearchCallbacks {
    groupA: RegionGroup;
    groupB: RegionGroup;
    extraGeometry: RegionGroup;
    graph: HalfEdgeGraph;
    faceAreaFunction: NodeToNumberFunction;
    binaryOp: RegionBinaryOpType;
    private constructor();
    /**
     * Create a context with both A and B groups empty.
     * * Caller follows up by calls to `context.groupA.addMember (loopOrParityRegion)` or `context.groupB.addMember (loopOrParityRegion)`
     * @param groupTypeA
     * @param groupTypeB
     */
    static create(groupTypeA: RegionGroupOpType, groupTypeB: RegionGroupOpType): RegionBooleanContext;
    addMembers(dataA: AnyRegion | AnyRegion[] | undefined, dataB: AnyRegion | AnyRegion[] | undefined): void;
    private _workSegment?;
    private static readonly _bridgeDirection;
    /**
     * The sweep operations require access to all geometry by edge crossings and face walk.
     * If input loops are non-overlapping, there may be disconnected islands not reachable.
     * This method:
     * * finds the total range
     * * creates parallel rays from the extreme point of each loop and extending beyond the overall range
     * * places those lines in the extraGeometry group
     */
    addConnectives(): void;
    /**
     * Markup and assembly steps for geometry in the RegionGroups.
     * * Annotate connection from group to curves.
     *    * groups with point data but no curves get no further annotation.
     * * compute intersections.
     * * assemble and merge the HalfEdgeGraph.
     * @param mergeTolerance absolute distance tolerance for merging loops
     */
    annotateAndMergeCurvesInGraph(mergeTolerance?: number): void;
    private _announceFaceFunction?;
    /**
     * Sweep through the graph to assign in/out classifications to all faces.
     * * the classification is announced in two ways:
     *   * the EXTERNAL mask is set on all half edges that are NOT interior faces.
     *   * the announceFaceFunction is called once for each face.
     * @param binaryOp
     * @param announceFaceFunction
     */
    runClassificationSweep(binaryOp: RegionBinaryOpType, announceFaceFunction?: AnnounceClassifiedFace): void;
    unmaskMaskedNullFaces(mask: number): void;
    private getInOut;
    /**
     * Record transition across an edge as entry or exit from a RegionGroup.
     * * Work backward from the node to a RegionGroup.  This path can be:
     *   * If the node points to a CurveLocationDetail of a (possibly partial) curve, the path is (take a deep breath)
     *      * node points to CurveLocation Detail
     *      * CurveLocationDetail points to curve
     *      * curve points to RegionGroupMember
     *  * If the node points directly to a RegionGroup, it's ready to go!!!
     * @param node
     * @param delta
     */
    private recordTransitionAcrossEdge;
    /** Announce a representative node on the outer face of a component */
    startComponent(outerFaceNode: HalfEdge): boolean;
    /** Announce return to outer face */
    finishComponent(_node: HalfEdge): boolean;
    /** Announce entry to a graph face.
     * * Both both sides of a graph edge are from the same RegionGroupMember.
     * * Hence "crossing that edge" changes the parity count for the RegionGroupMember that owns that edge by 1.
     * * The parity count for other RegionGroupMembers are never affected by this crossing.
     * * Crossing a bridge edge does not change the parity count.
     */
    enterFace(_facePathStack: HalfEdge[], newFaceNode: HalfEdge): boolean;
    /** Announce face exit */
    leaveFace(_facePathStack: HalfEdge[], oldFaceNode: HalfEdge): boolean;
}
/**
 * Function to accumulate area under edges
 * Array of nodes representing faces in a subset of a graph.
 * @internal
 */
export type NodeAndRangeFunction = (edge: HalfEdge, range: Range2d) => void;
/**
 * Array of nodes representing faces in a subset of a graph.
 * @internal
 */
export declare class GraphComponent {
    faces: HalfEdge[];
    faceAreas: number[];
    range: Range2d;
    constructor(faces: HalfEdge[]);
    /**
     * visit all vertices and edges in the component to build face area array and composite range.
     *
     * @param extendRangeForEdge optional function to compute edge range.  If undefined, linear edge is assumed.
     * @param faceAreaFunction optional function to compute face area.  If undefined, linear edges are assumed.
     */
    buildFaceData(extendRangeForEdge: NodeAndRangeFunction | undefined, faceAreaFunction: NodeToNumberFunction | undefined): void;
}
/** build and hold an array of component data for a HalfEdgeGraph.
 * @internal
 */
export declare class GraphComponentArray {
    components: GraphComponent[];
    graph: HalfEdgeGraph;
    private constructor();
    static create(graph: HalfEdgeGraph, extendRangeForEdge?: (edge: HalfEdge, range: Range2d) => void): GraphComponentArray;
}
export {};
