import { type CurvePrimitive } from "../curve-primitive";
/**
 * Data carrier interface for per-primitive stroke counts and distances used by PolyfaceBuilder.
 * * For a simple primitive (line segment or arc) that is stroked with uniform fraction, the members are:
 *   * `numStroke` = total number of strokes
 *   * `curveLength` = length of this curve
 *   * `a0` = external mapped coordinate for fraction 0 on this primitive or component
 *   * `a1` = external mapped coordinate for fraction 1 on this primitive or component
 *
 * * For linestring and bspline curve, those numbers are totals for the overall curve, and breakdown within
 * the components (line segments or bezier spans) is recorded on the optional array `componentData[]`
 *   * Members of the array are annotated with componentIndex within the linestring or bspline curve
 * @public
 */
export declare class StrokeCountMap {
    /** Number of strokes expected in this interval. */
    numStroke: number;
    /** Length of the curve interval. */
    curveLength: number;
    /** Start coordinate (in user-defined space) for fraction 0 on this primitive or component */
    a0: number;
    /** End coordinate (in user-defined space) for fraction 0 on this primitive or component */
    a1: number;
    /** Further StrokeCountMap's within this interval (e.g. for individual segments of a linestring.) */
    componentData?: StrokeCountMap[];
    /** The curve that this map represents */
    primitive?: CurvePrimitive;
    /** This curve's index within its parent. */
    componentIndex?: number;
    /**
     * Constructor.  Initialize all fields from arguments.
     * * Callers that expect to announce numStroke and curveLength for multiple components send an empty componentData array.
     * * Callers that do not have multiple components send undefined component data.
     * @param numStroke
     * @param curveLength
     * @param a0
     * @param a1
     * @param componentData
     */
    private constructor();
    /**
     * Create a `StrokeCountMap` with curve primitive and optional componentData array.
     * @param primitive
     * @param numStroke
     * @param curveLength
     * @param a0
     * @param a1
     * @param componentData
     */
    static createWithCurvePrimitive(primitive: CurvePrimitive, numStroke: number, curveLength: number, a0: number, a1: number, componentData?: StrokeCountMap[]): StrokeCountMap;
    /**
     * Create a `StrokeCountMap` with `componentIndex` (but no primitive or componentData array)
     * @param index
     * @param numStroke
     * @param curveLength
     * @param a0
     * @param a1
     */
    static createWithComponentIndex(componentIndex?: number, numStroke?: number, curveLength?: number, a0?: number, a1?: number): StrokeCountMap;
    /**
     * Create a StrokeCountMap, optionally
     * * (a) use parent a1 as new a0
     * * (b) attach a (usually empty) array for component counts.
     * @param parentMap optional map whose a1 becomes a0 in the new map.
     * @param componentData optional array of component StrokeCountMaps.
     */
    static createWithCurvePrimitiveAndOptionalParent(curvePrimitive: CurvePrimitive, parentMap?: StrokeCountMap, componentData?: StrokeCountMap[]): StrokeCountMap;
    /**
     * Apply stroke count and curve length from a component to a parent map.
     * If componentData is present, install the new count and length with distance limits
     * @param parentMap map to be updated.
     * @param numStroke number of strokes on new child curve
     * @param curveLength curve length for new child curve.
     */
    addToCountAndLength(numStroke: number, curveLength: number): void;
    /**
     * Return true if `other` has the same component structure as `this`
     * * Testing recurses through corresponding members of componentData arrays.
     */
    isCompatibleComponentStructure(other: StrokeCountMap, enforceCounts: boolean): boolean;
    /**
     * Clone all data from root.
     * * clone componentData arrays recursively.
     */
    clone(): StrokeCountMap;
    /**
     * Interpolate in the a0,a1 mapping.
     * @param fraction fractional position between a0 and a1
     */
    fractionToA(fraction: number): number;
}
