import { Angle } from "../../geometry3d/angle";
/** A true transition spiral is a curve defined by its curvature, with the curvature function symmetric about midpoint.
 * * The symmetry condition creates a relationship among the following 4 quantities:
 * ** curvature0 = curvature (i.e. 1/radius) at start
 * ** curvature1 = curvature (i.e. 1/radius) at end
 * ** sweepRadians = signed turning angle from start to end
 * ** arcLength = length of curve
 * * The relationship is the equation
 * ** `sweepRadians = arcLength * average Curvature = arcLength * 0.5 * (curvature0 + curvature1)`
 * * That is, regardless of any curvature properties other than symmetry, specifying any 3 of the quantities fully determines the remaining one.
 * @public
 */
export declare class TransitionConditionalProperties {
    /** radius (or 0 at start) */
    radius0: number | undefined;
    /** radius (or 0) at end */
    radius1: number | undefined;
    /** bearing at start, measured from x towards y */
    bearing0: Angle | undefined;
    /** bearing at end, measured from x towards y */
    bearing1: Angle | undefined;
    /** curve length */
    curveLength: number | undefined;
    /**
     * capture numeric or undefined values
     * @param radius0 start radius or undefined
     * @param radius1 end radius or undefined
     * @param bearing0 start bearing or undefined
     * @param bearing1 end bearing or undefined
     * @param arcLength arc length or undefined
     */
    constructor(radius0: number | undefined, radius1: number | undefined, bearing0: Angle | undefined, bearing1: Angle | undefined, arcLength: number | undefined);
    /** return the number of defined values among the 5 properties. */
    numDefinedProperties(): number;
    /** clone with all properties (i.e. preserve undefined states) */
    clone(): TransitionConditionalProperties;
    /** Return true if all components are defined and agree equationally. */
    getIsValidCompleteSet(): boolean;
    /** Examine which properties are defined and compute the (single) undefined.
     * @returns Return true if the input state had precisely one undefined member.
     */
    tryResolveAnySingleUnknown(): boolean;
    private almostEqualCoordinate;
    private almostEqualBearing;
    /**
     * Test if this and other have matching numeric and undefined members.
     */
    isAlmostEqual(other?: TransitionConditionalProperties): boolean;
    /** Apply a NONZERO scale factor to all distances. */
    applyScaleFactor(a: number): void;
    static areAlmostEqual(a: TransitionConditionalProperties | undefined, b: TransitionConditionalProperties | undefined): boolean;
}
