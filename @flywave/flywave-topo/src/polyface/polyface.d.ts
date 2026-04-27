import { GeometryQuery } from "../curve/geometry-query";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type Point2d } from "../geometry3d/point2d-vector2d";
import { type Vector3d, Point3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { type Transform } from "../geometry3d/transform";
import { FacetFaceData } from "./facet-face-data";
import { PolyfaceData } from "./polyface-data";
/**
 * A Polyface is an abstract mesh structure (of unspecified implementation) that provides a PolyfaceVisitor
 * to iterate over its facets.
 * @public
 */
export declare abstract class Polyface extends GeometryQuery {
    /** String name for schema properties */
    readonly geometryCategory = "polyface";
    /** Underlying polyface data. */
    data: PolyfaceData;
    protected constructor(data: PolyfaceData);
    /** create and return a visitor for this concrete polyface. */
    abstract createVisitor(_numWrap: number): PolyfaceVisitor;
    /** Flag indicating if the mesh display must assume both sides are visible. */
    get twoSided(): boolean;
    set twoSided(value: boolean);
    /** Flag indicating if the mesh closure is unknown (0), open sheet (1), closed (2) */
    get expectedClosure(): number;
    set expectedClosure(value: number);
    /**
     * Check validity of indices into a data array.
     * * It is valid to have  both indices and data undefined.
     * * It is NOT valid for just one to be defined.
     * * Index values at indices[indexPositionA <= i < indexPositionB] must be valid indices to the data array.
     * @param indices array of indices.
     * @param indexPositionA first index to test
     * @param indexPositionB one past final index to test
     * @param data data array
     * @param dataLength length of data array
     */
    static areIndicesValid(indices: number[] | undefined, indexPositionA: number, indexPositionB: number, data: any | undefined, dataLength: number): boolean;
    /**
     * Returns true if this polyface has no facets.
     */
    abstract get isEmpty(): boolean;
    /**
     * Returns the number of facets of this polyface. Subclasses should override.
     */
    get facetCount(): number | undefined;
}
/**
 * An `IndexedPolyface` is a set of facets which can have normal, param, and color arrays with independent point, normal, param, and color indices.
 * @public
 */
export declare class IndexedPolyface extends Polyface {
    /** Test if other is an instance of `IndexedPolyface` */
    isSameGeometryClass(other: any): boolean;
    /** Tests for equivalence between two IndexedPolyfaces. */
    isAlmostEqual(other: any): boolean;
    /**
     * Returns true if either the point array or the point index array is empty.
     */
    get isEmpty(): boolean;
    /**
     * * apply the transform to points
     * * apply the (inverse transpose of) the matrix part to normals
     * * If determinant is negative, also
     *   * negate normals
     *   * reverse index order around each facet.
     * @param transform
     */
    tryTransformInPlace(transform: Transform): boolean;
    /** Reverse indices for a single facet. */
    reverseSingleFacet(facetId: number): void;
    /** Return a deep clone. */
    clone(): IndexedPolyface;
    /** Return a deep clone with transformed points and normals */
    cloneTransformed(transform: Transform): IndexedPolyface;
    /** Reverse the order of indices around all facets. */
    reverseIndices(): void;
    /** Reverse the direction of all normal vectors. */
    reverseNormals(): void;
    /**
     * * index to the index array entries for a specific facet.
     * * the facet count is facetStart.length - 1
     * * facet [f] indices run from facetStart[f] to upper limit facetStart[f+1].
     * * Note the array is initialized with one entry.
     */
    protected _facetStart: number[];
    /**
     * * For facet i, _facetToFaceData[i] is the index of the faceData entry for the facet.
     * * _facetToFaceData has one entry per facet.
     */
    protected _facetToFaceData: number[];
    /** return face data using a facet index. This is the REFERENCE to the FacetFaceData, not a copy. Returns undefined if none found. */
    tryGetFaceData(i: number): FacetFaceData | undefined;
    /**
     * Constructor for a new polyface.
     * @param data PolyfaceData arrays to capture.
     * @param facetStart optional array of facet start indices (e.g. known during clone)
     * @param facetToFacetData optional array of face identifiers (e.g. known during clone)
     */
    protected constructor(data: PolyfaceData, facetStart?: number[], facetToFaceData?: number[]);
    /**
     * * Add facets from source to this polyface.
     * * Optionally reverse facet indices as per PolyfaceData.reverseIndicesSingleFacet() with preserveStart = false, and invert source normals.
     * * Optionally apply a transform to points and normals.
     * * Will only copy param, normal, color, and face data if we are already tracking them AND/OR the source contains them.
     */
    addIndexedPolyface(source: IndexedPolyface, reversed: boolean, transform: Transform | undefined): void;
    /** Return the total number of param indices in zero-terminated style, which includes
     * * all the indices in the packed zero-based table
     * * one additional index for the zero-terminator of each facet.
     * @note Note that all index arrays (point, normal, param, color) have the same counts, so there
     * is not a separate query for each of them.
     */
    get zeroTerminatedIndexCount(): number;
    /** Create an empty facet set, with coordinate and index data to be supplied later.
     * @param needNormals true if normals will be constructed
     * @param needParams true if uv parameters will be constructed
     * @param needColors true if colors will e constructed.
     */
    static create(needNormals?: boolean, needParams?: boolean, needColors?: boolean, twoSided?: boolean): IndexedPolyface;
    /** add (a clone of ) a point. return its 0 based index.
     * @param point point coordinates
     * @param priorIndex optional index of prior point to check for repeated coordinates
     * @returns Returns the zero-based index of the added or reused point.
     */
    addPoint(point: Point3d, priorIndex?: number): number;
    /** add a point.
     * @returns Returns the zero-based index of the added point.
     */
    addPointXYZ(x: number, y: number, z: number): number;
    /** Add a uv param.
     * @returns 0-based index of the added param.
     */
    addParam(param: Point2d): number;
    /** Add a uv parameter to the parameter array.
     * @param priorIndexA first index to check for possible duplicate value.
     * @param priorIndexB second index to check for possible duplicate value.
     * @returns 0-based index of the added or reused param.
     */
    addParamUV(u: number, v: number, priorIndexA?: number, priorIndexB?: number): number;
    /** Add a normal vector
     * @param priorIndexA first index to check for possible duplicate value.
     * @param priorIndexB second index to check for possible duplicate value.
     * @returns 0-based index of the added or reused normal.
     */
    addNormal(normal: Vector3d, priorIndexA?: number, priorIndexB?: number): number;
    /** Add a normal vector given by direct coordinates
     * @returns 0-based index of the added or reused param.
     */
    addNormalXYZ(x: number, y: number, z: number): number;
    /** Add a color
     * @returns 0-based index of the added or reused color.
     */
    addColor(color: number): number;
    /** Add a point index with edge visibility flag. */
    addPointIndex(index: number, visible?: boolean): void;
    /** Add a normal index */
    addNormalIndex(index: number): void;
    /** Add a param index */
    addParamIndex(index: number): void;
    /** Add a color index */
    addColorIndex(index: number): void;
    /** clean up the open facet.  return the returnValue (so caller can easily return cleanupOpenFacet("message")) */
    cleanupOpenFacet(): void;
    /** announce the end of construction of a facet.
     *
     * * The "open" facet is checked for:
     *
     * **  Same number of indices among all active index arrays --  point, normal, param, color
     * **  All indices are within bounds of the respective data arrays.
     * *  in error cases, all index arrays are trimmed back to the size when previous facet was terminated.
     * *  "undefined" return is normal.   Any other return is a description of an error.
     */
    terminateFacet(validateAllIndices?: boolean): any;
    /**
     * All terminated facets added since the declaration of the previous face
     * will be grouped into a new face with their own 2D range.
     */
    /** (read-only property) number of facets */
    get facetCount(): number;
    /** (read-only property) number of faces */
    get faceCount(): number;
    /** (read-only property) number of points */
    get pointCount(): number;
    /** (read-only property) number of colors */
    get colorCount(): number;
    /** (read-only property) number of parameters */
    get paramCount(): number;
    /** (read-only property) number of normals */
    get normalCount(): number;
    /** Return the number of edges in a particular facet. */
    numEdgeInFacet(facetIndex: number): number;
    /** test if `index` is a valid facet index. */
    isValidFacetIndex(index: number): boolean;
    /** ASSUME valid facet index . .. return its start index in index arrays. */
    facetIndex0(index: number): number;
    /** ASSUME valid facet index . .. return its end index in index arrays. */
    facetIndex1(index: number): number;
    /** create a visitor for this polyface */
    createVisitor(numWrap?: number): PolyfaceVisitor;
    /** Return the range of (optionally transformed) points in this mesh. */
    range(transform?: Transform, result?: Range3d): Range3d;
    /** Extend `range` with coordinates from this mesh */
    extendRange(range: Range3d, transform?: Transform): void;
    /** Given the index of a facet, return the data pertaining to the face it is a part of. */
    getFaceDataByFacetIndex(facetIndex: number): FacetFaceData;
    /**
     * All terminated facets since the last face declaration will be mapped to a single new FacetFaceData object
     * using facetToFaceData[]. FacetFaceData holds the 2D range of the face. Returns true if successful, false otherwise.
     */
    setNewFaceData(endFacetIndex?: number): boolean;
    /** Second step of double dispatch:  call `handler.handleIndexedPolyface(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
}
/**
 * A PolyfaceVisitor manages data while walking through facets.
 *
 * * The polyface visitor holds data for one facet at a time.
 * * The caller can request the position in the addressed facets as a "readIndex."
 * * The readIndex value (as a number) is not promised to be sequential. (I.e. it might be a simple facet count or might be
 * @public
 */
export interface PolyfaceVisitor extends PolyfaceData {
    /** Load data for the facet with given index. */
    moveToReadIndex(index: number): boolean;
    /** Return  the readIndex of the currently loaded facet */
    currentReadIndex(): number;
    /** Load data for the next facet. */
    moveToNextFacet(): boolean;
    /** Reset to initial state for reading all facets sequentially with moveToNextFacet */
    reset(): void;
    /** Return the point index of vertex i within the currently loaded facet */
    clientPointIndex(i: number): number;
    /** Return the param index of vertex i within the currently loaded facet */
    clientParamIndex(i: number): number;
    /** Return the normal index of vertex i within the currently loaded facet */
    clientNormalIndex(i: number): number;
    /** Return the color index of vertex i within the currently loaded facet */
    clientColorIndex(i: number): number;
    /** Return the aux data index of vertex i within the currently loaded facet */
    clientAuxIndex(i: number): number;
    /** return the client polyface */
    clientPolyface(): Polyface | undefined;
    /** Set the number of vertices to replicate in visitor arrays. */
    setNumWrap(numWrap: number): void;
    /** clear the contents of all arrays.  Use this along with `pushDataFrom` to build up new facets. */
    clearArrays(): void;
    /** transfer data from a specified index of the other visitor as new data in this visitor. */
    pushDataFrom(other: PolyfaceVisitor, index: number): void;
    /** transfer interpolated data from the other visitor.
     * * all data values are interpolated at `fraction` between `other` values at index0 and index1.
     */
    pushInterpolatedDataFrom(other: PolyfaceVisitor, index0: number, fraction: number, index1: number): void;
}
