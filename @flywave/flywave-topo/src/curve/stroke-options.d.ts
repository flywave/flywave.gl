import { Angle } from "../geometry3d/angle";
/**
 * Tolerance blob for various stroking methods.
 *
 * * Across many applications, the critical concepts are:   chordTol, angleTol, maxEdgeLength
 *   * Chord error is an distance measured from a curve or facet to its approximating stroke or facet.
 *   * angle is the angle between two contiguous strokes or across a facet edge.
 *   * maxEdgeLength is the length of a stroke or a edge of a facet.
 * * It is rare for all three to be active at once.
 * * Nearly all stroke and facet use cases will apply an angle tolerance.
 *   * For curves, 15 degrees is typical
 *   * For facets, 22.5 degrees is typical.
 *   * Halving the angle tolerance will (roughly) make curves get twice as many strokes, and surfaces get 4 times as many facets.
 *   * The angle tolerance has the useful property that its effect is independent of scale of that data.  If data is suddenly scaled into millimeters rather than meters, the facet counts remain the same.
 * * When creating output for devices such as 3D printing will want a chord tolerance.
 * * For graphics display, use an angle tolerance of around 15 degrees and an chord tolerance which is the size of several pixels.
 * * Analysis meshes (e.g. Finite Elements) commonly need to apply maxEdgeLength.
 *   * Using maxEdgeLength for graphics probably produces too many facets.   For example, it causes long cylinders to get many nearly-square facets instead of the small number of long quads usually used for graphics.
 * * Facet tolerances are, as the Pirates' Code, guidelines, not absolute rules.   Facet and stroke code may ignore tolerances in awkward situations.
 * * If multiple tolerances are in effect, the actual count will usually be based on the one that demands the most strokes or facets, unless it is so high that it violates some upper limit on the number of facets on an arc or a section of a curve.
 * @public
 */
export declare class StrokeOptions {
    /** Distance from stroke to actual geometry */
    chordTol?: number;
    /** Turning angle between strokes. */
    angleTol?: Angle;
    /** Maximum length of a single stroke. */
    maxEdgeLength?: number;
    /**
     * Caller expects convex facets.
     * @deprecated in 4.x - never used. See [[shouldTriangulate]] and [[maximizeConvexFacets]].
     */
    needConvexFacets?: boolean;
    /** Minimum strokes on a primitive */
    minStrokesPerPrimitive?: number;
    /** Whether or not to triangulate each added facet */
    shouldTriangulate: boolean;
    private _needNormals?;
    private _needTwoSided?;
    private _needParams?;
    /** Whether params are requested. */
    get needParams(): boolean;
    set needParams(value: boolean);
    /** Whether normals are requested */
    get needNormals(): boolean;
    set needNormals(value: boolean);
    /** Whether twoSided is requested. */
    get needTwoSided(): boolean;
    set needTwoSided(value: boolean);
    /** Optional color request flag */
    needColors?: boolean;
    /** Default number of strokes for a circle. */
    defaultCircleStrokes: number;
    /** Ask if angleTol is specified */
    get hasAngleTol(): boolean;
    /** Ask if chordTol is specified */
    get hasChordTol(): boolean;
    /** Ask if maxEdgeLength is specified */
    get hasMaxEdgeLength(): boolean;
    private _maximizeConvexFacets?;
    /**
     * Whether to post-process a planar triangulation by removing edges to maximize the size of convex facets.
     * * Setting this to true also sets [[shouldTriangulate]] to true.
     */
    get maximizeConvexFacets(): boolean;
    set maximizeConvexFacets(value: boolean);
    /** Return a deep clone  */
    clone(): StrokeOptions;
    /** Return stroke count which is the larger of the minCount or count needed for edge length condition. */
    applyMaxEdgeLength(minCount: number, totalLength: number): number;
    /**
     * Return stroke count which is the larger of the existing count or count needed for angle condition for given
     * sweepRadians.
     * * defaultStepRadians is assumed to be larger than zero.
     */
    applyAngleTol(minCount: number, sweepRadians: number, defaultStepRadians: number): number;
    /**
     * Return stroke count which is the larger of minCount and the count required to turn sweepRadians, using tolerance
     * from the options.
     */
    static applyAngleTol(options: StrokeOptions | undefined, minCount: number, sweepRadians: number, defaultStepRadians?: number): number;
    /**
     * Return the number of strokes needed for given edgeLength curve.
     * @param options
     * @param minCount smallest allowed count
     * @param edgeLength
     */
    static applyMaxEdgeLength(options: StrokeOptions | undefined, minCount: number, edgeLength: number): number;
    /**
     * Determine a stroke count for a (partial) circular arc of given radius. This considers angle, maxEdgeLength,
     * chord, and minimum stroke.
     */
    applyTolerancesToArc(radius: number, sweepRadians?: number): number;
    /** Return stroke count which is the larger of existing count or count needed for circular arc chord tolerance condition. */
    applyChordTol(minCount: number, radius: number, sweepRadians: number): number;
    /**
     * Return stroke count which is the larger of existing count or count needed for circular arc chord tol with given
     * arc length and radians
     */
    applyChordTolToLengthAndRadians(minCount: number, length: number, sweepRadians: number): number;
    /** Return stroke count which is the larger of existing count or `this.minStrokesPerPrimitive` */
    applyMinStrokesPerPrimitive(minCount: number): number;
    /**
     * Create `StrokeOptions` with defaults appropriate for curves.
     * * angle tolerance of 15 degrees.
     * * all others inactive.
     */
    static createForCurves(): StrokeOptions;
    /**
     * Create `StrokeOptions` with defaults appropriate for surfaces facets
     * * angle tolerance of 22.5 degrees.
     * * all others inactive.
     */
    static createForFacets(): StrokeOptions;
}
