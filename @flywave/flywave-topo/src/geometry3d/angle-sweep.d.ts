import { type AngleSweepProps, type BeJSONFunctions } from "../geometry";
import { Angle } from "./angle";
import { type GrowableFloat64Array } from "./growable-float64-array";
/**
 * An `AngleSweep` is a pair of angles at start and end of an interval.
 *
 * *  For stroking purposes, the "included interval" is all angles numerically reached
 * by theta = start + f*(end-start), where f is between 0 and 1.
 * *  This stroking formula is simple numbers -- 2PI shifts are not involved.
 * *  2PI shifts do become important in the reverse mapping of an angle to a fraction.
 * *  If "start < end" the angle proceeds CCW around the unit circle.
 * *  If "end < start" the angle proceeds CW around the unit circle.
 * *  Angles beyond 360 are fine as endpoints.
 * *  (350,370) covers the same unit angles as (-10,10).
 * *  (370,350) covers the same unit angles as (10,-10).
 * *  math details related fraction API can be found at docs/learning/geometry/Angle.md
 *  * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/AngleSweep
 * @public
 */
export declare class AngleSweep implements BeJSONFunctions {
    private _radians0;
    private _radians1;
    /** Read-property for degrees at the start of this AngleSweep. */
    get startDegrees(): number;
    /** Read-property for degrees at the end of this AngleSweep. */
    get endDegrees(): number;
    /** Read-property for signed start-to-end sweep in degrees. */
    get sweepDegrees(): number;
    /** Read-property for degrees at the start of this AngleSweep. */
    get startRadians(): number;
    /** Read-property for degrees at the end of this AngleSweep. */
    get endRadians(): number;
    /** Read-property for signed start-to-end sweep in radians. */
    get sweepRadians(): number;
    /** Return the (strongly typed) start angle */
    get startAngle(): Angle;
    /** Return the (strongly typed) end angle */
    get endAngle(): Angle;
    /**
     * Create a sweep as one of
     * * A clone of a given sweep
     * * 0 to given angle
     * * full circle if no arg given (sweep 0 to 360 degrees)
     */
    static create(data?: AngleSweep | Angle): AngleSweep;
    /**
     * (private) constructor with start and end angles in radians.
     * * Use explicitly named static methods to clarify intent and units of inputs:
     *
     * * createStartEndRadians (startRadians:number, endRadians:number)
     * * createStartEndDegrees (startDegrees:number, endDegrees:number)
     * * createStartEnd (startAngle:Angle, endAngle:Angle)
     * * createStartSweepRadians (startRadians:number, sweepRadians:number)
     * * createStartSweepDegrees (startDegrees:number, sweepDegrees:number)
     * * createStartSweep (startAngle:Angle, sweepAngle:Angle)
     */
    private constructor();
    /**
     * Directly set the start and end angles in radians
     * * If the difference between startRadians and endRadians is greater than 360, the function limits the angle sweep to 360.
     */
    setStartEndRadians(startRadians?: number, endRadians?: number): void;
    /** Directly set the start and end angles in degrees */
    setStartEndDegrees(startDegrees?: number, endDegrees?: number): void;
    /**
     * Create an AngleSweep from start and end angles given in radians.
     * * If the difference between startRadians and endRadians is greater than 360, the function limits the angle sweep to 360.
     */
    static createStartEndRadians(startRadians?: number, endRadians?: number, result?: AngleSweep): AngleSweep;
    /** Return the angle obtained by subtracting radians from this angle. */
    cloneMinusRadians(radians: number): AngleSweep;
    /** Create an AngleSweep from start and end angles given in degrees. */
    static createStartEndDegrees(startDegrees?: number, endDegrees?: number, result?: AngleSweep): AngleSweep;
    /** Create an angle sweep from strongly typed start and end angles */
    static createStartEnd(startAngle: Angle, endAngle: Angle, result?: AngleSweep): AngleSweep;
    /** Create an AngleSweep from start and end angles given in radians. */
    static createStartSweepRadians(startRadians?: number, sweepRadians?: number, result?: AngleSweep): AngleSweep;
    /** Create an AngleSweep from start and sweep given in degrees.  */
    static createStartSweepDegrees(startDegrees?: number, sweepDegrees?: number, result?: AngleSweep): AngleSweep;
    /** Create an angle sweep with limits given as (strongly typed) angles for start and sweep */
    static createStartSweep(startAngle: Angle, sweepAngle: Angle, result?: AngleSweep): AngleSweep;
    /** Return a sweep with limits interpolated between this and other. */
    interpolate(fraction: number, other: AngleSweep): AngleSweep;
    /** Copy from other AngleSweep. */
    setFrom(other: AngleSweep): void;
    /** Create a full circle sweep (CCW). startRadians defaults to 0 */
    static create360(startRadians?: number): AngleSweep;
    /** Create a sweep from the south pole to the north pole (-90 to +90). */
    static createFullLatitude(): AngleSweep;
    /** Reverse the start and end angle in place. */
    reverseInPlace(): void;
    /**
     * Return a sweep for the "other" part of the circle.
     * @param reverseDirection true to move backwards (CW) from start to end, false to more forwards (CCW) from start to end.
     */
    cloneComplement(reverseDirection?: boolean, result?: AngleSweep): AngleSweep;
    /** Restrict start and end angles into the range (-90,+90) in degrees */
    capLatitudeInPlace(): void;
    /** Ask if the sweep is counterclockwise, i.e. positive sweep */
    get isCCW(): boolean;
    /** Ask if the sweep is a full circle. */
    get isFullCircle(): boolean;
    /** Ask if the sweep is a full sweep from south pole to north pole. */
    get isFullLatitudeSweep(): boolean;
    /** Return a clone of this sweep. */
    clone(): AngleSweep;
    /** Convert fractional position in the sweep to radians. */
    fractionToRadians(fraction: number): number;
    /** Convert fractional position in the sweep to strongly typed Angle object. */
    fractionToAngle(fraction: number): Angle;
    /**
     * Return 2PI divided by the sweep radians (i.e. 360 degrees divided by sweep angle).
     * * This is the number of fractional intervals required to cover a whole circle.
     */
    fractionPeriod(): number;
    /**
     * Return the fractionalized position of the given angle (as Angle) computed without consideration of
     * 2PI period and without consideration of angle sweep direction (CW or CCW).
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  negative fraction for angles "before" the start angle if start < end
     * *  fraction larger than one for angles "after" the end angle if start < end
     * *  fraction larger than one for angles "before" the start angle if start > end
     * *  negative fraction for angles "after" the end angle if start > end
     * *  does not allow period shift
     */
    angleToUnboundedFraction(theta: Angle): number;
    /**
     * Return the fractionalized position of the given angle (as radians), computed with consideration of 2PI period.
     * *  consider radians0 as `start` angle of the sweep and radians1 as `end` angle of the sweep
     * *  fraction is always positive
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  all exterior angles are at fractions greater than 1
     * *  allows period shift
     */
    static radiansToPositivePeriodicFractionStartEnd(radians: number, radians0: number, radians1: number, zeroSweepDefault?: number): number;
    /**
     * Return the fractionalized position of the given angle (as radians), computed with consideration of 2PI period.
     * *  fraction is always positive
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  all exterior angles are at fractions greater than 1
     * *  allows period shift
     */
    radiansToPositivePeriodicFraction(radians: number, zeroSweepDefault?: number): number;
    /**
     * Return the fractionalized position of the given angle (as Angle), computed with consideration of 2PI period.
     * *  fraction is always positive
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  all exterior angles are at fractions greater than 1
     * *  allows period shift
     */
    angleToPositivePeriodicFraction(theta: Angle): number;
    /**
     * Return the fractionalized position of the given array of angles (as radian), computed with consideration of 2PI period.
     * *  fraction is always positive
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  all exterior angles are at fractions greater than 1
     * *  allows period shift
     */
    radiansArrayToPositivePeriodicFractions(data: GrowableFloat64Array): void;
    /**
     * Return the fractionalized position of the given angle (as radian) computed with consideration of
     * 2PI period and with consideration of angle sweep direction (CW or CCW).
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  negative fraction for angles "before" the start angle
     * *  fraction larger than one for angles "after" the end angle
     * *  allows period shift
     */
    radiansToSignedPeriodicFraction(radians: number): number;
    /**
     * Return the fractionalized position of the given angle (as Angle) computed with consideration of
     * 2PI period and with consideration of angle sweep direction (CW or CCW).
     * *  the start angle is at fraction 0
     * *  the end angle is at fraction 1
     * *  interior angles are between 0 and 1
     * *  negative fraction for angles "before" the start angle
     * *  fraction larger than one for angles "after" the end angle
     * *  allows period shift
     */
    angleToSignedPeriodicFraction(theta: Angle): number;
    /** Test if the given angle (as radians) is within sweep (between radians0 and radians1)   */
    static isRadiansInStartEnd(radians: number, radians0: number, radians1: number, allowPeriodShift?: boolean): boolean;
    /** Test if the given angle (as radians) is within sweep  */
    isRadiansInSweep(radians: number, allowPeriodShift?: boolean): boolean;
    /** Test if the given angle (as Angle) is within the sweep */
    isAngleInSweep(angle: Angle): boolean;
    /**
     * Set this AngleSweep from various sources:
     * * if json is undefined, a full-circle sweep is returned.
     * * If json is an AngleSweep object, it is cloned
     * * If json is an array of 2 numbers, those numbers are start and end angles in degrees.
     * * If `json.degrees` is an array of 2 numbers, those numbers are start and end angles in degrees.
     * * If `json.radians` is an array of 2 numbers, those numbers are start and end angles in radians.
     * * Otherwise, a full-circle sweep is returned.
     */
    setFromJSON(json?: any): void;
    /** Create an AngleSweep from a json object. */
    static fromJSON(json?: AngleSweepProps): AngleSweep;
    /**
     * Convert an AngleSweep to a JSON object.
     * @return {*} {degrees: [startAngleInDegrees, endAngleInDegrees}
     */
    toJSON(): any;
    /**
     * Test if this angle sweep and other angle sweep match with radians tolerance.
     * * Period shifts are allowed.
     */
    isAlmostEqualAllowPeriodShift(other: AngleSweep): boolean;
    /**
     * Test if this angle sweep and other angle sweep match with radians tolerance.
     * * Period shifts are not allowed.
     */
    isAlmostEqualNoPeriodShift(other: AngleSweep): boolean;
    /**
     * Test if start and end angles match with radians tolerance.
     * * Period shifts are not allowed.
     * * This function is equivalent to isAlmostEqualNoPeriodShift. It is present for consistency with other classes.
     * However, it is recommended to use isAlmostEqualNoPeriodShift which has a clearer name.
     */
    isAlmostEqual(other: AngleSweep): boolean;
}
