import { type Matrix3d } from "../../geometry3d/matrix3d";
import type { Vector3d } from "../../geometry3d/point3d-vector3d";
import { type Range1d, Range3d } from "../../geometry3d/range";
import type { Ray3d } from "../../geometry3d/ray3d";
import { Segment1d } from "../../geometry3d/segment1d";
import { Transform } from "../../geometry3d/transform";
import { CurvePrimitive } from "../curve-primitive";
import { type LineString3d } from "../line-string3d";
import { OffsetOptions } from "../offset-options";
import { type TransitionConditionalProperties } from "./transition-conditional-properties";
/**
 * This is the set of valid type names for "integrated" spirals
 * * Behavior is expressed by a `NormalizedTransition` snap function.
 * * The snap function varies smoothly from f(0)=0 to f(1)=1
 * * The various snap functions are:
 *   * clothoid: linear
 *   * biquadratic: 2 quadratics pieced together, joining with 1st derivative continuity at f(0.) = 0.5, with zero slope f'(0)=0 and f'(1)= 0
 *   * bloss: A single cubic with zero slope at 0 and 1
 *   * cosine: half of a cosine wave, centered around 0.5
 *   * sine: full period of a sine wave added to the line f(u)=u
 * *
 * @public
 */
export type IntegratedSpiralTypeName = "clothoid" | "bloss" | "biquadratic" | "cosine" | "sine";
/**
 * This is the set of valid type names for "direct" spirals.
 * "Direct" spirals can evaluate fractionToPoint by direct equations, i.e. not requiring the numeric integrations in "Integrated" spiral types.
 * @public
 */
export type DirectSpiralTypeName = "JapaneseCubic" | "Arema" | "ChineseCubic" | "HalfCosine" | "AustralianRailCorp" | "WesternAustralian" | "Czech" | "MXCubicAlongArc" | "Polish" | "Italian";
/**
 * TransitionSpiral3d is a base class for multiple variants of spirals.
 * * The menagerie of spiral types have 2 broad categories:
 *   * IntegratedSpiral3d -- a spiral whose direct function for curvature versus distance must be integrated to determine x,y
 *     * The IntegratedSpiral3d types are enumerated in `IntegratedSpiralTypes`
 *   * DirectSpiral3d -- a spiral implemented with direct calculation of x,y from fractional position along the spiral.
 *     * The direct spiral types are enumerated in the `DirectSpiralType`
 * * The method set for CurvePrimitive support includes a `handleTransitionSpiral(g: TransitionSpiral3d)` which receives all the spiral types.
 * * The spiral class may impose expectations that its inflection is at the origin, with tangent along the x axis.
 *   * This is generally necessary for direct spirals.
 *   * This is not necessary for integrated spirals.
 * @public
 */
export declare abstract class TransitionSpiral3d extends CurvePrimitive {
    /** string name of spiral type */
    protected _spiralType: string;
    /** Original defining properties. */
    protected _designProperties: TransitionConditionalProperties | undefined;
    /** Fractional interval for the "active" part of a containing spiral.
     * (The radius, angle, and length conditions define a complete spiral, and some portion of it is "active")
     */
    protected _activeFractionInterval: Segment1d;
    /** Return (reference to) the active portion of the reference spiral. */
    get activeFractionInterval(): Segment1d;
    /** strokes in the active portion */
    abstract get activeStrokes(): LineString3d;
    /** Placement transform */
    protected _localToWorld: Transform;
    /** (reference to) placement transform. */
    get localToWorld(): Transform;
    protected constructor(spiralType: string | undefined, localToWorld: Transform, activeFractionInterval: Segment1d | undefined, designProperties: TransitionConditionalProperties | undefined);
    get spiralType(): string;
    /** Return 1/r with convention that if true zero is given as radius it represents infinite radius (0 curvature, straight line) */
    static radiusToCurvature(radius: number): number;
    /** Return 1/k with convention that if near-zero is given as curvature, its infinite radius is returned as 0 */
    static curvatureToRadius(curvature: number): number;
    /** Return a deep clone. */
    abstract clone(): TransitionSpiral3d;
    /** Recompute strokes */
    abstract refreshComputedProperties(): void;
    /** Return (if possible) a spiral which is a portion of this curve. */
    clonePartialCurve(fractionA: number, fractionB: number): TransitionSpiral3d;
    /** Clone with a transform applied  */
    cloneTransformed(transform: Transform): TransitionSpiral3d;
    /** Return the average of the start and end curvatures. */
    static averageCurvature(radiusLimits: Segment1d): number;
    /**
     * Given two radii (or zeros for 0 curvature) return the average curvature
     * @param r0 start radius, or 0 for line
     * @param r1 end radius, or 0 for line
     */
    static averageCurvatureR0R1(r0: number, r1: number): number;
    /**
     * Given two radii (or zeros for 0 curvature) return the average curvature
     * @param r0 start radius, or 0 for line
     * @param r1 end radius, or 0 for line
     */
    static interpolateCurvatureR0R1(r0: number, fraction: number, r1: number): number;
    /** Return the arc length of a transition spiral with given sweep and radius pair. */
    static radiusRadiusSweepRadiansToArcLength(radius0: number, radius1: number, sweepRadians: number): number;
    /** Return the turn angle for spiral of given length between two radii */
    static radiusRadiusLengthToSweepRadians(radius0: number, radius1: number, arcLength: number): number;
    /** Return the end radius for spiral of given start radius, length, and turn angle. */
    static radius0LengthSweepRadiansToRadius1(radius0: number, arcLength: number, sweepRadians: number): number;
    /** Return the start radius for spiral of given end radius, length, and turn angle. */
    static radius1LengthSweepRadiansToRadius0(radius1: number, arcLength: number, sweepRadians: number): number;
    /** Return the original defining properties (if any) saved by the constructor. */
    get designProperties(): TransitionConditionalProperties | undefined;
    /**
     * * If transformA is rigid with uniform scale, apply the rigid part of transformA to the localToWorld transform and return the scale and rigid separation.
     * * If not rigid, do nothing and return undefined.
     * * Also apply the scale factor to the designProperties.
     * @param transformA
     */
    protected applyRigidPartOfTransform(transformA: Transform): {
        rigidAxes: Matrix3d;
        scale: number;
    } | undefined;
    /**
     * Construct an offset of the instance curve as viewed in the xy-plane (ignoring z).
     * * No attempt is made to join the offsets of smaller constituent primitives. To construct a fully joined offset
     *   for an aggregate instance (e.g., LineString3d, CurveChainWithDistanceIndex), use RegionOps.constructCurveXYOffset() instead.
     * @param offsetDistanceOrOptions offset distance (positive to left of the instance curve), or options object
     */
    constructOffsetXY(offsetDistanceOrOptions: number | OffsetOptions): CurvePrimitive | CurvePrimitive[] | undefined;
    /** extend the range by the strokes of the spiral */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** return the range of spiral between fractions of the activeStrokes.
     * * Use activeStrokes point count times interval factor for initial evaluation count, but do at least 5
     */
    rangeBetweenFractions(fractionA: number, fractionB: number, transform?: Transform): Range3d;
    /** Project instance geometry (via dispatch) onto the given ray, and return the extreme fractional parameters of projection.
     * @param ray ray onto which the instance is projected. A `Vector3d` is treated as a `Ray3d` with zero origin.
     * @param lowHigh optional receiver for output
     * @returns range of fractional projection parameters onto the ray, where 0.0 is start of the ray and 1.0 is the end of the ray.
     */
    projectedParameterRange(ray: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
}
