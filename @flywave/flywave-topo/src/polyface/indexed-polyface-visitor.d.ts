import { type Point2d } from "../geometry3d/point2d-vector2d";
import { type IndexedPolyface, type Polyface, type PolyfaceVisitor } from "./polyface";
import { PolyfaceData } from "./polyface-data";
/**
 * An `IndexedPolyfaceVisitor` is an iterator-like object that "visits" facets of a mesh.
 * * The visitor extends a `PolyfaceData ` class, so it can at any time hold all the data of a single facet.
 * @public
 */
export declare class IndexedPolyfaceVisitor extends PolyfaceData implements PolyfaceVisitor {
    private _currentFacetIndex;
    private _nextFacetIndex;
    private _numWrap;
    private _numEdges;
    private readonly _polyface;
    protected constructor(facets: IndexedPolyface, numWrap: number);
    /** Return the client polyface object. */
    clientPolyface(): Polyface;
    /** Set the number of vertices duplicated (e.g. 1 for start and end) in arrays in the visitor. */
    setNumWrap(numWrap: number): void;
    /** Return the number of edges in the current facet.
     * * Note that if this visitor has `numWrap` greater than zero, the number of edges is smaller than the number of points.
     */
    get numEdgesThisFacet(): number;
    /** Create a visitor for iterating the facets of `polyface`, with indicated number of points to be added to each facet to produce closed point arrays
     * Typical wrap counts are:
     * * 0 -- leave the point arrays with "missing final edge"
     * * 1 -- add point 0 as closure point
     * * 2 -- add points 0 and 1 as closure and wrap point.  This is useful when vertex visit requires two adjacent vectors, e.g. for cross products.
     */
    static create(polyface: IndexedPolyface, numWrap: number): IndexedPolyfaceVisitor;
    /** Advance the iterator to a particular facet in the client polyface */
    moveToReadIndex(facetIndex: number): boolean;
    /** Advance the iterator to a the 'next' facet in the client polyface */
    moveToNextFacet(): boolean;
    /** Reset the iterator to start at the first facet of the polyface. */
    reset(): void;
    /**
     * Attempts to extract the distance parameter for the given vertex index on the current facet
     * Returns the distance parameter as a point. Returns undefined on failure.
     */
    tryGetDistanceParameter(index: number, result?: Point2d): Point2d | undefined;
    /**
     * Attempts to extract the normalized parameter (0,1) for the given vertex index on the current facet.
     * Returns the normalized parameter as a point. Returns undefined on failure.
     */
    tryGetNormalizedParameter(index: number, result?: Point2d): Point2d | undefined;
    /** Return the index (in the client polyface) of the current facet */
    currentReadIndex(): number;
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
    /** clear the contents of all arrays.  Use this along with transferDataFrom methods to build up new facets */
    clearArrays(): void;
    /** transfer data from a specified index of the other visitor as new data in this visitor. */
    pushDataFrom(other: PolyfaceVisitor, index: number): void;
    /** transfer interpolated data from the other visitor.
     * * all data values are interpolated at `fraction` between `other` values at index0 and index1.
     */
    pushInterpolatedDataFrom(other: PolyfaceVisitor, index0: number, fraction: number, index1: number): void;
}
/**
 * Interpolate each byte of color0 and color1 as integers.
 * @param color0 32 bit color (e.g. rgb+transparency)
 * @param fraction fractional position.  This is clamped to 0..1 to prevent byte values outside their 0..255 range.
 * @param color1
 * @param shiftBits
 * @internal
 */
export declare function interpolateColor(color0: number, fraction: number, color1: number): number;
/**
 * An `IndexedPolyfaceSubsetVisitor` is an IndexedPolyfaceVisitor which only visits a subset of facets in the polyface.
 * * The subset is defined by an array of facet indices provided when this visitor is created.
 * * Within the subset visitor, "facetIndex" is understood as index within the subset array:
 *   * moveToNextFacet moves only within the subset
 *   * moveToReadIndex(i) moves underlying visitor's parentFacetIndex(i)
 * @public
 */
export declare class IndexedPolyfaceSubsetVisitor extends IndexedPolyfaceVisitor {
    private readonly _parentFacetIndices;
    private _nextActiveIndex;
    private constructor();
    /** Create a visitor for iterating a subset of the facets of `polyface`, with indicated number of points to be added to each facet to produce closed point arrays
     * * Typical wrap counts are:
     *   * 0 -- leave the point arrays with "missing final edge"
     *   * 1 -- add point 0 as closure point
     *   * 2 -- add points 0 and 1 as closure and wrap point.  This is useful when vertex visit requires two adjacent vectors, e.g. for cross products.
     * * The activeFacetIndices array indicates all facets to be visited.
     */
    static createSubsetVisitor(polyface: IndexedPolyface, activeFacetIndices: number[], numWrap: number): IndexedPolyfaceSubsetVisitor;
    /** Advance the iterator to a particular facet in the client polyface */
    moveToReadIndex(activeIndex: number): boolean;
    /** Advance the iterator to a the 'next' facet in the client polyface */
    moveToNextFacet(): boolean;
    /** Reset the iterator to start at the first facet of the polyface. */
    reset(): void;
    /** return the parent facet index of the indicated index within the active facets */
    parentFacetIndex(activeIndex: number): number | undefined;
}
