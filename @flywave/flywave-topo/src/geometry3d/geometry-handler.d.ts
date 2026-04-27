import { type AkimaCurve3d } from "../bspline/akima-curve3d";
import { type BezierCurveBase } from "../bspline/bezier-curve-base";
import { type BezierCurve3d } from "../bspline/bezier-curve3d";
import { type BezierCurve3dH } from "../bspline/bezier-curve3d-homogeneous";
import { type BSplineCurve3d } from "../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../bspline/bspline-curve3d-homogeneous";
import { type BSplineSurface3d, type BSplineSurface3dH } from "../bspline/bspline-surface";
import { type InterpolationCurve3d } from "../bspline/interpolation-curve3d";
import { type Arc3d } from "../curve/arc3d";
import { type CoordinateXYZ } from "../curve/coordinate-xyz";
import { type CurveChainWithDistanceIndex } from "../curve/curve-chain-with-distance-index";
import { type BagOfCurves, type CurveCollection } from "../curve/curve-collection";
import { type CurvePrimitive } from "../curve/curve-primitive";
import { type GeometryQuery } from "../curve/geometry-query";
import { type LineSegment3d } from "../curve/line-segment3d";
import { type LineString3d } from "../curve/line-string3d";
import { Loop } from "../curve/loop";
import { type ParityRegion } from "../curve/parity-region";
import { Path } from "../curve/path";
import { type PointString3d } from "../curve/point-string3d";
import { type TransitionSpiral3d } from "../curve/spiral/transition-spiral3d";
import { type UnionRegion } from "../curve/union-region";
import { type IndexedPolyface } from "../polyface/polyface";
import { type Box } from "../solid/box";
import { type Cone } from "../solid/cone";
import { type LinearSweep } from "../solid/linear-sweep";
import { type RotationalSweep } from "../solid/rotational-sweep";
import { type RuledSweep } from "../solid/ruled-sweep";
import { type Sphere } from "../solid/sphere";
import { type TorusPipe } from "../solid/torus-pipe";
import { type Plane3dByOriginAndVectors } from "./plane3d-by-origin-and-vectors";
import { type Vector2d } from "./point2d-vector2d";
import { type Point3d, type Vector3d } from "./point3d-vector3d";
/**
 * `GeometryHandler` defines the base abstract methods for double-dispatch geometry computation.
 * * User code that wants to handle one or all of the commonly known geometry types implements a handler class.
 * * User code that does not handle all types is most likely to start with `NullGeometryHandler`, which will provide
 * No-action implementations for all types.
 * @public
 */
export declare abstract class GeometryHandler {
    /** Handle strongly typed [[LineSegment3d]] */
    abstract handleLineSegment3d(g: LineSegment3d): any;
    /** Handle strongly typed  [[LineString3d]]  */
    abstract handleLineString3d(g: LineString3d): any;
    /** Handle strongly typed  [[Arc3d]]  */
    abstract handleArc3d(g: Arc3d): any;
    /** Handle strongly typed  [[CurveCollection]]  */
    handleCurveCollection(_g: CurveCollection): any;
    /** Handle strongly typed  [[BSplineCurve3d]]  */
    abstract handleBSplineCurve3d(g: BSplineCurve3d): any;
    /** Handle strongly typed  [[InterpolationCurve3d]]  */
    abstract handleInterpolationCurve3d(g: InterpolationCurve3d): any;
    /** Handle strongly typed  [[AkimaCurve3d]]  */
    abstract handleAkimaCurve3d(g: AkimaCurve3d): any;
    /** Handle strongly typed  [[BSplineCurve3dH]]  */
    abstract handleBSplineCurve3dH(g: BSplineCurve3dH): any;
    /** Handle strongly typed  [[BSplineSurface3d]]  */
    abstract handleBSplineSurface3d(g: BSplineSurface3d): any;
    /** Handle strongly typed  [[CoordinateXYZ]]  */
    abstract handleCoordinateXYZ(g: CoordinateXYZ): any;
    /** Handle strongly typed  [[BSplineSurface3dH]]  */
    abstract handleBSplineSurface3dH(g: BSplineSurface3dH): any;
    /** Handle strongly typed  [[IndexedPolyface]]  */
    abstract handleIndexedPolyface(g: IndexedPolyface): any;
    /** handle strongly typed [[TransitionSpiral3d]] */
    abstract handleTransitionSpiral(g: TransitionSpiral3d): any;
    /** Handle strongly typed [[Path]] (base class method calls [[handleCurveCollection]]) */
    handlePath(g: Path): any;
    /** Handle strongly typed [[Loop]] (base class method calls [[handleCurveCollection]]) */
    handleLoop(g: Loop): any;
    /** Handle strongly typed [[ParityRegion]] (base class method calls [[handleCurveCollection]]) */
    handleParityRegion(g: ParityRegion): any;
    /** Handle strongly typed [[UnionRegion]] (base class method calls [[handleCurveCollection]]) */
    handleUnionRegion(g: UnionRegion): any;
    /** Handle strongly typed [[BagOfCurves]] (base class method calls [[handleCurveCollection]]) */
    handleBagOfCurves(g: BagOfCurves): any;
    /** Handle strongly typed [[CurveChainWithDistanceIndex]] (base class method calls [[handlePath]] or [[handleLoop]]) */
    handleCurveChainWithDistanceIndex(g: CurveChainWithDistanceIndex): any;
    /** Handle strongly typed  Sphere */
    abstract handleSphere(g: Sphere): any;
    /** Handle strongly typed  Cone */
    abstract handleCone(g: Cone): any;
    /** Handle strongly typed  Box */
    abstract handleBox(g: Box): any;
    /** Handle strongly typed  TorusPipe */
    abstract handleTorusPipe(g: TorusPipe): any;
    /** Handle strongly typed  LinearSweep */
    abstract handleLinearSweep(g: LinearSweep): any;
    /** Handle strongly typed  RotationalSweep */
    abstract handleRotationalSweep(g: RotationalSweep): any;
    /** Handle strongly typed  RuledSweep */
    abstract handleRuledSweep(g: RuledSweep): any;
    /** Handle strongly typed  PointString3d */
    abstract handlePointString3d(g: PointString3d): any;
    /** Handle strongly typed  BezierCurve3d */
    abstract handleBezierCurve3d(g: BezierCurve3d): any;
    /** Handle strongly typed  BezierCurve3dH */
    abstract handleBezierCurve3dH(g: BezierCurve3dH): any;
}
/**
 * `NullGeometryHandler` is a base class for dispatching various geometry types to application specific implementation
 * of some service.
 * To use:
 * * Derive a class from `NullGeometryHandler`
 * * Re-implement any or all of the specific `handleXXXX` methods
 * * Create a handler instance `myHandler`
 * * To send a `GeometryQuery` object `candidateGeometry` through the (fast) dispatch, invoke
 * `candidateGeometry.dispatchToHandler (myHandler).
 * * The appropriate method or methods will get called with a strongly typed `_g ` value.
 * @public
 */
export declare class NullGeometryHandler extends GeometryHandler {
    /** No-action implementation */
    handleLineSegment3d(_g: LineSegment3d): any;
    /** No-action implementation */
    handleLineString3d(_g: LineString3d): any;
    /** No-action implementation */
    handleArc3d(_g: Arc3d): any;
    /** No-action implementation */
    handleCurveCollection(_g: CurveCollection): any;
    /** No-action implementation */
    handleCurveChainWithDistanceIndex(_g: CurveChainWithDistanceIndex): any;
    /** No-action implementation */
    handleBSplineCurve3d(_g: BSplineCurve3d): any;
    /** No-action implementation */
    handleInterpolationCurve3d(_g: InterpolationCurve3d): any;
    /** No-action implementation */
    handleAkimaCurve3d(_g: AkimaCurve3d): any;
    /** No-action implementation */
    handleBSplineCurve3dH(_g: BSplineCurve3dH): any;
    /** No-action implementation */
    handleBSplineSurface3d(_g: BSplineSurface3d): any;
    /** No-action implementation */
    handleCoordinateXYZ(_g: CoordinateXYZ): any;
    /** No-action implementation */
    handleBSplineSurface3dH(_g: BSplineSurface3dH): any;
    /** No-action implementation */
    handleIndexedPolyface(_g: IndexedPolyface): any;
    /** No-action implementation */
    handleTransitionSpiral(_g: TransitionSpiral3d): any;
    /** No-action implementation */
    handlePath(_g: Path): any;
    /** No-action implementation */
    handleLoop(_g: Loop): any;
    /** No-action implementation */
    handleParityRegion(_g: ParityRegion): any;
    /** No-action implementation */
    handleUnionRegion(_g: UnionRegion): any;
    /** No-action implementation */
    handleBagOfCurves(_g: BagOfCurves): any;
    /** No-action implementation */
    handleSphere(_g: Sphere): any;
    /** No-action implementation */
    handleCone(_g: Cone): any;
    /** No-action implementation */
    handleBox(_g: Box): any;
    /** No-action implementation */
    handleTorusPipe(_g: TorusPipe): any;
    /** No-action implementation */
    handleLinearSweep(_g: LinearSweep): any;
    /** No-action implementation */
    handleRotationalSweep(_g: RotationalSweep): any;
    /** No-action implementation */
    handleRuledSweep(_g: RuledSweep): any;
    /** No-action implementation */
    handlePointString3d(_g: PointString3d): any;
    /** No-action implementation */
    handleBezierCurve3d(_g: BezierCurve3d): any;
    /** No-action implementation */
    handleBezierCurve3dH(_g: BezierCurve3dH): any;
}
/**
 * Implement GeometryHandler methods, but override `handleCurveCollection` so that all methods
 * that operate on a [[CurveCollection]] recurse to their children.
 * @public
 */
export declare class RecurseToCurvesGeometryHandler extends GeometryHandler {
    /** No-action implementation */
    handleLineSegment3d(_g: LineSegment3d): any;
    /** No-action implementation */
    handleLineString3d(_g: LineString3d): any;
    /** No-action implementation */
    handleArc3d(_g: Arc3d): any;
    /** No-action implementation */
    handleBSplineCurve3d(_g: BSplineCurve3d): any;
    /** No-action implementation */
    handleInterpolationCurve3d(_g: InterpolationCurve3d): any;
    /** No-action implementation */
    handleAkimaCurve3d(_g: AkimaCurve3d): any;
    /** No-action implementation */
    handleBSplineCurve3dH(_g: BSplineCurve3dH): any;
    /** No-action implementation */
    handleBSplineSurface3d(_g: BSplineSurface3d): any;
    /** No-action implementation */
    handleCoordinateXYZ(_g: CoordinateXYZ): any;
    /** No-action implementation */
    handleBSplineSurface3dH(_g: BSplineSurface3dH): any;
    /** No-action implementation */
    handleIndexedPolyface(_g: IndexedPolyface): any;
    /** No-action implementation */
    handleTransitionSpiral(_g: TransitionSpiral3d): any;
    /** Invoke `child.dispatchToGeometryHandler(this)` for each child in the array returned by the query `g.children` */
    handleChildren(g: GeometryQuery): any;
    /** Recurse to children */
    handleCurveCollection(g: CurveCollection): any;
    /** No-action implementation */
    handleSphere(_g: Sphere): any;
    /** No-action implementation */
    handleCone(_g: Cone): any;
    /** No-action implementation */
    handleBox(_g: Box): any;
    /** No-action implementation */
    handleTorusPipe(_g: TorusPipe): any;
    /** No-action implementation */
    handleLinearSweep(_g: LinearSweep): any;
    /** No-action implementation */
    handleRotationalSweep(_g: RotationalSweep): any;
    /** No-action implementation */
    handleRuledSweep(_g: RuledSweep): any;
    /** No-action implementation */
    handlePointString3d(_g: PointString3d): any;
    /** No-action implementation */
    handleBezierCurve3d(_g: BezierCurve3d): any;
    /** No-action implementation */
    handleBezierCurve3dH(_g: BezierCurve3dH): any;
}
/**
 * IStrokeHandler is an interface with methods to receive data about curves being stroked.
 * CurvePrimitives emitStrokes () methods emit calls to a handler object with these methods.
 * The various CurvePrimitive types are free to announce either single points (announcePoint), linear fragments,
 * or fractional intervals of the parent curve.
 * * handler.startCurvePrimitive (cp) -- announce the curve primitive whose strokes will follow.
 * * announcePointTangent (xyz, fraction, tangent) -- announce a single point on the curve.
 * * announceIntervalForUniformStepStrokes (cp, numStrokes, fraction0, fraction1) -- announce a fraction
 * interval in which the curve can be evaluated (e.g. the handler can call cp->fractionToPointAndDerivative ())
 * * announceSegmentInterval (cp, point0, point1, numStrokes, fraction0, fraction1) -- announce
 *    that the fractional interval fraction0, fraction1 is a straight line which should be broken into
 *    numStrokes strokes.
 *   * A LineSegment would make a single call to this.
 *   * A LineString would make one call to this for each of its segments, with fractions indicating position
 * within the linestring.
 * * endCurvePrimitive (cp) -- announce the end of the curve primitive.
 * @public
 */
export interface IStrokeHandler {
    /**
     * Announce a parent curve primitive
     * * startParentCurvePrimitive() ...endParentCurvePrimitive() are wrapped around startCurvePrimitive and
     * endCurvePrimitive when the interior primitive is a proxy.
     */
    startParentCurvePrimitive(cp: CurvePrimitive): void;
    /** Announce the curve primitive that will be described in subsequent calls. */
    startCurvePrimitive(cp: CurvePrimitive): void;
    /**
     * Announce a single point with its fraction and tangent.
     * * (IMPORTANT) the same Point3d and Vector3d will be reset and passed on multiple calls.
     * * (THEREFORE) if the implementation is saving coordinates, it must copy the xyz data out into its own data
     * structure rather than save the references.
     */
    announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void;
    /**
     * Announce that curve primitive cp should be evaluated in the specified fraction interval.
     * * Note that this method is permitted (expected) to provide pre-stroked data if available.
     * * In th pre-stroked case, the cp passed to the handler will be the stroked image, not the original.
     * * Callers that want summary data should implement (and return true from) needPrimaryDataForStrokes
     */
    announceIntervalForUniformStepStrokes(cp: CurvePrimitive, numStrokes: number, fraction0: number, fraction1: number): void;
    /**
     * OPTIONAL method for a handler to indicate that it wants primary geometry (e.g. spirals) rather than strokes.
     * @returns true if primary geometry should be passed (rather than stroked or otherwise simplified)
     */
    needPrimaryGeometryForStrokes?(): boolean;
    /** Announce numPoints interpolated between point0 and point1, with associated fractions */
    announceSegmentInterval(cp: CurvePrimitive, point0: Point3d, point1: Point3d, numStrokes: number, fraction0: number, fraction1: number): void;
    /** Announce that all data about `cp` has been announced. */
    endCurvePrimitive(cp: CurvePrimitive): void;
    /** Announce that all data about the parent primitive has been announced. */
    endParentCurvePrimitive(cp: CurvePrimitive): void;
    /**
     * Announce a bezier curve fragment.
     * * this is usually a section of BsplineCurve
     * * If this function is missing, the same interval will be passed to announceIntervalForUniformSteps.
     * @param bezier bezier fragment
     * @param numStrokes suggested number of strokes (uniform in bezier interval 0..1)
     * @param parent parent curve
     * @param spanIndex spanIndex within parent
     * @param fraction0 start fraction on parent curve
     * @param fraction1 end fraction on parent curve
     */
    announceBezierCurve?(bezier: BezierCurveBase, numStrokes: number, parent: CurvePrimitive, spandex: number, fraction0: number, fraction1: number): void;
}
/**
 * Interface with methods for mapping (u,v) fractional coordinates to surface xyz and derivatives.
 * @public
 */
export interface UVSurface {
    /**
     * Convert fractional u and v coordinates to surface point.
     * @param uFraction fractional coordinate in u direction
     * @param vFraction fractional coordinate in v direction
     * @param result optional pre-allocated point
     */
    uvFractionToPoint(uFraction: number, vFraction: number, result?: Point3d): Point3d;
    /**
     * Convert fractional u and v coordinates to surface point and in-surface tangent directions.
     * * The vectors are expected to be non-zero tangents which can be crossed to get a normal.
     * * Hence they are not necessarily (a) partial derivatives or (b) Frenet vectors.
     * @param uFraction fractional coordinate in u direction
     * @param vFraction fractional coordinate in v direction
     * @param result optional pre-allocated carrier for point and vectors
     */
    uvFractionToPointAndTangents(uFraction: number, vFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
}
/**
 * Interface for queries of distance-along in u and v directions
 * @public
 */
export interface UVSurfaceIsoParametricDistance {
    /**
     * * Return a vector whose x and y parts are "size" of the surface in the u and v directions.
     * * Sizes are use for applying scaling to mesh parameters
     * * These sizes are (reasonable approximations of) the max curve length along u and v isoparameter lines.
     *   * e.g. for a sphere, these are:
     *      * u direction = distance around the equator
     *      * v direction = distance from south pole to north pole.
     */
    maxIsoParametricDistance(): Vector2d;
}
