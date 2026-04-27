import { type PlaneAltitudeEvaluator } from "../geometry";
import { Angle } from "../geometry3d/angle";
import { AngleSweep } from "../geometry3d/angle-sweep";
import { type Ellipsoid, type GeodesicPathPoint } from "../geometry3d/ellipsoid";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Ray3d } from "../geometry3d/ray3d";
import { type XAndY } from "../geometry3d/xyz-props";
import { type IndexedPolyface } from "../polyface/polyface";
import { RuledSweep } from "../solid/ruled-sweep";
import { Arc3d } from "./arc3d";
import { CurveChain } from "./curve-collection";
import { CurvePrimitive } from "./curve-primitive";
import { type AnyCurve } from "./curve-types";
import { GeometryQuery } from "./geometry-query";
import { LineString3d } from "./line-string3d";
import { Loop } from "./loop";
import { Path } from "./path";
import { type IntegratedSpiralTypeName } from "./spiral/transition-spiral3d";
import { type StrokeOptions } from "./stroke-options";
/**
 * Interface to carry parallel arrays of planes and sections, and optional geometry assembled from them, as returned by [CurveFactory.createMiteredSweepSections].
 * @public
 */
export interface SectionSequenceWithPlanes {
    /** the plane of each section */
    planes: Plane3dByOriginAndUnitNormal[];
    /** section curve projected onto the corresponding plane */
    sections: AnyCurve[];
    /**
     * Optional `RuledSweep` generated from the sections.
     * * The `RuledSweep` and sections array refer to the same section objects.
     */
    ruledSweep?: RuledSweep;
    /** Optional mesh generated from the `RuledSweep` generated from the sections. */
    mesh?: IndexedPolyface;
}
/**
 * Enumeration of geometric output for [CurveFactory.createMiteredSweepSections].
 * @public
 */
export declare enum MiteredSweepOutputSelect {
    /** Output only the parallel arrays of planes and sections. */
    Sections = 0,
    /** Output planes and sections, as well as the assembled ruled sweep. */
    AlsoRuledSweep = 1,
    /** Output planes and sections, as well as the assembled ruled sweep and its stroked mesh. */
    AlsoMesh = 2
}
/**
 * Interface bundling options for [CurveFactory.createMiteredSweepSections].
 * @public
 */
export interface MiteredSweepOptions {
    /** Whether first and last planes are averaged and equated when the centerline is physically closed. Default value is `false`. */
    wrapIfPhysicallyClosed?: boolean;
    /** Whether to output sections only, or sections plus optional geometry constructed from them. Default value is `MiteredSweepOutputSelect.Sections`. */
    outputSelect?: MiteredSweepOutputSelect;
    /** How to stroke the ruled sweep if outputting a mesh. If undefined, default stroke options are used. */
    strokeOptions?: StrokeOptions;
    /** Whether to cap the ruled sweep if outputting a ruled sweep or mesh. Default value is `false`. */
    capped?: boolean;
}
/**
 * The `CurveFactory` class contains methods for specialized curve constructions.
 * @public
 */
export declare class CurveFactory {
    /** (cautiously) construct and save a line segment between fractional positions. */
    private static addPartialSegment;
    /**
     * Create a circular arc from start point, tangent at start, and another point (endpoint) on the arc.
     * @param pointA
     * @param tangentA
     * @param pointB
     */
    static createArcPointTangentPoint(pointA: Point3d, tangentA: Vector3d, pointB: Point3d): Arc3d | undefined;
    /**
     * Construct a sequence of alternating lines and arcs with the arcs creating tangent transition between consecutive edges.
     *  * If the radius parameter is a number, that radius is used throughout.
     *  * If the radius parameter is an array of numbers, `radius[i]` is applied at `point[i]`.
     *    * Note that since no fillet is constructed at the initial or final point, those entries in `radius[]` are never referenced.
     *    * A zero radius for any point indicates to leave the as a simple corner.
     * @param points point source
     * @param radius fillet radius or array of radii indexed to correspond to the points.
     * @param allowBackupAlongEdge true to allow edges to be created going "backwards" along edges if needed to create the blend.
     */
    static createFilletsInLineString(points: LineString3d | IndexedXYZCollection | Point3d[], radius: number | number[], allowBackupAlongEdge?: boolean): Path | undefined;
    /** Create a `Loop` with given xy corners and fixed z.
     * * The corners always proceed counter clockwise from lower left.
     * * If the radius is too large for the outer rectangle size, it is reduced to half of the the smaller x or y size.
     */
    static createRectangleXY(x0: number, y0: number, x1: number, y1: number, z?: number, filletRadius?: number): Loop;
    /**
     * If `arcB` is a continuation of `arcA`, extend `arcA` (in place) to include the range of `arcB`
     * * This only succeeds if the two arcs are part of identical complete arcs and end of `arcA` matches the beginning of `arcB`.
     * * "Reversed"
     * @param arcA
     * @param arcB
     */
    static appendToArcInPlace(arcA: Arc3d, arcB: Arc3d, allowReverse?: boolean): boolean;
    /**
     * Return a `Path` containing arcs are on the surface of an ellipsoid and pass through a sequence of points.
     * * Each arc passes through the two given endpoints and in the plane containing the true surface normal at given `fractionForIntermediateNormal`
     * @param ellipsoid
     * @param pathPoints
     * @param fractionForIntermediateNormal fractional position for surface normal used to create the section plane.
     */
    static assembleArcChainOnEllipsoid(ellipsoid: Ellipsoid, pathPoints: GeodesicPathPoint[], fractionForIntermediateNormal?: number): Path;
    private static appendGeometryQueryArray;
    /**
     * Create solid primitives for pipe segments (e.g. Cone or TorusPipe) around line and arc primitives.
     * @param centerline centerline geometry/
     * @param pipeRadius radius of pipe.
     */
    static createPipeSegments(centerline: CurvePrimitive | CurveChain, pipeRadius: number): GeometryQuery | GeometryQuery[] | undefined;
    /**
     * * Create section arcs for mitered pipe.
     * * At each end of each pipe, the pipe is cut by the plane that bisects the angle between successive pipe centerlines.
     * * The arc definitions are constructed so that lines between corresponding fractional positions on the arcs are
     *     axial lines on the pipes.
     * * This means that each arc definition axes (aka vector0 and vector90) are _not_ perpendicular to each other.
     * * Circular or elliptical pipe cross sections can be specified by supplying either a radius, a pair of semi-axis lengths, or a full Arc3d.
     *    * For semi-axis length input, x corresponds to an ellipse local axis nominally situated parallel to the xy-plane.
     *    * The center of Arc3d input is translated to the centerline start point to act as initial cross section.
     * @param centerline centerline of pipe
     * @param sectionData circle radius, ellipse semi-axis lengths, or full Arc3d
     */
    static createMiteredPipeSections(centerline: IndexedXYZCollection, sectionData: number | XAndY | Arc3d): Arc3d[];
    /**
     * Sweep the initialSection along each segment of the centerLine until it hits the bisector plane at the next vertex.
     * * The caller should place the initialSection on a plane perpendicular to the first edge.
     *   * This plane is commonly (but not necessarily) through the start point itself.
     *   * If the geometry is not "on a perpendicular plane", the output geometry will still be flattened onto the various planes.
     * * In the "open path" case (i.e when wrapIfPhysicallyClosed is false or the path does not have matched first and last points)
     *       the first/last output plane will be at the start/end of the first/last edge and on a perpendicular plane.
     * * In the "closed path" case, the output plane for the first and last point is the bisector of the start and end planes from the "open path" case,
     *    and the first/last section geometry may be different from `initialSection`.
     * * The centerline path does NOT have to be planar, however twisting effects effects will appear in the various bisector planes.
     * @param centerline sweep path, e.g., as stroked from a smooth centerline curve
     * @param initialSection profile curve to be swept. As noted above, this should be on a plane perpendicular to the first segment of the centerline.
     * @param options options for computation and output
     * @return array of sections, starting with `initialSection` projected along the first edge to the first plane.
     */
    static createMiteredSweepSections(centerline: IndexedXYZCollection | Point3d[], initialSection: AnyCurve, options: MiteredSweepOptions): SectionSequenceWithPlanes | undefined;
    /**
     * Create a circular arc from start point, tangent at start, radius, optional plane normal, arc sweep
     * * The vector from start point to center is in the direction of upVector crossed with tangentA.
     * @param pointA start point
     * @param tangentA vector in tangent direction at the start
     * @param radius signed radius.
     * @param upVector optional out-of-plane vector.  Defaults to positive Z
     * @param sweep angular range.  If single `Angle` is given, start angle is at 0 degrees (the start point).
     *
     */
    static createArcPointTangentRadius(pointA: Point3d, tangentA: Vector3d, radius: number, upVector?: Vector3d, sweep?: Angle | AngleSweep): Arc3d | undefined;
    /**
     * Compute 2 spirals (all in XY) for a symmetric line-to-line transition.
     * * First spiral begins at given start point.
     * * first tangent aims at shoulder
     * * outbound spiral joins line from shoulder to target.
     * @param spiralType name of spiral type.  THIS MUST BE AN "Integrated" SPIRAL TYPE
     * @param startPoint inbound start point.
     * @param shoulder point target point for (both) spiral-to-line tangencies
     * @return array with the computed spirals, or undefined if failure.
     */
    static createLineSpiralSpiralLine(spiralType: IntegratedSpiralTypeName, startPoint: Point3d, shoulderPoint: Point3d, targetPoint: Point3d): GeometryQuery[] | undefined;
    /**
     * Compute 2 spirals (all in XY) for a symmetric line-to-line transition.
     * * Spiral length is given.
     * * tangency points float on both lines.
     * @param spiralType name of spiral type.  THIS MUST BE AN "Integrated" SPIRAL TYPE
     * @param pointA inbound start point.
     * @param shoulder point target point for (both) spiral-to-line tangencies
     * @param spiralLength for each part of the spiral pair.
     * @return array with the computed spirals, or undefined if failure.
     */
    static createLineSpiralSpiralLineWithSpiralLength(spiralType: IntegratedSpiralTypeName, pointA: Point3d, pointB: Point3d, pointC: Point3d, spiralLength: number): GeometryQuery[] | undefined;
    /**
     * Compute 2 spirals and an arc (all in XY) for a symmetric line-to-line transition.
     * Spiral lengths and arc radius are given.   (e.g. from design speed standards.)
     * @param spiralType name of spiral type.  THIS MUST BE AN "Integrated" SPIRAL TYPE
     * @param pointA inbound start point.
     * @param pointB shoulder (target)  point for (both) spiral-to-line tangencies
     * @param lengthA inbound spiral length
     * @param lengthB outbound spiral length
     * @return array with the computed spirals, or undefined if failure.
     */
    static createLineSpiralArcSpiralLine(spiralType: IntegratedSpiralTypeName, pointA: Point3d, pointB: Point3d, pointC: Point3d, lengthA: number, lengthB: number, arcRadius: number): GeometryQuery[] | undefined;
    /**
     * Return the intersection point of 3 planes.
     * @param planeA
     * @param planeB
     * @param planeC
     */
    static planePlaneIntersectionRay(planeA: PlaneAltitudeEvaluator, planeB: PlaneAltitudeEvaluator): Ray3d | undefined;
}
