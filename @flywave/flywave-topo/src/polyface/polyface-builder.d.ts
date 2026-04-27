import { type Arc3d } from "../curve/arc3d";
import { CurvePrimitive } from "../curve/curve-primitive";
import { type AnyCurve, type AnyRegion } from "../curve/curve-types";
import { GeometryQuery } from "../curve/geometry-query";
import { LineString3d } from "../curve/line-string3d";
import { type Loop } from "../curve/loop";
import { ParityRegion } from "../curve/parity-region";
import { StrokeOptions } from "../curve/stroke-options";
import { type UnionRegion } from "../curve/union-region";
import { type UVSurface, NullGeometryHandler } from "../geometry3d/geometry-handler";
import { GrowableXYArray } from "../geometry3d/growable-xy-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Range3d } from "../geometry3d/range";
import { Segment1d } from "../geometry3d/segment1d";
import { Transform } from "../geometry3d/transform";
import { type XAndY } from "../geometry3d/xyz-props";
import { type Box } from "../solid/box";
import { type Cone } from "../solid/cone";
import { type LinearSweep } from "../solid/linear-sweep";
import { type RotationalSweep } from "../solid/rotational-sweep";
import { type RuledSweep } from "../solid/ruled-sweep";
import { type Sphere } from "../solid/sphere";
import { type TorusPipe } from "../solid/torus-pipe";
import { type HalfEdgeGraph, type HalfEdgeToBooleanFunction, HalfEdge } from "../topology/graph";
import { type PolyfaceVisitor, IndexedPolyface } from "./polyface";
/**
 *
 * * Simple construction for strongly typed GeometryQuery objects:
 *
 *  * Create a builder with `builder = PolyfaceBuilder.create()`
 *  * Add GeometryQuery objects:
 *
 *    * `builder.addGeometryQuery(g: GeometryQuery)`
 *    * `builder.addCone(cone: Cone)`
 *    * `builder.addTorusPipe(surface: TorusPipe)`
 *    * `builder.addLinearSweepLineStringsXYZOnly(surface: LinearSweep)`
 *    * `builder.addRotationalSweep(surface: RotationalSweep)`
 *    * `builder.addLinearSweep(surface: LinearSweep)`
 *    * `builder.addRuledSweep(surface: RuledSweep)`
 *    * `builder.addSphere(sphere: Sphere)`
 *    * `builder.addBox(box: Box)`
 *    * `builder.addIndexedPolyface(polyface)`
 *  *  Extract with `builder.claimPolyface(true)`
 *
 * * Simple construction for ephemeral constructive data:
 *
 *  * Create a builder with `builder = PolyfaceBuilder.create()`
 *  * Add from fragmentary data:
 *    * `builder.addBetweenLineStringsWithStoredIndices(linestringA  linestringB)`
 *    * `builder.addBetweenLineStringsWithRuleEdgeNormals(linestringA, vA, linestringB, vB, addClosure)`
 *    * `builder.addBetweenTransformedLineStrings(curves, transformA, transformB, addClosure)`
 *    * `builder.addLinearSweepLineStringsXYZOnly(contour, vector)`
 *    * `builder.addPolygon(points, numPointsToUse)`
 *    * `builder.addTransformedUnitBox(transform)`
 *    * `builder.addTriangleFan(conePoint, linestring, toggleOrientation)`
 *    * `builder.addTrianglesInUncheckedConvexPolygon(linestring, toggle)`
 *    * `builder.addUVGridBody(surface,numU, numV, createFanInCaps)`
 *    * `builder.addGraph(Graph, acceptFaceFunction)`
 *  *  Extract with `builder.claimPolyface(true)`
 *
 * * Low-level detail construction -- direct use of indices
 *  * Create a builder with `builder = PolyfaceBuilder.create()`
 *  * Add GeometryQuery objects
 *    * `builder.addPoint(point)`
 *    * `builder.findOrAddPointInLineString(linestring, index)`
 *    * `builder.addPointXYZ(x,y,z)`
 *    * `builder.addTriangleFacet(points)`
 *    * `builder.addQuadFacet(points)`
 * @public
 */
export declare class PolyfaceBuilder extends NullGeometryHandler {
    private readonly _polyface;
    private readonly _options;
    /** return (pointer to) the `StrokeOptions` in use by the builder. */
    get options(): StrokeOptions;
    private _reversed;
    /** Ask if this builder is reversing vertex order as loops are received. */
    get reversedFlag(): boolean;
    /**
     * Extract the polyface.
     * @param compress whether to cluster vertices (default true)
     * @param tolerance compression tolerance (default Geometry.smallMetricDistance)
     */
    claimPolyface(compress?: boolean, tolerance?: number): IndexedPolyface;
    /** Toggle (reverse) the flag controlling orientation flips for newly added facets. */
    toggleReversedFacetFlag(): void;
    private constructor();
    /**
     * Create a builder with given StrokeOptions
     * @param options StrokeOptions (captured)
     */
    static create(options?: StrokeOptions): PolyfaceBuilder;
    /** add facets for a transformed unit box. */
    addTransformedUnitBox(transform: Transform): void;
    /** Add facets for a transformed range box.
     * @param transform applied to the range points before adding to the polyface
     * @param range sides become 6 quad polyface facets
     * @param faceSelector for each face in the order of BoxTopology.cornerIndexCCW, faceSelector[i]===false skips that facet.
     */
    addTransformedRangeMesh(transform: Transform, range: Range3d, faceSelector?: boolean[]): void;
    /** Add triangles from points[0] to each far edge.
     * @param ls linestring with point coordinates
     * @param toggle if true, wrap the triangle creation in toggleReversedFacetFlag.
     */
    addTriangleFan(conePoint: Point3d, ls: LineString3d, toggle: boolean): void;
    /** Add triangles from points[0] to each far edge
     * * Assume the polygon is convex.
     * * i.e. simple triangulation from point0
     * * i.e. simple cross products give a good normal.
     * @param ls linestring with point coordinates
     * @param reverse if true, wrap the triangle creation in toggleReversedFacetFlag.
     */
    addTrianglesInUncheckedConvexPolygon(ls: LineString3d, toggle: boolean): void;
    /**
     * Announce point coordinates.
     */
    addPoint(xyz: Point3d): number;
    /**
     * Announce point coordinates.
     * @deprecated in 3.x. Use addPoint instead.
     */
    findOrAddPoint(xyz: Point3d): number;
    /**
     * Announce uv parameter coordinates.
     */
    addParamXY(x: number, y: number): number;
    /**
     * Announce uv parameter coordinates.
     * @deprecated in 3.x. Use addParamXY instead.
     */
    findOrAddParamXY(x: number, y: number): number;
    private static readonly _workPointFindOrAddA;
    private static readonly _workVectorFindOrAdd;
    private static readonly _workUVFindOrAdd;
    /**
     * Announce point coordinates.  The implementation is free to either create a new point or (if known) return index of a prior point with the same coordinates.
     * @returns Returns the point index in the Polyface.
     * @param index Index of the point in the linestring.
     */
    findOrAddPointInLineString(ls: LineString3d, index: number, transform?: Transform, priorIndex?: number): number | undefined;
    /**
     * Announce point coordinates.  The implementation is free to either create a new point or (if known) return index of a prior point with the same coordinates.
     * @returns Returns the point index in the Polyface.
     * @param index Index of the point in the linestring.
     */
    findOrAddPointInGrowableXYZArray(xyz: GrowableXYZArray, index: number, transform?: Transform, priorIndex?: number): number | undefined;
    /**
     * Announce point coordinates.  The implementation is free to either create a new point or (if known) return index of a prior point with the same coordinates.
     * @returns Returns the point index in the Polyface.
     * @param index Index of the point in the linestring.
     */
    findOrAddNormalInGrowableXYZArray(xyz: GrowableXYZArray, index: number, transform?: Transform, priorIndex?: number): number | undefined;
    /**
     * Announce uv parameter coordinates.
     * @returns Returns the uv parameter index in the Polyface.
     * @param index Index of the param in the linestring.
     */
    addParamInGrowableXYArray(data: GrowableXYArray, index: number): number | undefined;
    /**
     * Announce uv parameter coordinates.
     * @deprecated in 3.x. Use addParamInGrowableXYArray instead.
     */
    findOrAddParamInGrowableXYArray(data: GrowableXYArray, index: number): number | undefined;
    /**
     * Announce param coordinates, taking u from ls.fractions and v from parameter.  The implementation is free to either create a new param or (if known) return index of a prior point with the same coordinates.
     * @returns Returns the point index in the Polyface.
     * @param index Index of the point in the linestring.
     */
    findOrAddParamInLineString(ls: LineString3d, index: number, v: number, priorIndexA?: number, priorIndexB?: number): number | undefined;
    /**
     * Announce normal coordinates found at index in the surfaceNormal array stored on the linestring
     * @returns Returns the point index in the Polyface.
     * @param index Index of the point in the linestring.
     * @param priorIndex possible prior normal index to reuse
     */
    findOrAddNormalInLineString(ls: LineString3d, index: number, transform?: Transform, priorIndexA?: number, priorIndexB?: number): number | undefined;
    /**
     * Announce point coordinates.
     */
    addPointXYZ(x: number, y: number, z: number): number;
    /**
     * Announce point coordinates.
     * @deprecated in 3.x. Use addPointXYZ instead.
     */
    findOrAddPointXYZ(x: number, y: number, z: number): number;
    /** Returns a transform who can be applied to points on a triangular facet in order to obtain UV parameters. */
    private getUVTransformForTriangleFacet;
    /** Returns the normal to a triangular facet. */
    private getNormalForTriangularFacet;
    /**
     * Add a quad to the polyface given its points in order around the edges.
     * @param points array of at least three vertices
     * @param params optional array of at least four uv parameters (if undefined, params are calculated without reference data)
     * @param normals optional array of at least four vectors (if undefined, the quad is assumed to be planar and its normal is calculated)
     * @param colors optional array of at least four colors
     */
    addQuadFacet(points: Point3d[] | GrowableXYZArray, params?: Point2d[], normals?: Vector3d[], colors?: number[]): void;
    /** Announce a single quad facet's point indexes.
     * * The actual quad may be reversed or triangulated based on builder setup.
     * * indexA0 and indexA1 are in the forward order at the "A" end of the quad
     * * indexB0 and indexB1 are in the forward order at the "B" end of the quad.
     * * This means ccw/cw ordered vertices v[i] should be passed into this function as i=[0,1,3,2]
     */
    private addIndexedQuadPointIndexes;
    /** For a single quad facet, add the indexes of the corresponding param points. */
    private addIndexedQuadParamIndexes;
    /** For a single quad facet, add the indexes of the corresponding normal vectors. */
    private addIndexedQuadNormalIndexes;
    /** For a single quad facet, add the indexes of the corresponding colors. */
    private addIndexedQuadColorIndexes;
    /**
     * Add a triangle to the polyface given its points in order around the edges.
     * @param points array of at least three vertices
     * @param params optional array of at least three uv parameters (if undefined, params are calculated without reference data)
     * @param normals optional array of at least three vectors (if undefined, the normal is calculated)
     * @param colors optional array of at least three colors
     */
    addTriangleFacet(points: Point3d[] | GrowableXYZArray, params?: Point2d[], normals?: Vector3d[], colors?: number[]): void;
    /** Announce a single triangle facet's point indexes.
     *
     * * The actual quad may be reversed or triangulated based on builder setup.
     */
    private addIndexedTrianglePointIndexes;
    /** For a single triangle facet, add the indexes of the corresponding params. */
    private addIndexedTriangleParamIndexes;
    /** For a single triangle facet, add the indexes of the corresponding params. */
    private addIndexedTriangleNormalIndexes;
    /** For a single triangle facet, add the indexes of the corresponding colors. */
    private addIndexedTriangleColorIndexes;
    /** Find or add xyzIndex and normalIndex for coordinates in the sector. */
    private setSectorIndices;
    private addSectorTriangle;
    private addSectorQuadA01B01;
    /** Add facets between lineStrings with matched point counts.
     * * surface normals are computed from (a) curve tangents in the linestrings and (b)rule line between linestrings.
     * * Facets are announced to addIndexedQuad.
     * * addIndexedQuad is free to apply reversal or triangulation options.
     */
    addBetweenLineStringsWithRuleEdgeNormals(lineStringA: LineString3d, vA: number, lineStringB: LineString3d, vB: number, addClosure?: boolean): void;
    /** Add facets between lineStrings with matched point counts.
     * * point indices pre-stored
     * * normal indices pre-stored
     * * uv indices pre-stored
     */
    addBetweenLineStringsWithStoredIndices(lineStringA: LineString3d, lineStringB: LineString3d): void;
    /** Add facets between lineStrings with matched point counts.
     *
     * * Facets are announced to addIndexedQuad.
     * * addIndexedQuad is free to apply reversal or triangulation options.
     */
    addBetweenTransformedLineStrings(curves: AnyCurve, transformA: Transform, transformB: Transform, addClosure?: boolean): void;
    private addBetweenStrokeSetPair;
    /**
     * Add facets from a Cone
     */
    addCone(cone: Cone): void;
    /**
     * Add facets for a TorusPipe.
     */
    addTorusPipe(surface: TorusPipe, phiStrokeCount?: number, thetaStrokeCount?: number): void;
    /**
     * Add point data (no params, normals) for linestrings.
     * * This recurses through curve chains (loops and paths)
     * * linestrings are swept
     * * All other curve types are ignored.
     * @param vector sweep vector
     * @param contour contour which contains only linestrings
     */
    addLinearSweepLineStringsXYZOnly(contour: AnyCurve, vector: Vector3d): void;
    /**
     * Construct facets for a rotational sweep.
     */
    addRotationalSweep(surface: RotationalSweep): void;
    /**
     * Construct facets for any planar region
     */
    addTriangulatedRegion(region: AnyRegion): void;
    /**
     * * Recursively visit all children of data.
     * * At each primitive, invoke the computeStrokeCountForOptions method, with options from the builder.
     * @param data
     */
    applyStrokeCountsToCurvePrimitives(data: AnyCurve | GeometryQuery): void;
    private addBetweenStrokeSetsWithRuledNormals;
    private createIndicesInLineString;
    private addBetweenRotatedStrokeSets;
    /**
     *
     * Add facets from
     * * The swept contour
     * * each cap.
     */
    addLinearSweep(surface: LinearSweep): void;
    /**
     * Add facets from a ruled sweep.
     */
    addRuledSweep(surface: RuledSweep): boolean;
    /**
     * Add facets from a Sphere
     */
    addSphere(sphere: Sphere, strokeCount?: number): void;
    /**
     * Add facets from a Box
     */
    addBox(box: Box): void;
    /** Add a polygon to the evolving facets.
     *
     * * Add points to the polyface
     * * indices are added (in reverse order if indicated by the builder state)
     * @param points array of points.  This may contain extra points not to be used in the polygon
     * @param numPointsToUse number of points to use.
     */
    addPolygon(points: Point3d[], numPointsToUse?: number): void;
    /** Add a polygon to the evolving facets.
     *
     * * Add points to the polyface
     * * indices are added (in reverse order if indicated by the builder state)
     * * Arrays with 2 or fewer points are ignored.
     * @param points array of points. Trailing closure points are ignored.
     */
    addPolygonGrowableXYZArray(points: GrowableXYZArray): void;
    /** Add a polygon to the evolving facets.
     * * add points to the polyface
     * * compute each point index as the point is added
     * * all data arrays are parallel to the point array
     * * point indices are added in reverse order if indicated by the builder state
     * @param points array of vertices in order around the facet
     * @param normals optional array of normals, one per vertex
     * @param params optional array of uv-parameters, one per vertex
     * @param colors optional array of colors, one per vertex
     * @param edgeVisible optional array of flags, one per vertex, true iff edge starting at corresponding vertex is visible
     */
    addFacetFromGrowableArrays(points: GrowableXYZArray, normals: GrowableXYZArray | undefined, params: GrowableXYArray | undefined, colors: number[] | undefined, edgeVisible?: boolean[]): void;
    /** Add the current visitor facet to the evolving polyface.
     * * indices are added (in reverse order if indicated by the builder state)
     */
    addFacetFromVisitor(visitor: PolyfaceVisitor): void;
    /**
     * Add the subset of visitor data indexed by the indices.
     * * Ideally, the subset represents a sub-facet of the visited facet.
     * @param visitor data for the currently visited facet
     * @param indices local indices into the visitor data arrays
     * @returns whether the data was added successfully. Encountering an invalid index returns false.
     */
    addFacetFromIndexedVisitor(visitor: PolyfaceVisitor, indices: number[]): boolean;
    /** Add a polyface, with optional reverse and transform. */
    addIndexedPolyface(source: IndexedPolyface, reversed?: boolean, transform?: Transform): void;
    /**
     * Produce a new FacetFaceData for all terminated facets since construction of the previous face.
     * Each facet number/index is mapped to the FacetFaceData through the faceToFaceData array.
     * Returns true if successful, and false otherwise.
     */
    endFace(): boolean;
    /** Double dispatch handler for Cone */
    handleCone(g: Cone): any;
    /** Double dispatch handler for TorusPipe */
    handleTorusPipe(g: TorusPipe): any;
    /** Double dispatch handler for Sphere */
    handleSphere(g: Sphere): any;
    /** Double dispatch handler for Box */
    handleBox(g: Box): any;
    /** Double dispatch handler for LinearSweep */
    handleLinearSweep(g: LinearSweep): any;
    /** Double dispatch handler for RotationalSweep */
    handleRotationalSweep(g: RotationalSweep): any;
    /** Double dispatch handler for RuledSweep */
    handleRuledSweep(g: RuledSweep): any;
    /** Double dispatch handler for Loop */
    handleLoop(g: Loop): any;
    /** Double dispatch handler for ParityRegion */
    handleParityRegion(g: ParityRegion): any;
    /** Double dispatch handler for UnionRegion */
    handleUnionRegion(g: UnionRegion): any;
    /** add facets for a GeometryQuery object.   This is double dispatch through `dispatchToGeometryHandler(this)` */
    addGeometryQuery(g: GeometryQuery): void;
    /**
     *
     * * Visit all faces
     * * Test each face with f(node) for any node on the face.
     * * For each face that passes, pass its coordinates to the builder.
     * * Rely on the builder's compress step to find common vertex coordinates
     * @internal
     */
    addGraph(graph: HalfEdgeGraph, acceptFaceFunction?: HalfEdgeToBooleanFunction, isEdgeVisibleFunction?: HalfEdgeToBooleanFunction | undefined): void;
    /**
     *
     * * For each node in `faces`
     *  * add all of its vertices to the polyface
     *  * add point indices to form a new facet.
     *    * (Note: no normal or param indices are added)
     *  * terminate the facet
     * @internal
     */
    addGraphFaces(_graph: HalfEdgeGraph, faces: HalfEdge[]): void;
    /** Create a polyface containing the faces of a HalfEdgeGraph, with test function to filter faces.
     * @internal
     */
    static graphToPolyface(graph: HalfEdgeGraph, options?: StrokeOptions, acceptFaceFunction?: HalfEdgeToBooleanFunction): IndexedPolyface;
    /** Create a polyface containing the faces of a HalfEdgeGraph that are specified by the HalfEdge array.
     * @internal
     */
    static graphFacesToPolyface(graph: HalfEdgeGraph, faces: HalfEdge[]): IndexedPolyface;
    /** Create a polyface containing triangles in a (space) polygon.
     * * The polyface contains only coordinate data (no params or normals).
     */
    static polygonToTriangulatedPolyface(points: Point3d[], localToWorld?: Transform): IndexedPolyface | undefined;
    /**
     * Given arrays of coordinates for multiple facets.
     * * pointArray[i] is an array of 3 or 4 points
     * * paramArray[i] is an array of matching number of params
     * * normalArray[i] is an array of matching number of normals.
     * @param pointArray array of arrays of point coordinates
     * @param paramArray array of arrays of uv parameters
     * @param normalArray array of arrays of normals
     * @param endFace if true, call this.endFace after adding all the facets.
     */
    addCoordinateFacets(pointArray: Point3d[][], paramArray?: Point2d[][], normalArray?: Vector3d[][], endFace?: boolean): void;
    /**
     * * Evaluate `(numU + 1) * (numV + 1)` grid points (in 0..1 in both u and v) on a surface.
     * * Add the facets for `numU * numV` quads.
     * * uv params are the 0..1 fractions.
     * * normals are cross products of u and v direction partial derivatives.
     * @param surface
     * @param numU number of intervals (edges) in the u direction.  (Number of points is `numU + 1`)
     * @param numV number of intervals (edges) in the v direction.  (Number of points is `numV + 1`)
     * @param uMap optional mapping from u fraction to parameter space (such as texture)
     * @param vMap optional mapping from v fraction to parameter space (such as texture)
     */
    addUVGridBody(surface: UVSurface, numU: number, numV: number, uMap?: Segment1d, vMap?: Segment1d): void;
    /**
     * Triangulate the points as viewed in xy.
     * @param points
     */
    static pointsToTriangulatedPolyface(points: Point3d[], options?: StrokeOptions): IndexedPolyface | undefined;
    /** Create (and add to the builder) triangles that bridge the gap between two linestrings.
     * * Each triangle will have 1 vertex on one of the linestrings and 2 on the other
     * * Choice of triangles is heuristic, hence does not have a unique solution.
     * * Logic to choice among the various possible triangle orders prefers
     *    * Make near-coplanar facets
     *    * make facets with good aspect ratio.
     *    * This is exercised with a limited number of lookahead points, i.e. greedy to make first-available decision.
     * @param pointsA points of first linestring.
     * @param pointsB points of second linestring.
     */
    addGreedyTriangulationBetweenLineStrings(pointsA: Point3d[] | LineString3d | IndexedXYZCollection, pointsB: Point3d[] | LineString3d | IndexedXYZCollection): void;
    private addMiteredPipesFromPoints;
    /**
     * * Create (and add to the builder) quad facets for a mitered pipe that follows a centerline curve.
     * * Circular or elliptical pipe cross sections can be specified by supplying either a radius, a pair of semi-axis lengths, or a full Arc3d.
     *    * For semi-axis length input, x corresponds to an ellipse local axis nominally situated parallel to the xy-plane.
     *    * The center of Arc3d input is translated to the centerline start point to act as initial cross section.
     * @param centerline centerline of pipe. If curved, it will be stroked using the builder's StrokeOptions.
     * @param sectionData circle radius, ellipse semi-axis lengths, or full Arc3d
     * @param numFacetAround how many equal parameter-space chords around each section
     */
    addMiteredPipes(centerline: IndexedXYZCollection | Point3d[] | CurvePrimitive, sectionData: number | XAndY | Arc3d, numFacetAround?: number): void;
    /** Return the polyface index array indices corresponding to the given edge, or undefined if error. */
    private getEdgeIndices;
    /** Create a side face between base and swept facets along a base boundary edge.
     * * Assumes numBaseFacets base facets were added to this builder, immediately followed by the same number of swept facets with opposite orientation (first index not preserved).
     */
    private addSweptFace;
    /**
     * Add facets from the source polyface, from its translation along the vector, and from its swept boundary edges, to form a polyface that encloses a volume.
     * @param source the surface mesh to sweep
     * @param sweepVector the direction and length to sweep the surface mesh
     * @param triangulateSides whether to triangulate side facets, or leave as quads
     * @returns whether the added facets comprise a simple sweep. If false, the resulting mesh may have self-intersections, be non-manifold, have inconsistently oriented facets, etc.
     */
    addSweptIndexedPolyface(source: IndexedPolyface, sweepVector: Vector3d, triangulateSides?: boolean): boolean;
}
