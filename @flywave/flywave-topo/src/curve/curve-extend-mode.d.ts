import { type AngleSweep } from "../geometry3d/angle-sweep";
/** module Curve */
/** enumeration of condition for extending a curve beyond start or end point.
 * * Not all CurvePrimitives support these modes.
 * @public
 */
export declare enum CurveExtendMode {
    /** No extension allowed. */
    None = 0,
    /** Extend along continuation of the end tangent */
    OnTangent = 1,
    /** Extend along continuation of the curve. */
    OnCurve = 2
}
/** Logic for deciding how a curve may be extended for closest point or intersection searches.
 * @public
 */
export declare class CurveExtendOptions {
    /** Given an ExtendParameter, isolate the particular CurveExtendOptions in effect at an end.
     * * Return undefined if `param === false`
     * * return the (strongly typed) pointer to the param if it is a single CurveExtendOptions.
     * * Return dereferenced array entry 0 or 1 if the param is an array of CurveExtendOptions.
     */
    static resolveVariantCurveExtendParameterToCurveExtendMode(param: VariantCurveExtendParameter, endIndex: 0 | 1): CurveExtendMode;
    /**
     *
     * * if fraction is between 0 and 1 return it unchanged.
     * * if fraction is less than 0 use the variant param to choose the fraction or 0
     * * if fraction is greater than 1 use the variant param to choose the fraction or 1
     *
     */
    static correctFraction(extendParam: VariantCurveExtendParameter, fraction: number): number;
    /**
     * Adjust a radians value to an angle sweep, allowing the extendParam to affect choice among periodic fractions.
     * * if radians is within the sweep, convert it to a fraction of the sweep.
     * * if radians is outside, use the extendParam to choose among:
     *    * fraction below 0
     *    * fraction above 1
     */
    static resolveRadiansToSweepFraction(extendParam: VariantCurveExtendParameter, radians: number, sweep: AngleSweep): number;
}
/** Variants of a single parameter.
 * Use this type in a function signature where caller may want simple true, false, or same extend mode for both ends.
 * @public
 */
export type VariantCurveExtendParameter = boolean | CurveExtendMode | CurveExtendMode[];
