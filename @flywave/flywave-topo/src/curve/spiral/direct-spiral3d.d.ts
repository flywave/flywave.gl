import { type Angle } from "../../geometry3d/angle";
import { type GeometryHandler, type IStrokeHandler } from "../../geometry3d/geometry-handler";
import { type Plane3dByOriginAndUnitNormal } from "../../geometry3d/plane3d-by-origin-and-unit-normal";
import { type Plane3dByOriginAndVectors } from "../../geometry3d/plane3d-by-origin-and-vectors";
import { type Point3d } from "../../geometry3d/point3d-vector3d";
import { type Ray3d } from "../../geometry3d/ray3d";
import { Segment1d } from "../../geometry3d/segment1d";
import { type Transform } from "../../geometry3d/transform";
import { LineString3d } from "../line-string3d";
import { StrokeOptions } from "../stroke-options";
import { type TransitionConditionalProperties } from "./transition-conditional-properties";
import { TransitionSpiral3d } from "./transition-spiral3d";
import { type XYCurveEvaluator } from "./xy-curve-evaluator";
/**
 * DirectSpiral3d acts like a TransitionSpiral3d for serialization purposes, but implements spiral types that have "direct" xy calculations without the integrations required
 * for IntegratedSpiral3d.
 * * Each DirectSpiral3d carries an XYCurveEvaluator to give it specialized behavior.
 * * Direct spirals that flow through serialization to native imodel02 are create with these static methods:
 *   * createArema
 *   * createJapaneseCubic
 *   * createAustralianRail
 *   * createDirectHalfCosine
 *   * createChineseCubic
 *   * createCzechCubic
 *   * createPolishCubic
 *   * createItalian
 *   * createWesternAustralian
 * @public
 */
export declare class DirectSpiral3d extends TransitionSpiral3d {
    /** String name for schema properties */
    readonly curvePrimitiveType = "transitionSpiral";
    /** stroked approximation of entire spiral. This is AFTER the localToWorld transform ... */
    private readonly _globalStrokes;
    /** stroked approximation of active spiral.  This is AFTER the localToWorld transfomr ...
     * * Same count as global -- possibly overly fine, but it gives some consistency between same clothoid constructed as partial versus complete.
     * * If no trimming, this points to the same place as the _globalStrokes !!!  Don't double transform!!!
     */
    private _activeStrokes?;
    /** Return the internal stroked form of the (possibly partial) spiral   */
    get activeStrokes(): LineString3d;
    private _nominalL1;
    private _nominalR1;
    private readonly _evaluator;
    /** Return the nominal end radius. */
    get nominalR1(): number;
    /** Return the nominal distance from inflection to endpoint. */
    get nominalL1(): number;
    /** Return the nominal end curvature */
    get nominalCurvature1(): number;
    /** Return the low level evaluator
     * @internal
     */
    get evaluator(): XYCurveEvaluator;
    constructor(localToWorld: Transform, spiralType: string | undefined, originalProperties: TransitionConditionalProperties | undefined, nominalL1: number, nominalR1: number, activeFractionInterval: Segment1d | undefined, evaluator: XYCurveEvaluator);
    /**
     * Compute stroke data in an interval.
     * @param strokes strokes to clear and refill.
     * @param fraction0 start fraction
     * @param fraction1 end fraction
     */
    private computeStrokes;
    /** Recompute strokes */
    refreshComputedProperties(): void;
    /**
     * Create a spiral object which uses numXTerm terms from the clothoid X series and numYTerm from the clothoid Y series.
     * @param numXTerm  number of terms to use from X series
     * @param numYTerm number of terms to use from Y series
     * @param localToWorld placement frame.  Inflection point is at origin, initial direction is along x axis.
     * @param nominalL1 design distance from inflection to end point.
     * @param nominalR1 design radius at end point.
     * @param activeInterval active interval (as fractions of nominalL1 !!!)
     */
    static createTruncatedClothoid(spiralType: string, localToWorld: Transform, numXTerm: number, numYTerm: number, originalProperties: TransitionConditionalProperties | undefined, nominalL1: number, nominalR1: number, activeInterval: Segment1d | undefined): DirectSpiral3d | undefined;
    /**
     * Create an Japanese spiral clothoid approximation
     *   * X is 1 terms of the clothoid series as a function of nominal distance along.
     *   * Y is 1 terms f the clothoid series as a function of nominal distance along.
     *   * Remark: This is identical to the ChineseCubic
     * @param localToWorld axes with inflection at origin, tangent along x axis
     * @param nominalL1 nominal length as used in series LR terms.
     * @param nominalR1 nominal final radius as used in series LR terms
     * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
     */
    static createJapaneseCubic(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create a czech cubic.
     * This is y= m*x^3 with
     * * x any point on the x axis
     * * `fraction` along the spiral goes to `x = fraction * L`
     * * m is gamma / (6RL)
     *    * 1/(6RL) is the leading term of the sine series.
     *    * `gamma = 2R/sqrt (4RR-LL)` pushes y up a little bit to simulate the lost series terms.
     * @param localToWorld
     * @param nominalLx nominal length along x axis
     * @param nominalR1
     * @param activeInterval
     */
    static createCzechCubic(localToWorld: Transform, nominalLx: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create an italian spiral
     * This is y= m*x^3 with
     * * x any point on the x axis
     * * `fraction` along the spiral goes to `x = fraction * L`
     * * m is gamma / (6RL)
     *    * 1/(6RL) is the leading term of the sine series.
     *    * `gamma = 2R/sqrt (4RR-LL)` pushes y up a little bit to simulate the lost series terms.
     * * L in gamma and m is the
     * @param localToWorld
     * @param nominalL1 nominal length along the spiral
     * @param nominalR1
     * @param activeInterval
     */
    static createItalian(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create an MX Cubic whose nominal length is close to along the curve.
     * This is y= m*x^3 with
     * * m is 1/ (6RL1)
     *    * 1/(6RL) is the leading term of the sine series.
     * * L1 is an along-the-x-axis distance that is slightly LESS THAN the nominal length
     * * x is axis position that is slightly LESS than nominal distance along
     * * L1, x use the approximation   `x = s * ( 1 - s^4/ (40 R R L L))
     * @param localToWorld
     * @param nominalL1
     * @param nominalR1
     * @param activeInterval
     */
    static createMXCubicAlongArc(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create a polish cubic
     * This is y= m*x^3 with
     * * m is 1/ (6RL)
     *    * 1/(6RL) is the leading term of the sine series.
     * * L is nominal length
     * * R is nominal end radius.
     * * x ranges up to the x axis distance for which the polish distance series produces f(x)=L
     * * The support class PolishCubicEvaluator has static methods for the distance series and its inversion.
     */
    static createPolishCubic(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create an AustralianRailCorp spiral
     * This is y= m*x^3 with
     * * x any point on the x axis
     * * `fraction` along the spiral goes to `x = fraction * L`
     * * m is gamma / (6RL)
     *    * 1/(6RL) is the leading term of the sine series.
     *    * `gamma = 2R/sqrt (4RR-LL)` pushes y up a little bit to simulate the lost series terms.
     * @param localToWorld
     * @param nominalL1
     * @param nominalR1
     * @param activeInterval
     */
    static createAustralianRail(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    static createDirectHalfCosine(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create an Arema spiral clothoid approximation
     *   * X is 2 terms of the clothoid series as a function of nominal distance along
     *   * Y is 2 terms f the clothoid series as a function of nominal distance along
     *   * Remark: This is identical to the ChineseCubic
     * @param localToWorld axes with inflection at origin, tangent along x axis
     * @param nominalL1 nominal length as used in series LR terms.
     * @param nominalR1 nominal final radius as used in series LR terms
     * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
     */
    static createArema(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create a Chinese clothoid approximation
     *   * X is 2 terms of the clothoid series as a function of nominal distance along
     *   * Y is 2 terms f the clothoid series as a function of nominal distance along
     *   * Remark: This is identical to the Arema spiral
     * @param localToWorld axes with inflection at origin, tangent along x axis
     * @param nominalL1 nominal length as used in series LR terms.
     * @param nominalR1 nominal final radius as used in series LR terms
     * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
     */
    static createChineseCubic(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create a Western Australian direct spiral.
     *   * X is 2 terms of the clothoid series as a function of distance along
     *   * Y is 1 term (cubic in nominal distance along)
     * @param localToWorld axes with inflection at origin, tangent along x axis
     * @param nominalL1 nominal length as used in series LR terms.
     * @param nominalR1 nominal final radius as used in series LR terms
     * @param activeInterval fractional interval with (0, nominalL1) range for nominal distance along
     */
    static createWesternAustralian(localToWorld: Transform, nominalL1: number, nominalR1: number, activeInterval?: Segment1d): DirectSpiral3d | undefined;
    /**
     * Create (if possible) a DirectSpiral3d, applying various strict conditions appropriate to the spiral type.
     * The parameter list includes extraneous values in order to directly match IntegratedSpiral3d.create, which has greater flexibility about
     *    mixtures of values.
     * * IMPORTANT RESTRICTIONS
     *   * Direct spirals must have the inflection at the origin of their coordinate system, aligned with the x axis.
     *      * hence bearing0 = 0
     *      * hence radius0 = 0
     *   * bearing1 is ignored
     *   * radius1 must be given.
     *   * arcLength must be given,
     * @param spiralType one of the types in `DirectSpiralTypeNames`
     * @param radius0 radius (or 0 for tangent to line) at start.   Must be ZERO or UNDEFINED
     * @param radius1 radius (or 0 for tangent to line) at end.
     * @param bearing0 bearing, measured CCW from x axis at start.   Must be ZERO or UNDEFINED
     * @param bearing1 bearing, measured CCW from x axis at end.    IGNORED.
     * @param fractionInterval optional fractional interval for an "active" portion of the curve.   if omitted, the full [0,1] is used.
     * @param localToWorld placement transform
     */
    static createFromLengthAndRadius(spiralType: string, radius0: number | undefined, radius1: number | undefined, bearing0: Angle | undefined, _bearing1: Angle | undefined, arcLength: number | undefined, activeInterval: undefined | Segment1d, localToWorld: Transform): TransitionSpiral3d | undefined;
    /** Deep clone of this spiral */
    clone(): DirectSpiral3d;
    /** apply `transform` to this spiral's local to world transform. */
    tryTransformInPlace(transformA: Transform): boolean;
    /** Return the spiral start point. */
    startPoint(): Point3d;
    /** return the spiral end point. */
    endPoint(): Point3d;
    /** test if the local to world transform places the spiral xy plane into `plane` */
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    /** Return quick length of the spiral.
     * The tangent vector of a true clothoid is length 1 everywhere, so simple proportion of nominalL1 is a good approximation.
     */
    quickLength(): number;
    /** Return length of the spiral.
     * * True length is stored at back of uvParams . . .
     */
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
    isAlmostEqual(other: any): boolean;
}
