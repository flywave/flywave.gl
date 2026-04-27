import { ClipPlane } from "../clipping/clip-plane";
import { ConvexClipPlaneSet } from "../clipping/convex-clip-plane-set";
import { UnionOfConvexClipPlaneSets } from "../clipping/union-of-convex-clip-plane-sets";
import { type AnyRegion } from "../curve/curve-types";
import { LineString3d } from "../curve/line-string3d";
import { type StrokeOptions } from "../curve/stroke-options";
import { type PlaneAltitudeEvaluator } from "../geometry";
import { Vector3d } from "../geometry3d/point3d-vector3d";
import { type IndexedPolyface, type PolyfaceVisitor, Polyface } from "./polyface";
import { PolyfaceBuilder } from "./polyface-builder";
/**
 * A pair of PolyfaceBuilder objects, for use by clippers that emit inside and outside parts.
 * * There are nominally 4 builders:
 *   * builderA collects simple "inside" clip.
 *   * builderB collects simple "outside" clip.
 *   * builderA1 collects "side" clip for inside.
 *   * builderB1 collets "side" clip for outside.
 * * `static ClippedPolyfaceBuilders.create(keepInside, keepOutside)` initializes `builderA` and `builderB` (each optionally to undefined), with undefined `builderA1` and `builderB1`
 * * `builders.enableSideBuilders()` makes `builderA1` and `builderB1` match `builderA` and `builderB`.
 * * construction methods aim their facets at appropriate builders if defined.
 * * @public
 */
export declare class ClippedPolyfaceBuilders {
    /** An available builder.  Typically the "inside" parts */
    builderA?: PolyfaceBuilder;
    /** An available builder.  Typically the "outside" parts */
    builderB?: PolyfaceBuilder;
    /** request to construct cut faces */
    buildClosureFaces?: boolean;
    private constructor();
    /** Simple create with default options on builder. */
    static create(keepInside?: boolean, keepOutside?: boolean, buildSideFaces?: boolean): ClippedPolyfaceBuilders;
    claimPolyface(selector: 0 | 1, fixup: boolean, tolerance?: number): IndexedPolyface | undefined;
}
/** PolyfaceClip is a static class gathering operations using Polyfaces and clippers.
 * @public
 */
export declare class PolyfaceClip {
    /** Clip each facet of polyface to the ClipPlane.
     * * Return all surviving clip as a new mesh.
     * * WARNING: The new mesh is "points only" -- parameters, normals, etc are not interpolated
     */
    static clipPolyfaceClipPlaneWithClosureFace(polyface: Polyface, clipper: ClipPlane, insideClip?: boolean, buildClosureFaces?: boolean): Polyface;
    /** Clip each facet of polyface to the ClipPlane.
     * * Return all surviving clip as a new mesh.
     * * WARNING: The new mesh is "points only" -- parameters, normals, etc are not interpolated
     */
    static clipPolyfaceClipPlane(polyface: Polyface, clipper: ClipPlane, insideClip?: boolean, buildClosureFaces?: boolean): Polyface;
    /** Clip each facet of polyface to the ClipPlane.
     * * Return surviving clip as a new mesh.
     * * WARNING: The new mesh is "points only".
     */
    static clipPolyfaceConvexClipPlaneSet(polyface: Polyface, clipper: ConvexClipPlaneSet): Polyface;
    /** Clip each facet of polyface to the the clippers.
     * * Add inside, outside fragments to builderA, builderB
     * * This does not consider params, normals, colors.  Just points.
     * * outputSelect determines how the clip output is structured
     *   * 0 outputs all shards -- this may have many interior edges.
     *   * 1 stitches shards together to get cleaner facets.
     */
    static clipPolyfaceUnionOfConvexClipPlaneSetsToBuilders(polyface: Polyface | PolyfaceVisitor, allClippers: UnionOfConvexClipPlaneSets, destination: ClippedPolyfaceBuilders, outputSelector?: number): void;
    private static addRegion;
    private static cleanupAndAddRegion;
    private static addPolygonToBuilderAndDropToCache;
    private static addPolygonArrayToBuilderAndDropToCache;
    private static createChainContextsForConvexClipPlaneSet;
    /** Clip each facet of polyface to the the clippers.
     * * Add inside, outside fragments to builderA, builderB
     * * This does not consider params, normals, colors.  Just points.
     * @internal
     */
    static clipPolyfaceConvexClipPlaneSetToBuilders(polyface: Polyface, clipper: ConvexClipPlaneSet, destination: ClippedPolyfaceBuilders): void;
    /**
     *
     * @param visitor visitor for all facets of interest (entire polyface)
     * @param clipper ConvexClipPlaneSet to apply
     * @param destination builders to receive inside, outside parts
     * @param cache GrowableArray cache.
     */
    private static buildClosureFacesForConvexSet;
    /**
     *
     * @param visitor visitor for all facets of interest (entire polyface)
     * @param clipper ConvexClipPlaneSet to apply
     * @param destination builders to receive inside, outside parts
     * @param cache GrowableArray cache.
     */
    private static buildClosureFacesForPlane;
    private static evaluateInwardPlaneNormal;
    /**
     * * Triangulate the contour.
     * * Add all the triangles to both builders
     * * reversed in builderB.
     */
    private static addClippedContour;
    /**
     * Gather loops out of the ChainMergeContext.  Add to destination arrays.
     * @param chainContext ASSUMED TO HAVE A PLANE
     * @param destination
     */
    private static addClosureFacets;
    /** Clip each facet of polyface to the the clippers.
     * * Add inside, outside fragments to builderA, builderB
     * * This does not consider params, normals, colors.  Just points.
     * @internal
     */
    static clipPolyfaceClipPlaneToBuilders(polyface: Polyface, clipper: PlaneAltitudeEvaluator, destination: ClippedPolyfaceBuilders): void;
    /** Clip each facet of polyface to the ClipPlane or ConvexClipPlaneSet
     * * accumulate inside and outside facets -- to destination.builderA and destination.builderB
     * * if `destination.buildClosureFaces` is set, and also build closure facets
     * * This method parses  the variant input types and calls a more specific method.
     * * WARNING: The new mesh is "points only".
     * * outputSelect applies only for UnionOfConvexClipPlaneSets -- see [[PolyfaceClip.clipPolyfaceUnionOfConvexClipPlaneSetsToBuilders]]
     */
    static clipPolyfaceInsideOutside(polyface: Polyface, clipper: ClipPlane | ConvexClipPlaneSet | UnionOfConvexClipPlaneSets, destination: ClippedPolyfaceBuilders, outputSelect?: number): void;
    /** Clip each facet of polyface to the ClipPlane or ConvexClipPlaneSet
     * * This method parses the variant input types and calls a more specific method.
     * * To get both inside and outside parts, use clipPolyfaceInsideOutside
     * * WARNING: The new mesh is "points only".
     */
    static clipPolyface(polyface: Polyface, clipper: ClipPlane | ConvexClipPlaneSet): Polyface | undefined;
    /**
     * Drape the region onto the mesh.
     * * This method computes the portion of the input mesh that lies inside the clipper generated from sweeping the input region in the given direction.
     * @param mesh input mesh, untouched
     * @param region planar region to drape onto mesh
     * @param sweepVector optional sweep direction for region, magnitude unused. If undefined, sweep is along the region normal.
     * @param options how to stroke the region boundary
     * @returns clipped facets. No other mesh data but vertices appear in output.
     */
    static drapeRegion(mesh: Polyface | PolyfaceVisitor, region: AnyRegion, sweepVector?: Vector3d, options?: StrokeOptions): IndexedPolyface | undefined;
    /** Find consecutive points around a polygon (with implied closure edge) that are ON a plane
     * @param points array of points around polygon.  Closure edge is implied.
     * @param chainContext context receiving edges
     * @param point0 work point
     * @param point1 work point
     */
    private static collectEdgesOnPlane;
    /** Intersect each facet with the clip plane. (Producing intersection edges.)
     * * Return all edges  chained as array of LineString3d.
     */
    static sectionPolyfaceClipPlane(polyface: Polyface, clipper: ClipPlane): LineString3d[];
    /**
     * * Split facets of mesh "A" into parts that are
     *     * under mesh "B"
     *     * over mesh "B"
     * * both meshes are represented by visitors rather than the meshes themselves
     *     * If the data in-hand is a mesh, call with `mesh.createVisitor`
     * * The respective clip parts are fed to caller-supplied builders.
     *    * Caller may set either or both builders to toggle facet order (e.g. toggle the lower facets to make them "point down" in cut-fill application)
     *    * This step is commonly one-half of "cut fill".
     *       * A "cut fill" wrapper will call this twice with the visitor and builder roles reversed.
     * * Both polyfaces are assumed convex with CCW orientation viewed from above.
     * @param visitorA iterator over polyface to be split.
     * @param visitorB iterator over polyface that acts as a splitter
     * @param orientUnderMeshDownward if true, the "meshAUnderB" output is oriented with its normals reversed so it can act as the bottom side of a cut-fill pair.
     */
    static clipPolyfaceUnderOverConvexPolyfaceIntoBuilders(visitorA: PolyfaceVisitor, visitorB: PolyfaceVisitor, builderAUnderB: PolyfaceBuilder | undefined, builderAOverB: PolyfaceBuilder | undefined): void;
    /**
     * * Split facets into vertically overlapping sections
     * * both meshes are represented by visitors rather than the meshes themselves
     *     * If the data in-hand is a mesh, call with `mesh.createVisitor`
     * * The respective clip parts are returned as separate meshes.
     *    * Caller may set either or both builders to toggle facet order (e.g. toggle the lower facets to make them "point down" in cut-fill application)
     * * Both polyfaces are assumed convex with CCW orientation viewed from above.
     * * Each output contains some facets from meshA and some from meshB:
     *    * meshAUnderB -- areas where meshA is underneath mesh B.
     *        * If A is "design surface" and B is existing DTM, this is "cut" volume
     *    * meshAOverB  -- areas where meshB is over meshB.
     *        * If A is "design surface" and B is existing DTM, this is "fill" volume
     *
     * @param visitorA iterator over polyface to be split.
     * @param visitorB iterator over polyface that acts as a splitter
     * @param orientUnderMeshDownward if true, the "meshAUnderB" output is oriented with its normals reversed so it can act as the bottom side of a cut-fill pair.
     */
    static computeCutFill(meshA: IndexedPolyface, meshB: IndexedPolyface): {
        meshAUnderB: IndexedPolyface;
        meshAOverB: IndexedPolyface;
    };
}
