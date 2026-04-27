import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { Range3d } from "../geometry3d/range";
import { Transform } from "../geometry3d/transform";
import { MomentData } from "../geometry4d/moment-data";
import { type IndexedPolyface, type Polyface } from "../polyface/polyface";
import { type HalfEdge, type HalfEdgeGraph, HalfEdgeMask } from "../topology/graph";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
import { BagOfCurves, CurveChain, CurveCollection } from "./curve-collection";
import { CurvePrimitive } from "./curve-primitive";
import { type AnyCurve, type AnyRegion } from "./curve-types";
import { type SignedLoops, Loop } from "./loop";
import { type JointOptions, OffsetOptions } from "./offset-options";
import { Path } from "./path";
import { type StrokeOptions } from "./stroke-options";
/**
 * Possible return types from [[splitToPathsBetweenBreaks]], [[collectInsideAndOutsideOffsets]] and
 * [[collectChains]].
 * @public
 */
export type ChainTypes = CurvePrimitive | Path | BagOfCurves | Loop | undefined;
/**
 * * `properties` is a string with special characters indicating
 *   * "U" -- contains unmerged stick data
 *   * "M" -- merged
 *   * "R" -- regularized
 *   * "X" -- has exterior markup
 * @internal
 */
export type GraphCheckPointFunction = (name: string, graph: HalfEdgeGraph, properties: string, extraData?: any) => any;
/**
 * Enumeration of the binary operation types for a booleans among regions
 * @public
 */
export declare enum RegionBinaryOpType {
    Union = 0,
    Parity = 1,
    Intersection = 2,
    AMinusB = 3,
    BMinusA = 4
}
/**
 * Class `RegionOps` has static members for calculations on regions (areas).
 * * Regions are represented by these `CurveCollection` subclasses:
 *   * `Loop` -- a single loop
 *   * `ParityRegion` -- a collection of loops, interpreted by parity rules.
 * The common "One outer loop and many Inner loops" is a parity region.
 *   * `UnionRegion` -- a collection of `Loop` and `ParityRegion` objects understood as a (probably disjoint) union.
 * * **NOTE:** Most of the methods in this class ignore z-coordinates, so callers should ensure that input geometry has
 * been rotated parallel to the xy-plane.
 * @public
 */
export declare class RegionOps {
    /**
     * Return moment sums for a loop, parity region, or union region.
     * * If `rawMomentData` is the MomentData returned by computeXYAreaMoments, convert to principal axes and moments with
     *    call `principalMomentData = MomentData.inertiaProductsToPrincipalAxes (rawMomentData.origin, rawMomentData.sums);`
     * @param root any Loop, ParityRegion, or UnionRegion.
     */
    static computeXYAreaMoments(root: AnyRegion): MomentData | undefined;
    /**
     * Return an area tolerance for a given xy-range and optional distance tolerance.
     * @param range range of planar region to tolerance
     * @param distanceTolerance optional absolute distance tolerance
     */
    static computeXYAreaTolerance(range: Range3d, distanceTolerance?: number): number;
    /**
     * Return a (signed) xy area for a region.
     * * The area is negative if and only if the region is oriented clockwise with respect to the positive z-axis.
     * @param root any Loop, ParityRegion, or UnionRegion.
     */
    static computeXYArea(root: AnyRegion): number | undefined;
    /**
     * Return MomentData with the sums of wire moments.
     * * If `rawMomentData` is the MomentData returned by computeXYAreaMoments, convert to principal axes and moments with
     *    call `principalMomentData = MomentData.inertiaProductsToPrincipalAxes (rawMomentData.origin, rawMomentData.sums);`
     * @param root any CurveCollection or CurvePrimitive.
     */
    static computeXYZWireMomentSums(root: AnyCurve): MomentData | undefined;
    /**
     * Create loops in the graph.
     * @internal
     */
    static addLoopsToGraph(graph: HalfEdgeGraph, data: MultiLineStringDataVariant, announceIsolatedLoop: (graph: HalfEdgeGraph, seed: HalfEdge) => void): void;
    /**
     * Add multiple loops to a graph.
     * * Apply edgeTag and mask to each edge.
     * @internal
     */
    static addLoopsWithEdgeTagToGraph(graph: HalfEdgeGraph, data: MultiLineStringDataVariant, mask: HalfEdgeMask, edgeTag: any): HalfEdge[] | undefined;
    /**
     * Given a graph just produced by booleans, convert to a polyface
     * * "just produced" implies exterior face markup.
     * @param graph
     * @param triangulate
     */
    private static finishGraphToPolyface;
    /**
     * Return a polyface containing the area intersection of two XY regions.
     * * Within each region, in and out is determined by parity rules.
     *   * Any face that is an odd number of crossings from the far outside is IN
     *   * Any face that is an even number of crossings from the far outside is OUT
     * @param loopsA first set of loops
     * @param loopsB second set of loops
     * @param triangulate whether to triangulate the result
     */
    static polygonXYAreaIntersectLoopsToPolyface(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, triangulate?: boolean): Polyface | undefined;
    /**
     * Return a polyface containing the area union of two XY regions.
     * * Within each region, in and out is determined by parity rules.
     *   * Any face that is an odd number of crossings from the far outside is IN
     *   * Any face that is an even number of crossings from the far outside is OUT
     * @param loopsA first set of loops
     * @param loopsB second set of loops
     * @param triangulate whether to triangulate the result
     */
    static polygonXYAreaUnionLoopsToPolyface(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, triangulate?: boolean): Polyface | undefined;
    /**
     * Return a polyface containing the area difference of two XY regions.
     * * Within each region, in and out is determined by parity rules.
     *   * Any face that is an odd number of crossings from the far outside is IN
     *   * Any face that is an even number of crossings from the far outside is OUT
     * @param loopsA first set of loops
     * @param loopsB second set of loops
     * @param triangulate whether to triangulate the result
     */
    static polygonXYAreaDifferenceLoopsToPolyface(loopsA: MultiLineStringDataVariant, loopsB: MultiLineStringDataVariant, triangulate?: boolean): Polyface | undefined;
    /**
     * Return areas defined by a boolean operation.
     * * If there are multiple regions in loopsA, they are treated as a union.
     * * If there are multiple regions in loopsB, they are treated as a union.
     * @param loopsA first set of loops
     * @param loopsB second set of loops
     * @param operation indicates Union, Intersection, Parity, AMinusB, or BMinusA
     * @param mergeTolerance absolute distance tolerance for merging loops
     * @returns a region resulting from merging input loops and the boolean operation. May contain bridge edges added
     * to connect interior loops to exterior loops.
     */
    static regionBooleanXY(loopsA: AnyRegion | AnyRegion[] | undefined, loopsB: AnyRegion | AnyRegion[] | undefined, operation: RegionBinaryOpType, mergeTolerance?: number): AnyRegion | undefined;
    /**
     * Return a polyface whose facets are a boolean operation between the input regions.
     * * Each of the two inputs is an array of multiple loops or parity regions.
     *   * Within each of these input arrays, the various entries (loop or set of loops) are interpreted as a union.
     * * In each "array of loops and parity regions", each entry inputA[i] or inputB[i] is one of:
     *    * A simple loop, e.g. array of Point3d.
     *    * Several simple loops, each of which is an array of Point3d.
     * @param inputA first set of loops
     * @param operation indicates Union, Intersection, Parity, AMinusB, or BMinusA
     * @param inputB second set of loops
     * @param triangulate whether to triangulate the result
     */
    static polygonBooleanXYToPolyface(inputA: MultiLineStringDataVariant[], operation: RegionBinaryOpType, inputB: MultiLineStringDataVariant[], triangulate?: boolean): Polyface | undefined;
    /**
     * Return loops of linestrings around areas of a boolean operation between the input regions.
     * * Each of the two inputs is an array of multiple loops or parity regions.
     *   * Within each of these input arrays, the various entries (loop or set of loops) are interpreted as a union.
     * * In each "array of loops and parity regions", each entry inputA[i] or inputB[i] is one of:
     *    * A simple loop, e.g. array of Point3d.
     *    * Several simple loops, each of which is an array of Point3d.
     * @param inputA first set of loops
     * @param operation indicates Union, Intersection, Parity, AMinusB, or BMinusA
     * @param inputB second set of loops
     */
    static polygonBooleanXYToLoops(inputA: MultiLineStringDataVariant[], operation: RegionBinaryOpType, inputB: MultiLineStringDataVariant[]): AnyRegion | undefined;
    /**
     * Construct a wire that is offset from the given polyline or polygon.
     * * This is a simple wire offset, not an area offset.
     * * Since z-coordinates are ignored, for best results the input points should lie in (a plane parallel to)
     * the xy-plane.
     * * The construction algorithm attempts to eliminate some self-intersections within the offsets, but does not
     * guarantee a simple area offset.
     * @param points a single loop or path
     * @param wrap true to include wraparound
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or JointOptions
     * object.
     */
    static constructPolygonWireXYOffset(points: Point3d[], wrap: boolean, offsetDistanceOrOptions: number | JointOptions): CurveChain | undefined;
    /**
     * Construct curves that are offset from a Path or Loop as viewed in xy-plane (ignoring z).
     * * The construction will remove "some" local effects of features smaller than the offset distance, but will
     * not detect self intersection among widely separated edges.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/Offset
     * @param curves base curves.
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or options object.
     */
    static constructCurveXYOffset(curves: Path | Loop, offsetDistanceOrOptions: number | JointOptions | OffsetOptions): CurveCollection | undefined;
    /**
     * Test if point (x,y) is IN, OUT or ON a region.
     * @return (1) for in, (-1) for OUT, (0) for ON
     * @param curves input region
     * @param x x coordinate of point to test
     * @param y y coordinate of point to test
     */
    static testPointInOnOutRegionXY(curves: AnyRegion, x: number, y: number): number;
    /**
     * Create curve collection of subtype determined by gaps between the input curves.
     * * If (a) wrap is requested and (b) all curves connect head-to-tail (including wraparound), assemble as a `loop`.
     * * If all curves connect head-to-tail except for closure, return a `Path`.
     * * If there are internal gaps, return a `BagOfCurves`
     * * If input array has zero length, return undefined.
     * @param curves input curves
     * @param wrap whether to create a Loop (true) or Path (false) if maximum gap is minimal
     * @param consolidateAdjacentPrimitives whether to simplify the result by calling [[consolidateAdjacentPrimitives]]
     */
    static createLoopPathOrBagOfCurves(curves: CurvePrimitive[], wrap?: boolean, consolidateAdjacentPrimitives?: boolean): CurveCollection | undefined;
    private static _graphCheckPointFunction?;
    /**
     * Announce Checkpoint function for use during booleans
     * @internal
     */
    static setCheckPointFunction(f?: GraphCheckPointFunction): void;
    /**
     * Find all intersections among curves in `curvesToCut` and `cutterCurves` and return fragments of `curvesToCut`.
     * * For a `Loop`, `ParityRegion`, or `UnionRegion` in `curvesToCut`:
     *    * if it is never cut by any `cutter` curve, it will be left unchanged.
     *    * if cut, the input is downgraded to a set of `Path` curves joining at the cut points.
     * * All cutting is "as viewed in the xy plane"
     * @param curvesToCut input curves to be fragmented at intersections with `cutterCurves`
     * @param cutterCurves input curves to intersect with `curvesToCut`
     */
    static cloneCurvesWithXYSplits(curvesToCut: AnyCurve | undefined, cutterCurves: CurveCollection): AnyCurve | undefined;
    /**
     * Create paths assembled from many curves.
     * * Assemble paths from consecutive curves NOT separated by either gaps or the split markup set by
     * [[cloneCurvesWithXYSplits]].
     * * Return simplest form -- single primitive, single path, or bag of curves.
     */
    static splitToPathsBetweenBreaks(source: AnyCurve | undefined, makeClones: boolean): ChainTypes;
    /**
     * Restructure curve fragments as Paths and Loops, and construct xy-offsets of the chains.
     * * If the inputs do not form Loop(s), the classification of offsets is suspect.
     * * For best offset results, the inputs should be parallel to the xy-plane.
     * @param fragments fragments to be chained and offset
     * @param offsetDistance offset distance, applied to both sides of each fragment to produce inside and outside xy-offset curves.
     * @param gapTolerance distance to be treated as "effectively zero" when assembling fragments head-to-tail
     * @returns object with named chains, insideOffsets, outsideOffsets
     */
    static collectInsideAndOutsideOffsets(fragments: AnyCurve[], offsetDistance: number, gapTolerance: number): {
        insideOffsets: AnyCurve[];
        outsideOffsets: AnyCurve[];
        chains: ChainTypes;
    };
    /**
     * Restructure curve fragments as Paths and Loops.
     * @param fragments fragments to be chained
     * @param gapTolerance distance to be treated as "effectively zero" when assembling fragments head-to-tail
     * @returns chains, possibly wrapped in a [[BagOfCurves]].
     */
    static collectChains(fragments: AnyCurve[], gapTolerance?: number): ChainTypes;
    /**
     * Find all intersections among curves in `curvesToCut` against the boundaries of `region` and return fragments
     * of `curvesToCut`.
     * * Break `curvesToCut` into parts inside, outside, and coincident.
     * @returns output object with all fragments split among `insideParts`, `outsideParts`, and `coincidentParts`
     */
    static splitPathsByRegionInOnOutXY(curvesToCut: AnyCurve | undefined, region: AnyRegion): {
        insideParts: AnyCurve[];
        outsideParts: AnyCurve[];
        coincidentParts: AnyCurve[];
    };
    /**
     * If `data` is one of several forms of a rectangle, return its edge Transform.
     * * Points are considered a rectangle if, within the first 4 points:
     *     * vectors from 0 to 1 and 0 to 3 are perpendicular and have a non-zero cross product
     *     * vectors from 0 to 3 and 1 to 2 are the same
     * @param data points in one of several formats:
     *   * LineString
     *   * Loop containing rectangle content
     *   * Path containing rectangle content
     *   * Array of Point3d[]
     *   * IndexedXYZCollection
     * @param requireClosurePoint whether to require a 5th point equal to the 1st point.
     * @returns Transform with origin at one corner, x and y columns extending along two adjacent sides, and unit
     * normal in z column. If not a rectangle, return undefined.
     */
    static rectangleEdgeTransform(data: AnyCurve | Point3d[] | IndexedXYZCollection, requireClosurePoint?: boolean): Transform | undefined;
    /**
     * Look for and simplify:
     * * Contiguous `LineSegment3d` and `LineString3d` objects.
     *   * collect all points
     *   * eliminate duplicated points
     *   * eliminate points colinear with surrounding points
     *   * contiguous concentric circular or elliptic arcs
     *   * combine angular ranges
     * * This function can be used to compress adjacent LineSegment3ds into a LineString3d
     * @param curves Path or loop (or larger collection containing paths and loops) to be simplified
     * @param options options for tolerance and selective simplification.
     */
    static consolidateAdjacentPrimitives(curves: CurveCollection, options?: ConsolidateAdjacentCurvePrimitivesOptions): void;
    /**
     * Reverse and reorder loops in the xy-plane for consistency and containment.
     * @param loops multiple loops in any order and orientation, z-coordinates ignored
     * @returns a region that captures the input pointers. This region is a:
     * * `Loop` if there is exactly one input loop. It is oriented counterclockwise.
     * * `ParityRegion` if input consists of exactly one outer loop with at least one hole loop.
     * Its first child is an outer loop oriented counterclockwise; all subsequent children are holes oriented
     * clockwise.
     * * `UnionRegion` if any other input configuration. Its children are individually ordered/oriented as in
     * the above cases.
     * @see [[PolygonOps.sortOuterAndHoleLoopsXY]]
     */
    static sortOuterAndHoleLoopsXY(loops: Array<Loop | IndexedXYZCollection>): AnyRegion;
    /**
     * Find all areas bounded by the unstructured, possibly intersecting curves.
     * * A common use case of this method is to assemble the bounding "exterior" loop (or loops) containing the
     * input curves.
     * * This method does not add bridge edges to connect outer loops to inner loops. Each disconnected loop,
     * regardless of its containment, is returned as its own SignedLoops object. Pre-process with [[regionBooleanXY]]
     * to add bridge edges so that [[constructAllXYRegionLoops]] will return outer and inner loops in the same
     * SignedLoops object.
     * @param curvesAndRegions Any collection of curves. Each Loop/ParityRegion/UnionRegion contributes its curve
     * primitives.
     * @param tolerance optional distance tolerance for coincidence
     * @returns array of [[SignedLoops]], each entry of which describes the faces in a single connected component:
     *    * `positiveAreaLoops` contains "interior" loops, _including holes in ParityRegion input_. These loops have
     * positive area and counterclockwise orientation.
     *    * `negativeAreaLoops` contains (probably just one) "exterior" loop which is ordered clockwise.
     *    * `slivers` contains sliver loops that have zero area, such as appear between coincident curves.
     *    * `edges` contains a [[LoopCurveLoopCurve]] object for each component edge, collecting both loops adjacent
     * to the edge and a constituent curve in each.
     */
    static constructAllXYRegionLoops(curvesAndRegions: AnyCurve | AnyCurve[], tolerance?: number): SignedLoops[];
    /**
     * Collect all `CurvePrimitives` in loosely typed input.
     * * Always recurses into primitives within explicit collections (Path, Loop, ParityRegion, UnionRegion).
     * * Optionally recurses into hidden primitives if `smallestPossiblePrimitives` is true.
     * @param candidates input curves
     * @param collectorArray optional pre-defined output array. If defined, it is NOT cleared: primitives are appended.
     * @param smallestPossiblePrimitives if true, recurse into the children of a [[CurveChainWithDistanceIndex]]. If
     * false, push the [[CurveChainWithDistanceIndex]] instead.
     * @param explodeLinestrings if true, push a [[LineSegment3d]] for each segment of a [[LineString3d]]. If false,
     * push the [[LineString3d]] instead.
     */
    static collectCurvePrimitives(candidates: AnyCurve | AnyCurve[], collectorArray?: CurvePrimitive[], smallestPossiblePrimitives?: boolean, explodeLinestrings?: boolean): CurvePrimitive[];
    /**
     * Copy primitive pointers from candidates to result array, replacing each [[LineString3d]] by newly constructed
     * instances of [[LineSegment3d]].
     * @param candidates input curves
     * @return copied (captured) inputs except for the linestrings, which are exploded
     */
    static expandLineStrings(candidates: CurvePrimitive[]): CurvePrimitive[];
    /**
     * Return the overall range of given curves.
     * @param data candidate curves
     * @param worldToLocal transform to apply to data before computing its range
     */
    static curveArrayRange(data: any, worldToLocal?: Transform): Range3d;
    /**
     * Triangulate a stroked Loop or ParityRegion and return the graph.
     * @param polygons polygons obtained by stroking a Loop or ParityRegion, z-coordinates ignored.
     * @returns triangulated graph
     */
    private static triangulateStrokedRegionComponent;
    /** Stroke a Loop or ParityRegion */
    private static strokeRegionComponent;
    /**
     * Triangulate a Loop or ParityRegion and return the graph.
     * @param component region, z-coordinates ignored
     * @param options how to stroke loops
     * @returns triangulated graph
     */
    private static triangulateRegionComponent;
    /**
     * Facet the region according to stroke options.
     * @param region a closed xy-planar region, possibly with holes.
     * * The z-coordinates of the region are ignored. Caller is responsible for rotating the region into plane local coordinates beforehand, and reversing the rotation afterwards.
     * * For best results, `UnionRegion` input should consist of non-overlapping children.
     * Caller can ensure this by passing in `region = RegionOps.regionBooleanXY(unionRegion, undefined, RegionBinaryOpType.Union)`.
     * * For best results, `ParityRegion` input should be correctly oriented (holes have opposite orientation to their containing loop).
     * Caller can ensure this for non-intersecting loops by passing in `region = RegionOps.sortOuterAndHoleLoopsXY(loops)`.
     * @param options primarily how to stroke the region boundary, but also how to facet the region interior.
     * * By default, a triangulation is returned, but if `options.maximizeConvexFacets === true`, edges between coplanar triangles are removed to return maximally convex facets.
     * @returns facets for the region, or undefined if facetting failed
     */
    static facetRegionXY(region: AnyRegion, options?: StrokeOptions): IndexedPolyface | undefined;
    /**
     * Decompose a polygon with optional holes into an array of convex polygons.
     * @param polygon polygon and hole loops, e.g., as returned by [[CurveCollection.cloneStroked]] on a Loop or ParityRegion. All z-coordinates are ignored.
     * @param maximize whether to return maximally convex polygons. If false, triangles are returned.
     * @returns array of convex polygons, or undefined if triangulation failed
     */
    static convexDecomposePolygonXY(polygon: MultiLineStringDataVariant, maximize?: boolean): GrowableXYZArray[] | undefined;
}
/**
 * * Options to control method `RegionOps.consolidateAdjacentPrimitives`
 * @public
 */
export declare class ConsolidateAdjacentCurvePrimitivesOptions {
    /** True to consolidated linear geometry   (e.g. separate LineSegment3d and LineString3d) into LineString3d */
    consolidateLinearGeometry: boolean;
    /** True to consolidate contiguous arcs */
    consolidateCompatibleArcs: boolean;
    /** Tolerance for collapsing identical points */
    duplicatePointTolerance: number;
    /** Tolerance for removing interior colinear points. */
    colinearPointTolerance: number;
}
