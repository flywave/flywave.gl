import { type CurveCollection, BagOfCurves } from "../curve/curve-collection";
import { type LinearCurvePrimitive } from "../curve/curve-primitive";
import { LineSegment3d } from "../curve/line-segment3d";
import { LineString3d } from "../curve/line-string3d";
import { Loop } from "../curve/loop";
import { Angle } from "../geometry3d/angle";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Ray3d } from "../geometry3d/ray3d";
import { Matrix4d } from "../geometry4d/matrix4d";
import { MomentData } from "../geometry4d/moment-data";
import { type HalfEdgeGraph } from "../topology/graph";
import { type FacetIntersectOptions, type FacetLocationDetail } from "./facet-location-detail";
import { type SortableEdgeCluster, IndexedEdgeMatcher } from "./indexed-edge-matcher";
import { type Range2dSearchInterface } from "./multiclip/range2d-search-interface";
import { type IndexedPolyface, type PolyfaceVisitor, Polyface } from "./polyface";
import { RangeLengthData } from "./range-length-data";
/**
 * Options carrier for sweeping linework onto meshes.
 * * The create method initializes all options.
 * @public
 */
export declare class SweepLineStringToFacetsOptions {
    /** vector "towards the eye"
     * * In the common case of sweeping to an XY (e.g. ground or DTM) mesh,
     *    use the positive Z vector as an up vector.
     * * In general case, this is a vector from the mesh towards an eye at infinity.
     */
    vectorToEye: Vector3d;
    /** true to collect edges from facets that face towards the eye */
    collectOnForwardFacets: boolean;
    /** true to collect facets that are "on the side", i.e. their outward vector is perpendicular to vectorToEye. */
    collectOnSideFacets: boolean;
    /** true to collect facets that face away from the eye */
    collectOnRearFacets: boolean;
    /** (small) angle to use as tolerance for deciding if a facet is "on the side".  Default (if given in degrees) is Geometry.smallAngleDegrees */
    sideAngle: Angle;
    /** option to assemble lines into chains */
    assembleChains: boolean;
    /** constructor -- captures fully-checked parameters from static create method.
     */
    private constructor();
    /** Create an options structure.
     * * Default vectorToEye is positive Z
     * * Default sideAngle has radians value Geometry.smallAngleRadians
     * * Default assembleChains is true
     * * Default collectOnForwardFacets, collectOnSideFacets, collectOnRearFacets are all true.
     */
    static create(vectorToEye?: Vector3d, sideAngle?: Angle, assembleChains?: boolean, collectOnForwardFacets?: boolean, collectOnSideFacets?: boolean, collectOnRearFacets?: boolean): SweepLineStringToFacetsOptions;
    /** Return true if all outputs are requested */
    get collectAll(): boolean;
    /** Decide if the instance flags accept this facet.
     * * Facets whose facet normal have positive, zero, or negative dot product with the vectorToEye are forward, side, and rear.
     * * Undefined facet normal returns false
     */
    collectFromThisFacetNormal(facetNormal: Vector3d | undefined): boolean;
}
/**
 * Options carrier for cloneWithHolesFilled
 * @public
 */
export interface HoleFillOptions {
    /** REJECT hole candidates if its boundary chain is longer than this limit. */
    maxPerimeter?: number;
    /** REJECT hole candidates if they have more than this number of edges */
    maxEdgesAroundHole?: number;
    /** REJECT hole candidates if their orientation is not COUNTERCLOCKWISE around this vector.
     * * For instance, use an upward Z vector for a DTM whose facets face upward.  This suppresses incorrectly treating the outer boundary as a hole.
     */
    upVector?: Vector3d;
    /** requests that all content from the original mesh be copied to the mesh with filled holes. */
    includeOriginalMesh?: boolean;
}
/**  Selective output options for PolyfaceQuery.cloneOffset:
 *  * undefined means the usual facets in the expected offset mesh.
 *  * if present as a json object, the various booleans select respective outputs.
 *  * @public
 */
export interface OffsetMeshSelectiveOutputOptions {
    outputOffsetsFromFacesBeforeChamfers?: boolean;
    outputOffsetsFromFaces?: boolean;
    outputOffsetsFromEdges?: boolean;
    outputOffsetsFromVertices?: boolean;
}
/**
 * Options carrier for [[PolyfaceQuery.cloneOffset]].
 * * Default options are strongly recommended.
 * * The option most likely to be changed is chamferTurnAngle
 * @public
 */
export declare class OffsetMeshOptions {
    /** max angle between normals to be considered smooth */
    smoothSingleAngleBetweenNormals: Angle;
    /** max accumulation of angle between normals to be considered smooth */
    smoothAccumulatedAngleBetweenNormals: Angle;
    /** When crossing an edge, this turn angle (typically 120 degrees) triggers a chamfer */
    chamferAngleBetweenNormals: Angle;
    /** optional control structure for selective output.
     * * If undefined, output all expected offset facets.
     */
    outputSelector?: OffsetMeshSelectiveOutputOptions;
    /** Constructor -- CAPTURE parameters ... */
    private constructor();
    /** construct and return an OffsetMeshOptions with given parameters.
     * * Angles are forced to minimum values.
     * * Clones of the angles are given to the constructor.
     * @param smoothSingleRadiansBetweenNormals an angle larger than this (between facets) is considered a sharp edge
     * @param smoothAccumulatedAngleBetweenNormals angles that sum to this much may be consolidated for average normal
     * @param chamferTurnAngleBetweenNormals when facets meet with larger angle, a chamfer edge may be added if the angle between facet normals is larger than this.
     */
    static create(smoothSingleAngleBetweenNormals?: Angle, smoothAccumulatedAngleBetweenNormals?: Angle, chamferTurnAngleBetweenNormals?: Angle): OffsetMeshOptions;
}
/**
 * Structure to return multiple results from volume between facets and plane
 * @public
 */
export interface FacetProjectedVolumeSums {
    /** Summed (signed) volume */
    volume: number;
    /** summed area moments for positive contributions */
    positiveProjectedFacetAreaMoments?: MomentData;
    /** summed area moments for negative contributions */
    negativeProjectedFacetAreaMoments?: MomentData;
}
/**
 * Enumeration of cases for retaining facets among duplicates
 * @public
 */
export declare enum DuplicateFacetClusterSelector {
    /** retain none of the duplicates */
    SelectNone = 0,
    /** retain any one member among duplicates */
    SelectAny = 1,
    /** retain all members among duplicates */
    SelectAll = 2,
    /** retain one from any cluster with an odd number of faces */
    SelectOneByParity = 3
}
/** PolyfaceQuery is a static class whose methods implement queries on a polyface or polyface visitor provided as a parameter to each method.
 * @public
 */
export declare class PolyfaceQuery {
    /** copy the points from a visitor into a Linestring3d in a Loop object */
    static visitorToLoop(visitor: PolyfaceVisitor): Loop;
    /** Create a linestring loop for each facet of the polyface. */
    static indexedPolyfaceToLoops(polyface: Polyface): BagOfCurves;
    /** Return the sum of all facet areas.
     * @param vectorToEye compute sum of *signed* facet areas projected to a view plane perpendicular to this vector
     */
    static sumFacetAreas(source: Polyface | PolyfaceVisitor | undefined, vectorToEye?: Vector3d): number;
    /** sum volumes of tetrahedra from origin to all facets.
     * * if origin is omitted, the first point encountered (by the visitor) is used as origin.
     * * If the mesh is closed, this sum is the volume.
     * * If the mesh is not closed, this sum is the volume of a mesh with various additional facets
     * from the origin to facets.
     */
    static sumTetrahedralVolumes(source: Polyface | PolyfaceVisitor, origin?: Point3d): number;
    /** sum (signed) volumes between facets and a plane.
     * Return a structure with multiple sums:
     * * volume = the sum of (signed) volumes between facets and the plane.
     * * positiveAreaMomentData, negativeProjectedFacetAreaMoments = moment data with centroid, area, and second moments with respect to the centroid.
     *
     */
    static sumVolumeBetweenFacetsAndPlane(source: Polyface | PolyfaceVisitor, plane: Plane3dByOriginAndUnitNormal): FacetProjectedVolumeSums;
    /** Return the inertia products [xx,xy,xz,xw, yw, etc] integrated over all all facets, as viewed from origin. */
    static sumFacetSecondAreaMomentProducts(source: Polyface | PolyfaceVisitor, origin: Point3d): Matrix4d;
    /** Return the inertia products [xx,xy,xz,xw, yw, etc] integrated over all tetrahedral volumes from origin */
    static sumFacetSecondVolumeMomentProducts(source: Polyface | PolyfaceVisitor, origin: Point3d): Matrix4d;
    /** Compute area moments for the mesh. In the returned MomentData:
     * * origin is the centroid.
     * * localToWorldMap has the origin and principal directions
     * * radiiOfGyration radii for rotation around the x,y,z axes.
     */
    static computePrincipalAreaMoments(source: Polyface): MomentData | undefined;
    /** Compute area moments for the mesh. In the returned MomentData:
     * * origin is the centroid.
     * * localToWorldMap has the origin and principal directions
     * * radiiOfGyration radii for rotation around the x,y,z axes.
     * * The result is only valid if the mesh is closed.
     * * There is no test for closure.  Use `PolyfaceQuery.isPolyfaceClosedByEdgePairing(polyface)` to test for closure.
     */
    static computePrincipalVolumeMoments(source: Polyface): MomentData | undefined;
    /**
     * Test for convex volume by dihedral angle tests on all edges.
     * * This tests if all dihedral angles are positive.
     * * In a closed solid, this is a strong test for overall convexity.
     * * With `ignoreBoundaries` true, this may be a useful test when all the facets are in a single edge-connected component, such as a pyramid with no underside.
     * * It is not a correct test if there are multiple, disjoint components.
     *   * Take the above-mentioned pyramid with no underside.
     *   * Within the same mesh, have a second pyramid placed to the side, still facing upward.
     *   * The angles will pass the dihedral convexity test, but the composite thing surely is not convex.
     * @param source mesh to examine
     * @param ignoreBoundaries if true, ignore simple boundary edges, i.e. allow unclosed meshes.
     * @returns true if the mesh is closed and has all dihedral angles (angle across edge) positive
     */
    static isConvexByDihedralAngleCount(source: Polyface, ignoreBoundaries?: boolean): boolean;
    /**
     * Compute a number summarizing the dihedral angles in the mesh.
     * @see [[isConvexByDihedralAngleCount]] for comments about ignoreBoundaries===true when there are multiple connected components.
     * @param source mesh to examine
     * @param ignoreBoundaries if true, ignore simple boundary edges, i.e. allow unclosed meshes.
     * @returns a number summarizing the dihedral angles in the mesh.
     *   * Return 1 if all angles are positive or planar.  The mesh is probably convex with outward normals.
     *   * Return -1 if all angles are negative or planar.  The mesh is probably convex with inward normals.
     *   * Return 0 if
     *     * angles area mixed
     *     * any edge has other than 1 incident facet or more than 2 incident facets.
     *     * (but null edges are permitted -- These occur naturally at edges of quads at north or south pole)
     */
    static dihedralAngleSummary(source: Polyface, ignoreBoundaries?: boolean): number;
    /**
     * Test if the facets in `source` occur in perfectly mated pairs, as is required for a closed manifold volume.
     */
    static isPolyfaceClosedByEdgePairing(source: Polyface): boolean;
    /** Test edges pairing in `source` mesh.
     * * for `allowSimpleBoundaries === false` true return means this is a closed 2-manifold surface
     * * for `allowSimpleBoundaries === true` true means this is a 2-manifold surface which may have boundary, but is still properly matched internally.
     * * Any edge with 3 or more incident facets triggers `false` return.
     * * Any edge with 2 incident facets in the same direction triggers a `false` return.
     */
    static isPolyfaceManifold(source: Polyface, allowSimpleBoundaries?: boolean): boolean;
    /**
     * construct a CurveCollection containing boundary edges.
     *   * each edge is a LineSegment3d
     * @param source polyface or visitor
     * @param includeDanglers true to in include typical boundary edges with a single incident facet
     * @param includeMismatch true to include edges with more than 2 incident facets
     * @param includeNull true to include edges with identical start and end vertex indices.
     * @returns
     */
    static boundaryEdges(source: Polyface | PolyfaceVisitor | undefined, includeDanglers?: boolean, includeMismatch?: boolean, includeNull?: boolean): CurveCollection | undefined;
    /**
     * Test if the facets in `source` occur in perfectly mated pairs, as is required for a closed manifold volume.
     * If not, extract the boundary edges as lines.
     * @param source polyface or visitor
     * @param announceEdge function to be called with each boundary edge. The announcement is start and end points, start and end indices, and facet index.
     * @param includeTypical true to announce typical boundary edges with a single incident facet
     * @param includeMismatch true to announce edges with more than 2 incident facets
     * @param includeNull true to announce edges with identical start and end vertex indices.
     */
    static announceBoundaryEdges(source: Polyface | PolyfaceVisitor | undefined, announceEdge: (pointA: Point3d, pointB: Point3d, indexA: number, indexB: number, facetIndex: number) => void, includeTypical?: boolean, includeMismatch?: boolean, includeNull?: boolean): void;
    /** Find segments (within the linestring) which project to facets.
     * * Announce each pair of linestring segment and on-facet segment through a callback.
     * * Facets are ASSUMED to be convex and planar, and not overlap in the z direction.
     */
    static announceSweepLinestringToConvexPolyfaceXY(linestringPoints: GrowableXYZArray, polyface: Polyface, announce: AnnounceDrapePanel): any;
    /** Execute context.projectToPolygon until its work estimates accumulate to workLimit  */
    private static continueAnnounceSweepLinestringToConvexPolyfaceXY;
    private static _asyncWorkLimit;
    /** Set the limit on work during an async time blocks, and return the old value.
     * * This should be a large number -- default is 1.0e6
     * @internal
     */
    static setAsyncWorkLimit(value: number): number;
    /** Query the current limit on work during an async time block.
     * @internal
     */
    static get asyncWorkLimit(): number;
    /** Number of "await" steps executed in recent async calls.
     * @internal
     */
    static awaitBlockCount: number;
    /** Find segments (within the linestring) which project to facets.
     * * Announce each pair of linestring segment and on-facet segment through a callback.
     * * Facets are ASSUMED to be convex and planar, and not overlap in the z direction.
     * * REMARK: Although this is public, the usual use is via slightly higher level public methods, viz:
     *   * asyncSweepLinestringToFacetsXYReturnChains
     * @internal
     */
    static asyncAnnounceSweepLinestringToConvexPolyfaceXY(linestringPoints: GrowableXYZArray, polyface: Polyface, announce: AnnounceDrapePanel): Promise<number>;
    /** Search the facets for facet subsets that are connected with at least vertex contact.
     * * Return array of arrays of facet indices.
     */
    static partitionFacetIndicesByVertexConnectedComponent(polyface: Polyface | PolyfaceVisitor): number[][];
    /**
     * * Examine the normal orientation for each faces.
     * * Separate to 3 partitions:
     *    * facets with normal in the positive direction of the vectorToEye (partition 0)
     *    * facets with normal in the negative direction of the vectorToEye (partition 1)
     *    * facets nearly perpendicular to the view vector  (partition 2)
     * * Return array of arrays of facet indices.
     */
    static partitionFacetIndicesByVisibilityVector(polyface: Polyface | PolyfaceVisitor, vectorToEye: Vector3d, sideAngleTolerance: Angle): number[][];
    /**
     * Return the boundary of facets that are facing the eye.
     * @param polyface
     * @param visibilitySubset selector among the visible facet sets extracted by partitionFacetIndicesByVisibilityVector
     *   * 0 ==> forward facing
     *   * 1 ==> rear facing
     *   * 2 ==> side facing
     * @param vectorToEye
     * @param sideAngleTolerance
     */
    static boundaryOfVisibleSubset(polyface: IndexedPolyface, visibilitySelect: 0 | 1 | 2, vectorToEye: Vector3d, sideAngleTolerance?: Angle): CurveCollection | undefined;
    /**
     * Search for edges with only 1 incident facet.
     * * chain them into loops
     * * emit the loops to the announceLoop function
     * @param mesh
     */
    static announceBoundaryChainsAsLineString3d(mesh: Polyface | PolyfaceVisitor, announceLoop: (points: LineString3d) => void): void;
    /**
     * Return a mesh with
     *  * clusters of adjacent, coplanar facets merged into larger facets.
     *  * other facets included unchanged.
     * @param mesh existing mesh or visitor
     * @param maxSmoothEdgeAngle maximum dihedral angle across an edge between facets deemed coplanar. If undefined, uses `Geometry.smallAngleRadians`.
     * @returns
     */
    static cloneWithMaximalPlanarFacets(mesh: Polyface | PolyfaceVisitor, maxSmoothEdgeAngle?: Angle): IndexedPolyface | undefined;
    /**
     * Return a mesh with "some" holes filled in with new facets.
     *  * Candidate chains are computed by [[announceBoundaryChainsAsLineString3d]].
     *  * Unclosed chains are rejected.
     *  * Closed chains are triangulated and returned as a mesh.
     *  * The options structure enforces restrictions on how complicated the hole filling can be:
     *     * maxEdgesAroundHole -- holes with more edges are skipped
     *     * maxPerimeter -- holes with larger summed edge lengths are skipped.
     *     * upVector -- holes that do not have positive area along this view are skipped.
     *     * includeOriginalMesh -- includes the original mesh in the output mesh, so the composite mesh is a clone with holes filled
     * @param mesh existing mesh
     * @param options options controlling the hole fill.
     * @param unfilledChains optional array to receive the points around holes that were not filled.
     * @returns
     */
    static fillSimpleHoles(mesh: Polyface | PolyfaceVisitor, options: HoleFillOptions, unfilledChains?: LineString3d[]): IndexedPolyface | undefined;
    /** Clone the facets in each partition to a separate polyface.
     *
     */
    static clonePartitions(polyface: Polyface | PolyfaceVisitor, partitions: number[][]): Polyface[];
    /** Clone facets that pass a filter function */
    static cloneFiltered(source: Polyface | PolyfaceVisitor, filter: (visitor: PolyfaceVisitor) => boolean): IndexedPolyface;
    /** Clone the facets with in-facet dangling edges removed. */
    static cloneWithDanglingEdgesRemoved(source: Polyface | PolyfaceVisitor): IndexedPolyface;
    /** If the visitor's client is a polyface, simply return its point array length.
     * If not a polyface, visit all facets to find the largest index.
     */
    static visitorClientPointCount(visitor: PolyfaceVisitor): number;
    /** If the visitor's client is a polyface, simply return its facet count.
     * If not a polyface, visit all facets to accumulate a count.
     */
    static visitorClientFacetCount(visitor: PolyfaceVisitor): number;
    /** Partition the facet set into connected components such that two adjacent facets are in the same component if and only if they are adjacent across a clustered edge.
     * @param edgeClusters sorted and clustered edges (cf. `IndexedEdgeMatcher.sortAndCollectClusters`).
     * @param numFacets facet count in the parent mesh. In particular, `edge.facetIndex < numFacets` for every input edge.
     * @return collection of facet index arrays, one array per connected component
     */
    private static partitionFacetIndicesBySortableEdgeClusters;
    /** Partition the facet set into connected components. Each facet in a given component shares an edge only with other facets in the component (or is a boundary edge).
     * @param polyface facets to partition
     * @param stopAtVisibleEdges whether to further split connected components by visible edges of the polyface
     * @return collection of facet index arrays, one per connected component
     */
    static partitionFacetIndicesByEdgeConnectedComponent(polyface: Polyface | PolyfaceVisitor, stopAtVisibleEdges?: boolean): number[][];
    /** Find segments (within the line string) which project to facets.
     * * Assemble each input segment paired with its projected segment/point as a quad/triangle facet in a new polyface.
     * * Input facets are ASSUMED to be convex and planar, and not overlap in the z direction.
     */
    static sweepLineStringToFacetsXYReturnSweptFacets(lineStringPoints: GrowableXYZArray, polyface: Polyface): Polyface;
    /** @deprecated in 4.x. Use sweepLineStringToFacetsXYReturnSweptFacets instead. */
    static sweepLinestringToFacetsXYreturnSweptFacets(linestringPoints: GrowableXYZArray, polyface: Polyface): Polyface;
    /**
     * Sweep the line string to intersections with a mesh.
     * * Return collected line segments.
     * * If no options are given, the default sweep direction is the z-axis, and chains are assembled and returned.
     * * See [[SweepLineStringToFacetsOptions]] for input and output options, including filtering by forward/side/rear facets.
     * * Facets are ASSUMED to be convex and planar, and not overlap in the sweep direction.
     */
    static sweepLineStringToFacets(linestringPoints: GrowableXYZArray, polyfaceOrVisitor: Polyface | PolyfaceVisitor, options?: SweepLineStringToFacetsOptions): LinearCurvePrimitive[];
    /**
     * Sweep the line string in the z-direction to intersections with a mesh, using a search object for speedup.
     * @param lineStringPoints input line string to drape on the mesh
     * @param polyfaceOrVisitor mesh, or mesh visitor to traverse only part of a mesh
     * @param searchByReadIndex object for searching facet 2D ranges tagged by mesh read index
     * @example Using a 5x5 indexed search grid:
     * ```
     * const xyRange = Range2d.createFrom(myPolyface.range());
     * const searcher = GriddedRaggedRange2dSetWithOverflow.create<number>(xyRange, 5, 5)!;
     * for (const visitor = myPolyface.createVisitor(0); visitor.moveToNextFacet();) {
     *   searcher.addRange(visitor.point.getRange(), visitor.currentReadIndex());
     * }
     * const drapedLineStrings = PolyfaceQuery.sweepLineStringToFacetsXY(lineString, myPolyface, searcher);
     * ```
     * @returns collected line strings
     */
    static sweepLineStringToFacetsXY(lineStringPoints: GrowableXYZArray | Point3d[], polyfaceOrVisitor: Polyface | PolyfaceVisitor, searchByReadIndex: Range2dSearchInterface<number>): LineString3d[];
    /** Find segments (within the linestring) which project to facets.
     * * Return collected line segments.
     * * This calls [[sweepLineStringToFacets]] with options created by
     *   `const options = SweepLineStringToFacetsOptions.create(Vector3d.unitZ(), Angle.createSmallAngle(),false, true, true, true);`
     * @deprecated in 4.x. Use [[sweepLineStringToFacets]] to get further options.
     */
    static sweepLinestringToFacetsXYReturnLines(linestringPoints: GrowableXYZArray, polyface: Polyface): LineSegment3d[];
    /** Find segments (within the linestring) which project to facets.
     * * Return chains.
     * * This calls [[sweepLineStringToFacets]] with options created by
     *   `const options = SweepLineStringToFacetsOptions.create(Vector3d.unitZ(), Angle.createSmallAngle(),true, true, true, true);`
     * @deprecated in 4.x. Use [[sweepLineStringToFacets]] to get further options.
     */
    static sweepLinestringToFacetsXYReturnChains(linestringPoints: GrowableXYZArray, polyface: Polyface): LineString3d[];
    /** Find segments (within the linestring) which project to facets.
     * * This is done as a sequence of "await" steps.
     * * Each "await" step deals with approximately PolyfaceQuery.asyncWorkLimit pairings of (linestring edge) with (facet edge)
     * * PolyfaceQuery.setAsyncWorkLimit() to change work blocks from default
     * * Return chains.
     * * Facets are ASSUMED to be convex and planar, and not overlap in the z direction.
     */
    static asyncSweepLinestringToFacetsXYReturnChains(linestringPoints: GrowableXYZArray, polyface: Polyface): Promise<LineString3d[]>;
    /**
     * * Examine ranges of facets.
     * * Return statistical summary of x,y,z ranges.
     */
    static collectRangeLengthData(polyface: Polyface | PolyfaceVisitor): RangeLengthData;
    /** Clone the facets, inserting vertices (within edges) where points not part of each facet's vertex indices impinge within edges.
     *
     */
    static cloneWithTVertexFixup(polyface: Polyface): IndexedPolyface;
    /**
     * * Each array input structure is: [facetIndex, vertexIndex0, vertexIndex1, ....]
     * * Vertex indices assumed reversed so it
     *   * vertexIndex0 is the lowest index on the facet
     *   * vertexIndex1 is the lowest neighbor of vertex0
     *   * first different entry among vertex indices determines lexical result.
     *   * Hence facets with duplicate indices (whether forward or reversed) are considered equal.
     * @param arrayA
     * @param arrayB
     */
    private static compareFacetIndexAndVertexIndices;
    /**
     * * Return an array of arrays describing facet duplication.
     * @param includeSingletons if true, non-duplicated facets are included in the output.
     * * Each array `entry` in the output contains read indices of a cluster of facets with the same vertex indices.
     */
    static collectDuplicateFacetIndices(polyface: Polyface, includeSingletons?: boolean): number[][];
    /**
     * * Return an array of arrays describing facet duplication.
     * @param includeSingletons if true, non-duplicated facets are included in the output.
     * * Each array `entry` in the output contains read indices of a cluster of facets with the same vertex indices.
     */
    static announceDuplicateFacetIndices(polyface: Polyface, announceCluster: (clusterFacetIndices: number[]) => void): void;
    /** Return a new facet set with a subset of facets in source
     * @param includeSingletons true to copy facets that only appear once
     * @param clusterSelector indicates whether duplicate clusters are to have 0, 1, or all facets included
     */
    static cloneByFacetDuplication(source: Polyface, includeSingletons: boolean, clusterSelector: DuplicateFacetClusterSelector): Polyface;
    /** Clone the facets, inserting removing points that are simply within colinear edges.
     *
     */
    static cloneWithColinearEdgeFixup(polyface: Polyface): Polyface;
    /**
     * Set the edge visibility for specified edges in the polyface.
     * @param polyface mesh to be edited
     * @param clusters array of edge references
     * @param value visibility value (true or false)
     */
    private static setEdgeVisibility;
    /**
     * Set the visibility of a particular edge of a particular facet.
     * @param polyface containing polyface
     * @param facetIndex facet index
     * @param vertexIndex vertex index (in vertex array) at which the edge starts
     * @param value visibility value.
     */
    static setSingleEdgeVisibility(polyface: IndexedPolyface, facetIndex: number, vertexIndex: number, value: boolean): void;
    /**
     * Get the visibility of a particular edge of a particular facet.
     * @param polyface containing polyface
     * @param facetIndex facet index
     * @param vertexIndex vertex index (in vertex array) at which the edge starts
     */
    static getSingleEdgeVisibility(polyface: IndexedPolyface, facetIndex: number, vertexIndex: number): boolean | undefined;
    /** Load all half edges from a mesh to an IndexedEdgeMatcher.
     * @param polyface a mesh, or a visitor assumed to have numWrap === 1
     */
    static createIndexedEdges(polyface: Polyface | PolyfaceVisitor): IndexedEdgeMatcher;
    /**
     * Return manifold edge pairs whose dihedral angle is bounded by the given angle.
     * * The dihedral angle of a manifold edge is measured between the normals of its two adjacent faces.
     * * Boundary edges are not returned as they are not manifold.
     * @param mesh existing polyface or visitor
     * @param maxSmoothEdgeAngle maximum dihedral angle of a smooth edge. If undefined, uses `Geometry.smallAngleRadians`.
     * @param sharpEdges true to reverse the angle threshold test and return sharp edges; otherwise return smooth edges (default)
     */
    static collectEdgesByDihedralAngle(mesh: Polyface | PolyfaceVisitor, maxSmoothEdgeAngle?: Angle, sharpEdges?: boolean): SortableEdgeCluster[];
    /**
     * * Find mated pairs among facet edges.
     * * Mated pairs have the same vertex indices appearing in opposite order.
     * * Mark all non-mated pairs visible.
     * * At mated pairs
     *    * if angle across the edge is larger than `sharpEdgeAngle`, mark visible
     *    * otherwise mark invisible.
     * @param mesh mesh to be marked
     */
    static markPairedEdgesInvisible(mesh: IndexedPolyface, sharpEdgeAngle?: Angle): void;
    /** Try to compute a unit normal for a facet accessible through a visitor.
     * * Unit normal is computed by `PolygonOps.unitNormal` with the points around the facet.
     */
    static computeFacetUnitNormal(visitor: PolyfaceVisitor, facetIndex: number, result?: Vector3d): Vector3d | undefined;
    /**
     * * Mark all edge visibilities in the IndexedPolyface
     * @param mesh mesh to be marked
     * @param value true for visible, false for hidden
     */
    static markAllEdgeVisibility(mesh: IndexedPolyface, value: boolean): void;
    /**
     * Create a HalfEdgeGraph with a face for each facet of the IndexedPolyface
     * @param mesh mesh to convert
     * @internal
     */
    static convertToHalfEdgeGraph(mesh: IndexedPolyface): HalfEdgeGraph;
    /**
     * * Examine adjacent facet orientations throughout the mesh
     * * If possible, reverse a subset to achieve proper pairing.
     * @param mesh
     */
    static reorientVertexOrderAroundFacetsForConsistentOrientation(mesh: IndexedPolyface): boolean;
    /**
     * Set up indexed normals with one normal in the plane of each facet of the mesh.
     * @param polyface
     */
    static buildPerFaceNormals(polyface: IndexedPolyface): void;
    /**
     * * At each vertex of the mesh
     *   * Find clusters of almost parallel normals
     *   * Compute simple average of those normals
     *   * Index to the averages
     * * For typical meshes, this correctly clusters adjacent normals.
     * * One can imagine a vertex with multiple "smooth cone-like" sets of incident facets such that averaging occurs among two nonadjacent cones.  But this does not seem to be a problem in practice.
     * @param polyface polyface to update.
     * @param toleranceAngle averaging is done between normals up to this angle.
     */
    static buildAverageNormals(polyface: IndexedPolyface, toleranceAngle?: Angle): void;
    /**
     * Offset the faces of the mesh.
     * @param source original mesh
     * @param signedOffsetDistance distance to offset
     * @param offsetOptions angle options.  The default options are recommended.
     * @returns shifted mesh.
     */
    static cloneOffset(source: IndexedPolyface, signedOffsetDistance: number, offsetOptions?: OffsetMeshOptions): IndexedPolyface;
    private static _workTriangle?;
    private static _workTriDetail?;
    private static _workPolyDetail?;
    private static _workFacetDetail3?;
    private static _workFacetDetailC?;
    private static _workFacetDetailNC?;
    /** Search facets for the first one that intersects the infinite line.
     * * To process _all_ intersections, callers can supply an `options.acceptIntersection` callback that always returns false.
     * In this case, `intersectRay3d` will return undefined, but the callback will be invoked for each intersection.
     * * Example callback logic:
     *    * Accept the first found facet that intersects the half-line specified by the ray: `return detail.a >= 0.0;`
     *    * Collect all intersections: `myIntersections.push(detail.clone()); return false;` Then after `intersectRay3d` returns, sort along `ray` with `myIntersections.sort((d0, d1) => d0.a - d1.a);`
     * @param visitor facet iterator
     * @param ray infinite line parameterized as a ray. The returned `detail.a` is the intersection parameter on the ray, e.g., zero at `ray.origin` and increasing in `ray.direction`.
     * @param options options for computing and populating an intersection detail, and an optional callback for accepting one
     * @return detail for the (accepted) intersection with `detail.IsInsideOrOn === true`, or `undefined` if no (accepted) intersection
     * @see PolygonOps.intersectRay3d
     */
    static intersectRay3d(visitor: Polyface | PolyfaceVisitor, ray: Ray3d, options?: FacetIntersectOptions): FacetLocationDetail | undefined;
}
/** Announce the points on a drape panel.
 * * The first two points in the array are always along the draped line segment.
 * * The last two are always on the facet.
 * * If there are 4 points, those two pairs are distinct, i.e. both segment points are to the same side of the facet.
 * * If there are 3 points, those two pairs share an on-facet point.
 * * The panel is ordered so the outward normal is to the right of the draped segment.
 * @param indexAOnFacet index (in points) of the point that is the first facet point for moving forward along the linestring
 * @param indexBOnFacet index (in points) of the point that is the second facet point for moving forward along the linestring
 * @public
 */
export type AnnounceDrapePanel = (linestring: GrowableXYZArray, segmentIndex: number, polyface: Polyface, facetIndex: number, points: Point3d[], indexAOnFacet: number, indexBOnFacet: number) => any;
