import { type Angle } from "../../geometry3d/angle";
import { AngleSweep } from "../../geometry3d/angle-sweep";
import { type GeometryHandler, type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { type Plane3dByOriginAndUnitNormal } from "../../geometry3d/plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "../../geometry3d/plane3d-by-origin-and-vectors";
import { Point3d } from "../../geometry3d/point3d-vector3d";
import { Ray3d } from "../../geometry3d/ray3d";
import { Segment1d } from "../../geometry3d/segment1d";
import { Transform } from "../../geometry3d/transform";
import { type GeometryQuery } from "../geometry-query";
import { LineString3d } from "../line-string3d";
import { StrokeOptions } from "../stroke-options";
import { TransitionSpiral3d } from "./transition-spiral3d";
/**
 * An IntegratedSpiral3d is a curve defined by integrating its curvature.
 * * The first integral of curvature (with respect to distance along the curve) is the bearing angle (in radians)
 * * Integrating (cos(theta), sin(theta)) gives displacement from the start point, and thus the actual curve position.
 * * The curvature functions of interest are all symmetric snap functions in the NormalizedTransition class.
 * * `TransitionConditionalProperties` implements the computations of the interrelationship of radii, bearing, and length.
 * @public
 */
export declare class IntegratedSpiral3d extends TransitionSpiral3d {
    /** String name for schema properties */
    readonly curvePrimitiveType = "transitionSpiral";
    /** start and end radii as a Segment1d */
    radius01: Segment1d;
    /** start and end bearings as an AngleSweep */
    bearing01: AngleSweep;
    /** stroked approximation of entire spiral. */
    private readonly _globalStrokes;
    /** stroked approximation of active spiral.
     * * Same count as global -- possibly overly fine, but it gives some consistency between same clothoid constructed as partial versus complete.
     * * If no trimming, this points to the same place as the _globalStrokes !!!  Don't double transform!!!
     */
    private _activeStrokes?;
    /** Return the internal stroked form of the (possibly partial) spiral   */
    get activeStrokes(): LineString3d;
    private readonly _evaluator;
    /** Total curve arc length (computed) */
    private _arcLength01;
    /** Curvatures (inverse radii) at start and end */
    private _curvature01;
    /** evaluator for transition */
    private constructor();
    /** default spiral type name. (clothoid) */
    static readonly defaultSpiralType = "clothoid";
    /** use the integrated function to return an angle at fractional position. */
    globalFractionToBearingRadians(fraction: number): number;
    /** use the integrated function to return an angle at fractional position. */
    globalFractionToCurvature(fraction: number): number;
    /** Return the bearing at given fraction of the active interval .... */
    fractionToBearingRadians(activeFraction: number): number;
    /** Return the curvature at given fraction of the active interval ...
     * * The `undefined` result is to match the abstract class -- it cannot actually occur.
     */
    fractionToCurvature(activeFraction: number): number | undefined;
    private static _gaussFraction;
    private static _gaussWeight;
    private static _gaussMapper;
    /** Initialize class level work arrays. */
    static initWorkSpace(): void;
    /** Evaluate and sum the gauss quadrature formulas to integrate cos(theta), sin(theta) fractional subset of a reference length.
     * (recall that theta is a nonlinear function of the fraction.)
     * * This is a single interval of gaussian integration.
     * * The fraction is on the full spiral (not in the mapped active interval)
     * @param xyz advancing integrated point.
     * @param fractionA fraction at start of interval
     * @param fractionB fraction at end of interval.
     * @param unitArcLength length of curve for 0 to 1 fractional
     */
    private fullSpiralIncrementalIntegral;
    /** Recompute strokes */
    refreshComputedProperties(): void;
    /**
     * Create a transition spiral with radius and bearing conditions.
     * @param radius01 radius (inverse curvature) at start and end. (radius of zero means straight line)
     * @param bearing01 bearing angles at start and end.  bearings are measured from the x axis, positive clockwise towards y axis
     * @param activeFractionInterval fractional limits of the active portion of the spiral.
     * @param localToWorld placement frame.  Fractional coordinate 0 is at the origin.
     */
    static createRadiusRadiusBearingBearing(radius01: Segment1d, bearing01: AngleSweep, activeFractionInterval: Segment1d, localToWorld: Transform, typeName?: string): IntegratedSpiral3d;
    /**
     * Create a transition spiral.
     * * Inputs must provide exactly 4 of the 5 values `[radius0,radius1,bearing0,bearing1,length`.
     * @param spiralType one of "clothoid", "bloss", "biquadratic", "cosine", "sine".  If undefined, "clothoid" is used.
     * @param radius0 radius (or 0 for tangent to line) at start
     * @param radius1 radius (or 0 for tangent to line) at end
     * @param bearing0 bearing, measured CCW from x axis at start.
     * @param bearing1 bearing, measured CCW from x axis at end.
     * @param fractionInterval optional fractional interval for an "active" portion of the curve.   if omitted, the full [0,1] is used.
     * @param localToWorld placement transform
     */
    static createFrom4OutOf5(spiralType: string | undefined, radius0: number | undefined, radius1: number | undefined, bearing0: Angle | undefined, bearing1: Angle | undefined, arcLength: number | undefined, fractionInterval: undefined | Segment1d, localToWorld: Transform): IntegratedSpiral3d | undefined;
    /** Copy all defining data from another spiral. */
    setFrom(other: IntegratedSpiral3d): this;
    /** Deep clone of this spiral */
    clone(): IntegratedSpiral3d;
    /** apply `transform` to this spiral's local to world transform. */
    tryTransformInPlace(transformA: Transform): boolean;
    /** Return the spiral start point. */
    startPoint(): Point3d;
    /** return the spiral end point. */
    endPoint(): Point3d;
    /** test if the local to world transform places the spiral xy plane into `plane` */
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    /** Return length of the spiral.  Because TransitionSpiral is parameterized directly in terms of distance along, this is a simple return value. */
    quickLength(): number;
    /** Return length of the spiral.  Because TransitionSpiral is parameterized directly in terms of distance along, this is a simple return value. */
    curveLength(): number;
    /** Return (unsigned) length of the spiral between fractions.  Because TransitionSpiral is parameterized directly in terms of distance along, this is a simple return value. */
    curveLengthBetweenFractions(fraction0: number, fraction1: number): number;
    /** Test if `other` is an instance of `TransitionSpiral3d` */
    isSameGeometryClass(other: any): boolean;
    /** Add strokes from this spiral to `dest`.
     * * Linestrings will usually stroke as just their points.
     * * If maxEdgeLength is given, this will sub-stroke within the linestring -- not what we want.
     */
    emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
    /** emit stroke fragments to `dest` handler. */
    emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
    /**
     * return the stroke count required for given options.
     * @param options StrokeOptions that determine count
     */
    computeStrokeCountForOptions(options?: StrokeOptions): number;
    /** Reverse the active interval and active strokes.
     * * Primary defining data remains unchanged !!!
     */
    reverseInPlace(): void;
    /** Evaluate curve point with respect to fraction. */
    fractionToPoint(activeFraction: number, result?: Point3d): Point3d;
    /** Evaluate curve point and derivative with respect to fraction. */
    fractionToPointAndDerivative(activeFraction: number, result?: Ray3d): Ray3d;
    /** Return the frenet frame at fractional position. */
    fractionToFrenetFrame(activeFraction: number, result?: Transform): Transform;
    /** Return a plane with
     *
     * * origin at fractional position along the curve
     * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to the fraction.
     * * vectorV is the second derivative, i.e.derivative of vectorU.
     */
    fractionToPointAnd2Derivatives(activeFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
    /** Second step of double dispatch:  call `handler.handleTransitionSpiral(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    /** compare various coordinate quantities */
    isAlmostEqual(other?: GeometryQuery): boolean;
}
