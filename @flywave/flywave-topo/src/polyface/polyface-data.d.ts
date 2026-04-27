import { GrowableXYArray } from "../geometry3d/growable-xy-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Range3d } from "../geometry3d/range";
import { type Transform } from "../geometry3d/transform";
import { PolyfaceAuxData } from "./aux-data";
import { type FacetFaceData } from "./facet-face-data";
import { TaggedNumericData } from "./tagged-numeric-data";
/**
 * PolyfaceData carries data arrays for point, normal, param, color and their indices.
 *
 * * IndexedPolyface carries a PolyfaceData as a member. (NOT as a base class -- it already has GeometryQuery as base)
 * * IndexedPolyfaceVisitor uses PolyfaceData as a base class.  In this use there is only a single facet in the polyfaceData.
 * * PolyfaceData does not know (!!!) what indices range constitute a facet.  That is managed by derived class or carrier class.
 * @public
 */
export declare class PolyfaceData {
    /** Relative tolerance used in tests for planar facets
     * @internal
     */
    static readonly planarityLocalRelTol = 1e-13;
    /** Coordinate data for points in the facets, packed as numbers in a contiguous array. */
    point: GrowableXYZArray;
    /** Indices of points at facet vertices. */
    pointIndex: number[];
    /** booleans indicating visibility of corresponding edges */
    edgeVisible: boolean[];
    /** Coordinates of normal vectors, packed as numbers in a contiguous array */
    normal: GrowableXYZArray | undefined;
    /** indices of normals at facet vertices. */
    normalIndex: number[] | undefined;
    /** Coordinates of uv parameters, packed as numbers in a contiguous array. */
    param?: GrowableXYArray;
    /** Indices of params at facet vertices. */
    paramIndex: number[] | undefined;
    /** Color values.  These are carried around as simple numbers, but are probably
     * required (by display systems) map exactly to 32 bit integers.
     */
    color: number[] | undefined;
    /** Indices of colors at facet vertices. */
    colorIndex: number[] | undefined;
    /** Face data will remain empty until a face is specified. */
    face: FacetFaceData[];
    /** Auxiliary data */
    auxData: PolyfaceAuxData | undefined;
    /** Tagged geometry data */
    taggedNumericData: TaggedNumericData | undefined;
    private _twoSided;
    /** boolean tag indicating if the facets are viewable from the back */
    get twoSided(): boolean;
    set twoSided(value: boolean);
    /** set the `taggedNumericData` member */
    setTaggedNumericData(data: TaggedNumericData | undefined): void;
    private _expectedClosure;
    /** boolean tag indicating if the facets are viewable from the back */
    get expectedClosure(): number;
    set expectedClosure(value: number);
    /** Constructor for facets.
     *   * The various params control whether respective arrays are to be allocated.
     *   * If arrayData is provided, all other params are IGNORED.
     *   *
     */
    constructor(needNormals?: boolean, needParams?: boolean, needColors?: boolean, twoSided?: boolean);
    /** Return a deep clone. */
    clone(): PolyfaceData;
    /** Test for equal indices and nearly equal coordinates */
    isAlmostEqual(other: PolyfaceData): boolean;
    /** Ask if normals are required in this mesh. */
    get requireNormals(): boolean;
    /** Get the point count */
    get pointCount(): number;
    /** Get the normal count */
    get normalCount(): number;
    /** Get the param count */
    get paramCount(): number;
    /** Get the color count */
    get colorCount(): number;
    /** Get the index count.  Note that there is one count, and all index arrays (point, normal, param, color) must match */
    get indexCount(): number;
    /** Get the number of faces.
     * * Note that a "face" is not a facet.
     * * A "face" is a subset of facets grouped for application purposes.
     */
    get faceCount(): number;
    /** return indexed point. This is a copy of the coordinates, not a reference. */
    getPoint(i: number, out?: Point3d): Point3d | undefined;
    /** return indexed normal. This is the COPY to the normal, not a reference. */
    getNormal(i: number): Vector3d | undefined;
    /** return indexed param. This is the COPY of the coordinates, not a reference. */
    getParam(i: number): Point2d | undefined;
    /** return indexed color */
    getColor(i: number): number;
    /** return indexed visibility */
    getEdgeVisible(i: number): boolean;
    /** Copy the contents (not pointer) of point[i] into dest. */
    copyPointTo(i: number, dest: Point3d): void;
    /** Copy the contents (not pointer) of normal[i] into dest. */
    copyNormalTo(i: number, dest: Vector3d): void;
    /** Copy the contents (not pointer) of param[i] into dest. */
    copyParamTo(i: number, dest: Point2d): void;
    /** test if normal at a specified index matches uv */
    isAlmostEqualParamIndexUV(index: number, u: number, v: number): boolean;
    /**
     * * Copy data from other to this.
     * * This is the essence of transferring coordinates spread throughout a large polyface into a visitor's single facet.
     * * "other" is the large polyface
     * * "this" is the visitor
     * * does NOT copy face data - visitors reference the FacetFaceData array for the whole polyface!!
     * @param other polyface data being mined.
     * @param index0 start index in other's index arrays
     * @param index1 end index (one beyond last data accessed0 in other's index arrays
     * @param numWrap number of points to replicate as wraparound.
     */
    gatherIndexedData(other: PolyfaceData, index0: number, index1: number, numWrap: number): void;
    private static trimArray;
    /** Trim all index arrays to stated length.
     * * This is called by PolyfaceBuilder to clean up after an aborted construction sequence.
     */
    trimAllIndexArrays(length: number): void;
    /** Resize all data arrays to specified length */
    resizeAllDataArrays(length: number): void;
    /** Return the range of the point array (optionally transformed) */
    range(result?: Range3d, transform?: Transform): Range3d;
    /** reverse indices facet-by-facet, with the given facetStartIndex array delimiting faces.
     *
     * * facetStartIndex[0] == 0 always -- start of facet zero.
     * * facet k has indices from facetStartIndex[k] <= i < facetStartIndex[k+1]
     * * hence for "internal" k, facetStartIndex[k] is both the upper limit of facet k-1 and the start of facet k.
     * *
     */
    reverseIndices(facetStartIndex?: number[]): void;
    /** reverse indices facet-by-facet, with the given facetStartIndex array delimiting faces.
     *
     * * facetStartIndex[0] == 0 always -- start of facet zero.
     * * facet k has indices from facetStartIndex[k] <= i < facetStartIndex[k+1]
     * * hence for "internal" k, facetStartIndex[k] is both the upper limit of facet k-1 and the start of facet k.
     * *
     */
    reverseIndicesSingleFacet(facetId: number, facetStartIndex: number[]): void;
    /** Scale all the normals by -1 */
    reverseNormals(): void;
    /** Apply `transform` to point and normal arrays and to auxData.
     * * IMPORTANT This base class is just a data carrier.  It does not know if the index order and normal directions have special meaning.
     * * i.e. caller must separately reverse index order and normal direction if needed.
     */
    tryTransformInPlace(transform: Transform): boolean;
    /**
     * Compress the instance by equating duplicate data.
     * * Search for duplicates within points, normals, params, and colors.
     * * Compress each data array.
     * * Revise all indexing for the relocated data.
     * @param tolerance optional tolerance for clustering mesh vertices. Default is [[Geometry.smallMetricDistance]].
     */
    compress(tolerance?: number): void;
    /**
     * Test if facetStartIndex is (minimally!) valid:
     * * length must be nonzero (recall that for "no facets" the facetStartIndexArray still must contain a 0)
     * * Each entry must be strictly smaller than the one that follows.
     * @param facetStartIndex array of facetStart data.  facet `i` has indices at `facetsStartIndex[i]` to (one before) `facetStartIndex[i+1]`
     */
    static isValidFacetStartIndexArray(facetStartIndex: number[]): boolean;
    /** Reverse data in entire facet indexing arrays.
     * * parameterized over type T so non-number data -- e.g. boolean visibility flags -- can be reversed.
     */
    static reverseIndices<T>(facetStartIndex: number[], indices: T[] | undefined, preserveStart: boolean): boolean;
    /** Reverse data in entire facet indexing arrays.
     * * parameterized over type T so non-number data -- e.g. boolean visibility flags -- can be reversed.
     */
    static reverseIndicesSingleFacet<T>(facetId: number, facetStartIndex: number[], indices: T[] | undefined, preserveStart: boolean): boolean;
}
