import { GrowableXYZArray } from "../../geometry3d/growable-xyz-array";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { Ray3d } from "../../geometry3d/ray3d";
import { type XYAndZ } from "../../geometry3d/xyz-props";
import { type HalfEdgeGraph, HalfEdge, HalfEdgeMask } from "../../topology/graph";
import { type IndexedPolyface } from "../polyface";
import { type PolyfaceBuilder } from "../polyface-builder";
import { type OffsetMeshOptions } from "../polyface-query";
/**
 * Function to be called for debugging observations at key times during offset computation.
 */
type FacetOffsetGraphDebugFunction = (message: string, Graph: HalfEdgeGraph, breakMaskA: HalfEdgeMask, breakMaskB: HalfEdgeMask) => void;
type FacetOffsetDebugString = (message: string) => void;
export declare class FacetOffsetProperties {
    constructor(facetIndex: number, normal: Ray3d);
    facetIndex: number;
    facetNormal: Ray3d;
}
/**
 * Sector properties during offset.
 * * this.normal may be initially assigned as the facet normal but can mutate by
 *     averaging with neighbors.
 * * this.xyz is initially the base mesh xyz but is expected to move along the normal.
 * * this.count is used locally in computations.
 */
export declare class SectorOffsetProperties {
    constructor(normal: Vector3d, xyz: Point3d);
    normal: Vector3d;
    xyz: Point3d;
    count: number;
    /**
     * Compute the angle between plane normals on opposite sides of the edge.
     * * parallel normals have zero angle.
     * * if the edge cuts inward to the volume behind the faces, the angle is negative.
     * * if the edge is outward (a convex edge) the the volume, the angle is positive.
     * @param edgeNodeA node on one side of the edge
     * @param edgeVector pre-allocated vector to receive vector along edge.
     * @param averageNormal pre-allocated vector to receive the average normal for a chamfer of the offset edge.
     * @param offsetDistance distance of offset being constructed.  The sign of this resolves angle ambiguity.
     * @param radiansTolerance tolerance for large angle between normals.
     * @returns true if this edge has SectorOffsetProperties on both sides and the angle between normals angle exceeds radiansTolerance.
     */
    static edgeHasLargeExteriorAngleBetweenNormals(edgeNodeA: HalfEdge, edgeVector: Vector3d, averageNormal: Vector3d, offsetDistance: number, radiansTolerance?: number): boolean;
    static almostEqualNormals(sectorA: SectorOffsetProperties, sectorB: SectorOffsetProperties, radiansTolerance?: number): boolean;
    static radiansBetweenNormals(sectorA: SectorOffsetProperties, sectorB: SectorOffsetProperties): number;
    setOffsetPointAtDistanceAtHalfEdge(halfEdge: HalfEdge, distance: number): void;
    static setXYZAtHalfEdge(halfEdge: HalfEdge, xyz: Vector3d | undefined): void;
    setXYAndZ(xyz: XYAndZ): void;
    static setNormalAtHalfEdge(halfEdge: HalfEdge, uvw: Vector3d, distance?: number): void;
    static sweepRadiansAroundNormal(nodeA: HalfEdge, upVector: Vector3d): number | undefined;
    static getSectorPointAtHalfEdge(halfEdge: HalfEdge, xyz: Point3d | undefined, xyzArray: GrowableXYZArray | undefined): boolean;
    static pushXYZ(xyzArray: GrowableXYZArray, halfEdge: HalfEdge): SectorOffsetProperties;
    static accumulateScaledNormalAtHalfEdge(halfEdge: HalfEdge, scale: number, accumulatingVector: Vector3d): void;
}
export declare class OffsetMeshContext {
    private constructor();
    private readonly _basePolyface;
    private readonly _baseGraph;
    /** "Exterior" side of a bare edge of the mesh */
    get exteriorMask(): HalfEdgeMask;
    private readonly _exteriorMask;
    /** Mask indicating a a sector's coordinates have been reassigned at offset distance. */
    private readonly _offsetCoordinatesReassigned;
    /** "First" sector of a smooth sequence. */
    get breakMaskA(): HalfEdgeMask;
    private readonly _breakMaskA;
    /** "Last" sector of a smooth sequence. */
    get breakMaskB(): HalfEdgeMask;
    private readonly _breakMaskB;
    /** This edge is on a chamfered face, and along the original edge */
    get insideOfChamferFace(): HalfEdgeMask;
    private readonly _insideOfChamferFace;
    /** This is the original edge of a chamfer face */
    get outsideOfChamferFace(): HalfEdgeMask;
    private readonly _outsideOfChamferFace;
    /** This edge is on a chamfered face, and at the end -- other side may be a sling */
    get insideChamferSling(): HalfEdgeMask;
    private readonly _insideChamferSling;
    /** This is the outside of the end of a chamfer face -- i.e. the inside of a new face-at-vertex */
    get outsideEndOfChamferFace(): HalfEdgeMask;
    private readonly _outsideEndOfChamferFace;
    private readonly _smoothRadiansBetweenNormals;
    private readonly _smoothAccumulatedRadiansBetweenNormals;
    private readonly _chamferTurnRadians;
    static graphDebugFunction?: FacetOffsetGraphDebugFunction;
    static stringDebugFunction?: FacetOffsetDebugString;
    private applyFaceNormalOffsetsToSectorData;
    /**
     * * build a mesh offset by given distance.
     * * output the mesh to the given builder.
     * @param basePolyface original mesh
     * @param builder polyface builder to receive the new mesh.
     * @param distance signed offset distance.
     */
    static buildOffsetMeshWithEdgeChamfers(basePolyface: IndexedPolyface, builder: PolyfaceBuilder, distance: number, options: OffsetMeshOptions): void;
    /**
     * For each face of the graph, shift vertices by offsetDistance and emit to the builder as a facet
     * @param polyfaceBuilder
     */
    announceSimpleOffsetFromFaces(polyfaceBuilder: PolyfaceBuilder, offsetDistance: number): void;
    /**
     * For each face of the graph, output the xyz of the sector data
     * @param polyfaceBuilder
     */
    announceFacetsWithSectorCoordinatesAroundFaces(polyfaceBuilder: PolyfaceBuilder): void;
    private countBits;
    /**
     * For each edge of the graph . .
     * * Collect coordinates in 4 sectors going around the edge
     * * Compress with tight tolerance so adjacent sectors with clean point match reduce to a single point.
     * * Emit as a facet.
     * @param polyfaceBuilder
     */
    announceFacetsWithSectorCoordinatesAroundEdges(polyfaceBuilder: PolyfaceBuilder): void;
    private getCoordinateString;
    private inspectMasks;
    /**
     * For each face of the graph, output the xyz of the sector data
     * @param polyfaceBuilder
     */
    announceFacetsWithSectorCoordinatesAroundVertices(polyfaceBuilder: PolyfaceBuilder): void;
    /**
     * * Exterior half edges have HalfEdgeMask.EXTERIOR
     * * All interior half edge around a facet have facetTag pointing to a facetProperties object for that facet.
     *    * the facetOffsetProperties object has the simple facet normal.
     * * Each half edge has edgeTag pointing to to a sectorOffsetProperties object
     *    * the sectorOffsetProperties has a copy of the facet normal.
     * @param polyface
     * @returns graph
     */
    static buildBaseGraph(polyface: IndexedPolyface): HalfEdgeGraph | undefined;
    private setOffsetAtDistanceAroundVertex;
    private setOffsetXYAndZAroundVertex;
    /**
     *  * start at vertexSeed.
     *  * set the offset point at up to (and including) one with (a) this._breakMaskB or (b) this._exteriorMask
     *  *
     * @param vertexSeed first node to mark.
     * @param f function to call to announce each node and its sector properties.
     * @returns number of nodes marked.
     */
    private announceNodeAndSectorPropertiesInSmoothSector;
    private computeAverageNormalAndMaxDeviationAroundVertex;
    private assignOffsetByAverageNormalAroundVertex;
    /** Search around a vertex for a sector which has a different normal from its vertexPredecessor.
     * * The seed will be the first candidate considered
     */
    private markBreakEdgesAndSaveAverageNormalsAroundVertex;
    /** Compute the point of intersection of the planes in the sectors of 3 half edges */
    private compute3SectorIntersection;
    /** Compute the point of intersection of the planes in the sectors of 3 half edges */
    private compute3SectorIntersectionDebug;
    /** Compute the point of intersection of the planes in the sectors of 2 half edges, using cross product of their normals to resolve */
    private compute2SectorIntersection;
    /**
     * * at input, graph has all original faces and edges
     *   * each sector points to a faceProperties with original facet normal
     * * at exit:
     *    * new "chamfer faces" are added outside of edges with angle between normal sin excess of options.chamferTurnAngleBetweenNormals
     *    * the original edge is split along its length to create space
     *      * one edge "along" each direction inside the slit.
     *      * a sling edge at each end of the slit.
     *          * outside of the sling is part of the slit face loop.
     *          * inside is a single-node face
     *    * thus the slit itself has 4 nodes.
     *    * the two nodes at each end can thus contain the two distinct points at that end of the chamfer.
     *    * all 4 nodes of the slit face point to a new FacetOffsetProperties with the average normal.
     *    * the inside of each sling face has
     *        * original vertex coordinates in the node
     *        * face properties with a normal pointing outward from that end of the original edge -- hence define a plane that can clip the chamfer
     *    * the two points at each end of the chamfer are computed as the intersection of
     *        * chamfer plane
     *        * sling plane
     *        * adjacent plane of the face on the other side of the edge being chamfered.
     * @param distance distance to offset.  The sign of this is important in the chamfer construction.
     */
    private addChamferTopologyToAllEdges;
    /**
     * * at input:
     *   * Each node points to sectorOffsetProperties with previously computed XYZ (presumably mismatched)
     * * at exit:
     *    * Each sectorOffsetProperties has an offset point computed with consideration of offset planes in the neighborhood.
     * @param distance distance to offset.
     */
    private computeOffsetFacetIntersections;
    private isInsideSling;
    private isInsideChamferOrSling;
    private isOffsetAssigned;
    /**
     *
     * @param sourceNode node with good xyz
     * @param destinationStartNode first of a sequence of nodes to set (delimited by masks)
     * @param description string for debug
     * @param workPoint point to use for coordinate transfer.
     */
    private transferXYZFromNodeToSmoothSector;
}
export {};
