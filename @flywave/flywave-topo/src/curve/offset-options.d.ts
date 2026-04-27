import { type Angle } from "../geometry3d/angle";
import { StrokeOptions } from "./stroke-options";
/**
 * Control parameters for joint construction, used in offset construction methods such as [[RegionOps.constructPolygonWireXYOffset]] and [[Region.Ops.constructCurveXYOffset]].
 *   * Define a "joint" as the common point between adjacent segments of the input curve.
 *   * Define the "turn angle" at a joint to be the angle in [0,pi] between the first derivatives (tangents) of
 * the segments at the joint.
 *   * When creating offsets, if an offset needs to do an "outside" turn, the first applicable construction is applied:
 *   * If the turn angle is larger than `options.minArcDegrees`, a circular arc is constructed to offset the joint.
 *   * If the turn angle is less than or equal to `options.maxChamferTurnDegrees`, extend curves along tangent to
 * single intersection point (to create a sharp corner).
 *   * If the turn angle is larger than `options.maxChamferDegrees`, the joint is offset with a line string whose edges:
 *      * lie outside the arc that would have been created by the first construction
 *      * have uniform turn angle less than `options.maxChamferDegrees`
 *      * touch the arc at their midpoint (except first and last edge).
 * @public
 */
export declare class JointOptions {
    /**
     * Smallest arc to construct.
     * * If this control angle is 180 degrees or more, arcs are never created.
     */
    minArcDegrees: number;
    /** Largest turn angle at which to construct a sharp corner, or largest turn angle in a multi-segment chamfer. */
    maxChamferTurnDegrees: number;
    /**
     * Whether to remove the internal turn angle upper bound for sharp corner construction.
     * * By default, a sharp corner is not created at a joint when the turn angle is too large, so as to avoid offsets whose
     *  ranges blow up. Internally, this is implemented by applying an upper bound of 120 degrees to `maxChamferTurnDegrees`.
     * * When `allowSharpestCorners` is true, this internal upper bound is removed, allowing sharp corners for turn angles
     * up to `maxChamferTurnDegrees`.
     * * Thus, if you know your input turn angles are no greater than `maxChamferTurnDegrees`, you can create an offset with
     * sharp corners at each joint by setting `maxChamferTurnDegrees < minArcDegrees` and `allowSharpestCorners` to true.
     */
    allowSharpestCorners: boolean;
    /** Offset distance, positive to left of base curve. */
    leftOffsetDistance: number;
    /** Whether to offset elliptical arcs as elliptical arcs (true) or as B-spline curves (false, default). */
    preserveEllipticalArcs: boolean;
    /**
     * Construct JointOptions.
     * * leftOffsetDistance is required
     * * minArcDegrees and maxChamferDegrees are optional.
     */
    constructor(leftOffsetDistance: number, minArcDegrees?: number, maxChamferDegrees?: number, preserveEllipticalArcs?: boolean, allowSharpestCorners?: boolean);
    /** Return a deep clone. */
    clone(): JointOptions;
    /** Copy values of input options */
    setFrom(other: JointOptions): void;
    /**
     * Parse a number or JointOptions up to JointOptions:
     * * If leftOffsetDistanceOptions is a number, create a JointOptions with other options set to default values.
     * * If leftOffsetDistanceOrOptions is a JointOptions, return it unchanged.
     * @param leftOffsetDistanceOrOptions
     */
    static create(leftOffsetDistanceOrOptions: number | JointOptions): JointOptions;
    /** Return true if the options indicate this amount of turn should be handled with an arc. */
    needArc(theta: Angle): boolean;
    /** Return the number of corners needed to chamfer the given turn angle. */
    numChamferPoints(theta: Angle): number;
}
/**
 * Options for offsetting a curve, used in offset construction methods such as [[CurvePrimitive.constructOffsetXY]], [[RegionOps.constructPolygonWireXYOffset]] and [[Region.Ops.constructCurveXYOffset]].
 * @public
 */
export declare class OffsetOptions {
    /** Options for offsetting and joining CurvePrimitives */
    jointOptions: JointOptions;
    /** Options for generating a B-spline curve offset */
    strokeOptions: StrokeOptions;
    /** Options that are provided are captured. */
    constructor(offsetDistanceOrOptions: number | JointOptions, strokeOptions?: StrokeOptions);
    get minArcDegrees(): number;
    set minArcDegrees(value: number);
    get maxChamferTurnDegrees(): number;
    set maxChamferTurnDegrees(value: number);
    get allowSharpestCorners(): boolean;
    set allowSharpestCorners(value: boolean);
    get leftOffsetDistance(): number;
    set leftOffsetDistance(value: number);
    get preserveEllipticalArcs(): boolean;
    set preserveEllipticalArcs(value: boolean);
    /**
     * Convert variant input into OffsetOptions.
     * * If a JointOptions is provided, it is captured.
     * * If an OffsetOptions is provided, a reference to it is returned.
     */
    static create(offsetDistanceOrOptions: number | JointOptions | OffsetOptions): OffsetOptions;
    /** Convert variant input into offset distance */
    static getOffsetDistance(offsetDistanceOrOptions: number | JointOptions | OffsetOptions): number;
    /** Return a deep clone. */
    clone(): OffsetOptions;
}
