import { UnionOfConvexClipPlaneSets } from "../clipping/union-of-convex-clip-plane-sets";
import { type CurveCollection } from "../curve/curve-collection";
import { type AnyCurve } from "../curve/curve-types";
import { StrokeOptions } from "../curve/stroke-options";
import { type Vector3d } from "../geometry3d/point3d-vector3d";
import { type Ray3d } from "../geometry3d/ray3d";
import { type Transform } from "../geometry3d/transform";
import { type IndexedPolyface } from "../polyface/polyface";
import { type PolyfaceBuilder } from "../polyface/polyface-builder";
import { type MultiLineStringDataVariant } from "../topology/triangulation";
/**
 * Sweepable planar contour with Transform for local to world interaction.
 * * The surface/solid classes `LinearSweep`, `RotationalSweep`, `RuledSweep` use this for their swept contours.
 * @public
 */
export declare class SweepContour {
    /** The underlying curve collection, in its world coordinates position. */
    curves: CurveCollection;
    /** coordinate frame that in which the curves are all in the xy plane. */
    localToWorld: Transform;
    /** Axis used only in rotational case. */
    axis: Ray3d | undefined;
    /** caches */
    private _xyStrokes?;
    private _facets?;
    private constructor();
    /** Create for linear sweep.
     * @param contour curve to sweep, CAPTURED. For best results, contour should be planar.
     * @param defaultNormal optional default normal for guiding coordinate frame setup.
     */
    static createForLinearSweep(contour: AnyCurve, defaultNormal?: Vector3d): SweepContour | undefined;
    /** Create for linear sweep.
     * @param points polygon to sweep, CAPTURED as a Loop. Closure point is optional. If multiple polygons are passed in, parity logic is employed.
     * For best results, all points should be coplanar.
     * @param defaultNormal optional default normal for guiding coordinate frame setup.
     */
    static createForPolygon(points: MultiLineStringDataVariant, defaultNormal?: Vector3d): SweepContour | undefined;
    /** Create for rotational sweep.
     * @param contour curve to sweep, CAPTURED. For best results, contour should be planar.
     * @param axis rotation axis
     */
    static createForRotation(contour: AnyCurve, axis: Ray3d): SweepContour | undefined;
    /** Return (Reference to) the curves */
    getCurves(): CurveCollection;
    /**
     * Apply `transform` to the curves, axis.
     * * The local to world frame is reconstructed for the transformed curves.
     */
    tryTransformInPlace(transform: Transform): boolean;
    /** Return a deep clone. */
    clone(): SweepContour;
    /** Return a transformed clone. */
    cloneTransformed(transform: Transform): SweepContour | undefined;
    /** Test for near equality of curves, frame, and axis. */
    isAlmostEqual(other: any): boolean;
    /** Recompute the local strokes cache for this contour */
    computeXYStrokes(options?: StrokeOptions): void;
    /** Return cached contour strokes */
    get xyStrokes(): CurveCollection | undefined;
    /**
     * Build the (cached) internal facets for the contour.
     * @param options primarily how to stroke the contour, but also how to facet it.
     * * By default, a triangulation is computed, but if `options.maximizeConvexFacets === true`, edges between coplanar triangles are removed to return maximally convex facets.
     */
    buildFacets(options?: StrokeOptions): void;
    /**
     * Delete facet cache.
     * * This protects against PolyfaceBuilder reusing facets constructed with different options settings.
     */
    purgeFacets(): void;
    /** Emit facets to a builder.
     * This method may cache and reuse facets over multiple calls.
     */
    emitFacets(builder: PolyfaceBuilder, reverse: boolean, transform?: Transform): void;
    /** Emit facets to a function
     * This method may cache and reuse facets over multiple calls.
     * @param announce callback to receive the facet set
     * @param options how to stroke the contour
     */
    announceFacets(announce: (facets: IndexedPolyface) => void, options?: StrokeOptions): void;
    /**
     * Create a UnionOfConvexClipPlaneSets that clips to the swept faceted contour region.
     * @param sweepVector the sweep direction and distance:
     * * If undefined, the sweep direction is along the contour normal and no caps are constructed (the sweep is infinite in both directions).
     * * If defined, the returned clipper is inverted if and only if sweepVector is in the opposite half-space as the computed contour normal.
     * @param cap0 construct a clip plane equal to the contour plane. Note that `sweepVector` must be defined.
     * @param cap1 construct a clip plane parallel to the contour plane at the end of `sweepVector`.
     * @param options how to stroke the contour
     * @returns clipper defined by faceting then sweeping the contour region
     */
    sweepToUnionOfConvexClipPlaneSets(sweepVector?: Vector3d, cap0?: boolean, cap1?: boolean, options?: StrokeOptions): UnionOfConvexClipPlaneSets | undefined;
}
