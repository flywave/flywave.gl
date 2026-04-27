import { type ConvexClipPlaneSet } from "../clipping/convex-clip-plane-set";
import { type LineSegment3d } from "../curve/line-segment3d";
import { LineString3d } from "../curve/line-string3d";
import { type PlaneAltitudeEvaluator } from "../geometry";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
/**
 * interface containing various options appropriate to merging lines segments into chains.
 * @internal
 */
export interface ChainMergeContextOptions {
    /**
     * Tolerance for declaring points equal
     * * Default is `Geometry.smallMetricDistance`
     */
    tolerance?: number;
    /**
     * Direction for primary sort.
     * * Default is `Vector3d.create(0.294234298, 0.72391399, 0.45234328798)`
     * * this vector should NOT be along a principal x,y,z direction.
     * * The internal form will be normalized.
     */
    primarySortDirection?: Vector3d;
}
/**
 * * Context for assembling line segments into chains.
 * * Use the context in phases:
 *   * Create the context:   `context = ChainMergeContext.create ()`
 *   * Add line with any combination of:
 *      * `context.addSegment(pointA, pointB)`
 *      * `context.addLineSegment3dArray (segments)`
 *   * Scan all coordinate data for common coordinates.  Twist nodes together to form chains:
 *      * `context.clusterAndMergeVerticesXYZ ()`
 *   * Collect the chains:
 *      * myLinestringArray = context.collectMaximalChains();
 * * The context carries an optional plane which is used by addSegmentsOnPlane
 *
 * @internal
 */
export declare class ChainMergeContext {
    private readonly _graph;
    private readonly _options;
    private _plane?;
    private _convexClipper?;
    private constructor();
    /** Save a reference plane for later use, e.g. in addSegmentsOnPlane */
    set plane(value: PlaneAltitudeEvaluator | undefined);
    /** Property access for the reference plane. */
    get plane(): PlaneAltitudeEvaluator | undefined;
    /** Save a reference plane for later use, e.g. in addSegmentsOnPlane */
    set convexClipper(value: ConvexClipPlaneSet | undefined);
    /** Property access for the reference plane. */
    get convexClipper(): ConvexClipPlaneSet | undefined;
    /**
     * * Construct an empty chain merge graph.
     * * The options parameter may contain any combination of the options values.
     *   * tolerance = absolute tolerance for declaring points equal.
     *     * Default is `Geometry.smallMetricDistance`
     *   * primarySortDirection = direction for first sort.
     *     * To minimize clash among points on primary sort, this should NOT be perpendicular to any principal plane.
     *     * The default points into the first octant with non-obvious components.
     */
    static create(options?: ChainMergeContextOptions): ChainMergeContext;
    /** Add a segment to the evolving graph. */
    addSegment(pointA: Point3d, pointB: Point3d): void;
    /** Add all segments from an array to the graph. */
    addLineSegment3dArray(data: LineSegment3d[]): void;
    /** Add edges for all segments that are "on" the plane.
     * * No action if `this.plane` is undefined.
     */
    addSegmentsOnPlane(points: GrowableXYZArray, addClosure?: boolean): void;
    /**
     * Return a numeric value to be used for sorting, with little chance widely separated nodes will have identical key.
     * * Any single x,y,z component is a poor choice because horizontal and vertical alignment is common.
     * * Hence take dot product of x,y,z with non-trivial fraction values.
     * @param node node with x,y,z coordinates
     */
    private primarySortKey;
    /** Return difference of sortData members as sort comparison */
    private static nodeCompareSortData;
    /** test if nodeA is a dangling edge end (i.e. edges around vertex equal 1, but detect it without walking all the way around. */
    private static isIsolatedEnd;
    /** test if nodeA is at a vertex with exactly 2 edges (i.e. edges around vertex equal w, but detect it without walking all the way around. */
    private static isChainInteriorVertex;
    /**
     * * isolate all edge ends.
     * * perform cluster analysis to determine nearly coincident points.
     * * pinch all edges together at each vertex.
     */
    clusterAndMergeVerticesXYZ(): void;
    /**
     * If node0 is not visited, creating a linestring with that starting edge and all successive edges along a chain.
     * @param chains growing array of chains.
     * @param node0 start node for search.
     */
    private collectMaximalLineString3dFromStartNode;
    /**
     * If node0 is not visited, creating a linestring with that starting edge and all successive edges along a chain.
     * @param chains growing array of chains.
     * @param node0 start node for search.
     */
    private collectMaximalGrowableXYXArrayFromStartNode;
    /**
     * * find edges with start, end in same vertex loop.
     * * pinch them away from the loop
     * * set mask on both sides.
     * * Return the number of excisions.
     */
    private exciseAndMarkSlingEdges;
    /** Collect chains which have maximum edge count, broken at an vertex with other than 2 edges.
     * * This is assumed to be preceded by a call to a vertex-cluster step such as `clusterAndMergeVerticesYXZ`
     */
    collectMaximalChains(): LineString3d[];
    collectMaximalGrowableXYZArrays(): GrowableXYZArray[];
}
