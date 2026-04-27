import { type AngleProps, type BeJSONFunctions, type TrigValues } from "../geometry";
/**
 * An `Angle` carries the numeric value of an angle, with methods to allow (require!) callers to
 * be clear about whether their angle is degrees or radians.
 * * After the Angle object is created, the callers should not know or care whether it is stored in
 * `degrees` or `radians` because both are available if requested by caller.
 * * The various access method are named so that callers can specify whether untyped numbers passed in or
 * out are degrees or radians.
 * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/AngleSweep
 * @public
 */
export declare class Angle implements BeJSONFunctions {
    /** maximal accuracy value of pi/12 (15 degrees), in radians */
    static readonly piOver12Radians = 0.26179938779914946;
    /** maximal accuracy value of pi/4 (45 degrees), in radians */
    static readonly piOver4Radians = 0.7853981633974483;
    /** maximal accuracy value of pi/2 (90 degrees), in radians */
    static readonly piOver2Radians = 1.5707963267948966;
    /** maximal accuracy value of pi (180 degrees), in radians */
    static readonly piRadians = 3.141592653589793;
    /** maximal accuracy value of 2*pi (360 degrees), in radians */
    static readonly pi2Radians = 6.283185307179586;
    /** scale factor for converting radians to degrees */
    static readonly degreesPerRadian: number;
    /** scale factor for converting degrees to radians */
    static readonly radiansPerDegree: number;
    private _radians;
    private _degrees?;
    private constructor();
    /** Return a new angle with the same content. */
    clone(): Angle;
    /** Freeze this instance so it is read-only */
    freeze(): Readonly<this>;
    /**
     * Return a new Angle object for angle given in degrees.
     * @param degrees angle in degrees
     */
    static createDegrees(degrees: number): Angle;
    /**
     * Return a (new) Angle object for a value given in radians.
     * @param radians angle in radians
     */
    static createRadians(radians: number): Angle;
    /**
     * Return a new `Angle` object with the default "small" angle measurement specified by [[Geometry.smallAngleRadians]].
     */
    static createSmallAngle(): Angle;
    /**
     * Return a (new) Angle object that is interpolated between two inputs (based on a fraction)
     * @param angle0 first angle in radians
     * @param fraction the interpolation fraction
     * @param angle1 second angle in radians
     */
    static createInterpolate(angle0: Angle, fraction: number, angle1: Angle): Angle;
    /**
     * Return a (new) Angle object, with angle scaled from existing angle.
     * @param scale scale factor to apply to angle.
     */
    cloneScaled(scale: number): Angle;
    /**
     * Set this angle to a value given in radians.
     * @param radians angle given in radians
     */
    setRadians(radians: number): void;
    /**
     * Set this angle to a value given in degrees.
     * @param degrees angle given in degrees.
     */
    setDegrees(degrees: number): void;
    /** Create an angle for a full circle. */
    static create360(): Angle;
    /**
     * Create a (strongly typed) Angle whose tangent is `numerator/denominator`, using the signs of both in
     * determining the (otherwise ambiguous) quadrant.
     * @param numerator numerator for tangent
     * @param denominator denominator for tangent
     */
    static createAtan2(numerator: number, denominator: number): Angle;
    /**
     * Copy all contents of `other` to this Angle.
     * @param other source data
     */
    setFrom(other: Angle): void;
    /**
     * Set an Angle from a JSON object
     * * A simple number is considered as degrees.
     * * specified `json.degrees` or `json._degrees` is degree value.
     * * specified `son.radians` or `json._radians` is radians value.
     * @param json object from JSON.parse. If a number, value is in *DEGREES*
     * @param defaultValRadians if json is undefined, default value in radians.
     */
    setFromJSON(json?: AngleProps, defaultValRadians?: number): void;
    /**
     * Create an Angle from a JSON object
     * @param json object from JSON.parse. If a number, value is in *DEGREES*
     * @param defaultValRadians if json is undefined, default value in radians.
     * @return a new Angle
     */
    static fromJSON(json?: AngleProps, defaultValRadians?: number): Angle;
    /** Convert an Angle to a JSON object as a number in degrees */
    toJSON(): AngleProps;
    /** Return a json object with radians keyword, e.g. `{ radians: 0.10}` */
    toJSONRadians(): AngleProps;
    /** Return the angle measured in radians. */
    get radians(): number;
    /** Return the angle measured in degrees. */
    get degrees(): number;
    /**
     * Convert an angle in degrees to radians.
     * @param degrees angle in degrees
     */
    static degreesToRadians(degrees: number): number;
    /**
     * Convert an angle in radians to degrees.
     * @param degrees angle in radians
     */
    static radiansToDegrees(radians: number): number;
    /** Return the cosine of this Angle object's angle */
    cos(): number;
    /** Return the sine of this Angle object's angle */
    sin(): number;
    /** Return the tangent of this Angle object's angle */
    tan(): number;
    /** Test if a radians (absolute) value is nearly 2PI or larger! */
    static isFullCircleRadians(radians: number): boolean;
    /** Test if the radians value is a half circle */
    static isHalfCircleRadians(radians: number): boolean;
    /** Test if the angle is a full circle */
    get isFullCircle(): boolean;
    /** Test if the angle is a half circle (in either direction) */
    get isHalfCircle(): boolean;
    /** Adjust a radians value so it is positive in 0..360 */
    static adjustDegrees0To360(degrees: number): number;
    /** Adjust a radians value so it is in -180..180 */
    static adjustDegreesSigned180(degrees: number): number;
    /** Adjust a radians value so it is positive in 0..2Pi */
    static adjustRadians0To2Pi(radians: number): number;
    /** Adjust a radians value so it is positive in -PI..PI */
    static adjustRadiansMinusPiPlusPi(radians: number): number;
    /** Return a (newly allocated) Angle object with value 0 radians */
    static zero(): Angle;
    /** Test if the angle is exactly zero. */
    get isExactZero(): boolean;
    /** Test if the angle is almost zero (within tolerance `Geometry.smallAngleRadians`) */
    get isAlmostZero(): boolean;
    /** Test if the angle is almost a north or south pole (within tolerance `Geometry.smallAngleRadians`) */
    get isAlmostNorthOrSouthPole(): boolean;
    /** Create an angle object with degrees adjusted into 0..360. */
    static createDegreesAdjustPositive(degrees: number): Angle;
    /** Create an angle object with degrees adjusted into -180..180. */
    static createDegreesAdjustSigned180(degrees: number): Angle;
    /**
     * Test if two radians values are equivalent, allowing shift by full circle (i.e. by a multiple of `2*PI`)
     * @param radiansA first radians value
     * @param radiansB second radians value
     * @param radianTol radian tolerance with default value of Geometry.smallAngleRadians
     */
    static isAlmostEqualRadiansAllowPeriodShift(radiansA: number, radiansB: number, radianTol?: number): boolean;
    /**
     * Test if this angle has magnitude no greater than that of `other`.
     * @param other the other angle
     */
    isMagnitudeLessThanOrEqual(other: Angle): boolean;
    /**
     * Test if this angle and other are equivalent, allowing shift by full circle (i.e., multiples of `2 * PI`).
     * @param other the other angle
     * @param radianTol radian tolerance with default value of Geometry.smallAngleRadians
     */
    isAlmostEqualAllowPeriodShift(other: Angle, radianTol?: number): boolean;
    /**
     * Test if two angle (in radians)  almost equal, NOT allowing shift by full circle (i.e., multiples of `2 * PI`).
     * @param radiansA first radians value
     * @param radiansB second radians value
     * @param radianTol radian tolerance with default value of Geometry.smallAngleRadians
     */
    static isAlmostEqualRadiansNoPeriodShift(radiansA: number, radiansB: number, radianTol?: number): boolean;
    /**
     * Test if two this angle and other are almost equal, NOT allowing shift by full circle (i.e., multiples of `2 * PI`).
     * @param other the other angle
     * @param radianTol radian tolerance with default value of Geometry.smallAngleRadians
     */
    isAlmostEqualNoPeriodShift(other: Angle, radianTol?: number): boolean;
    /**
     * Test if two this angle and other are almost equal, NOT allowing shift by full circle (i.e., multiples of `2 * PI`).
     * * This function is same as isAlmostEqualRadiansNoPeriodShift. Please use isAlmostEqualRadiansNoPeriodShift.
     * @param other the other angle
     * @param radianTol radian tolerance with default value of Geometry.smallAngleRadians
     */
    isAlmostEqual(other: Angle, radianTol?: number): boolean;
    /**
     * Test if dot product values indicate non-zero length perpendicular vectors.
     * @param dotUU dot product of vectorU with itself
     * @param dotVV dot product of vectorV with itself
     * @param dotUV dot product of vectorU with vectorV
     */
    static isPerpendicularDotSet(dotUU: number, dotVV: number, dotUV: number): boolean;
    /**
     * Return cosine, sine, and radians for the half angle of a "cosine,sine" pair.
     * * This function assumes the input arguments are related to an angle between -PI and PI
     * * This function returns an angle between -PI and PI
     * @param rCos2A cosine value (scaled by radius) for initial angle.
     * @param rSin2A sine value (scaled by radius) for final angle.
     */
    static trigValuesToHalfAngleTrigValues(rCos2A: number, rSin2A: number): TrigValues;
    /** If value is close to -1, -0.5, 0, 0.5, 1, adjust it to the exact value. */
    static cleanupTrigValue(value: number, tolerance?: number): number;
    /**
     * Return the half angle cosine, sine, and radians for given dot products between vectors. The vectors define
     * an ellipse using x(t) = c + U cos(t) + V sin(t) so U and V are at angle t=0 degree and t=90 degree. The
     * half angle t0 is an angle such that x(t0) is one of the ellipse semi-axis.
     * * This construction arises e.g. in `Arc3d.toScaledMatrix3d`.
     * * Given ellipse x(t) = c + U cos(t) + V sin(t), find t0 such that radial vector W(t0) = x(t0) - c is
     * perpendicular to the ellipse.
     * * Then 0 = W(t0).x'(t0) = (U cos(t0) + V sin(t0)).(V cos(t0) - U sin(t0)) = U.V cos(2t0) + 0.5 (V.V - U.U) sin(2t0)
     * implies sin(2t0) / cos(2t0) = 2 U.V / (U.U - V.V), i.e., t0 can be computed given the three dot products on the RHS.
     * math details can be found at docs/learning/geometry/Angle.md
     * @param dotUU dot product of vectorU with itself
     * @param dotVV dot product of vectorV with itself
     * @param dotUV dot product of vectorU with vectorV
     */
    static dotProductsToHalfAngleTrigValues(dotUU: number, dotVV: number, dotUV: number, favorZero?: boolean): TrigValues;
    /**
     * Returns the angle between two vectors, with the vectors given as xyz components
     * * The returned angle is between 0 and PI
     * @param ux x component of vector u
     * @param uy y component of vector u
     * @param uz z component of vector u
     * @param vx x component of vector v
     * @param vy y component of vector v
     * @param vz z component of vector v
     */
    static radiansBetweenVectorsXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): number;
    /**
     * Returns the angle between two vectors, with the vectors given as xyz components, and an up vector to resolve
     * angle to a full 2PI range.
     * * The returned angle is (-PI < radians <= PI) or (0 <= radians < 2 * PI)
     * * The angle is in the plane of the U and V vectors.
     * * The upVector determines a positive side of the plane but need not be strictly perpendicular to the plane.
     *
     * @param ux x component of vector u
     * @param uy y component of vector u
     * @param uz z component of vector u
     * @param vx x component of vector v
     * @param vy y component of vector v
     * @param vz z component of vector v
     * @param upVectorX x component of vector to positive side of plane.
     * @param upVectorY y component of vector to positive side of plane.
     * @param upVectorZ z component of vector to positive side of plane.
     * @param adjustToAllPositive if true, return strictly non-negative sweep (0 <= radians < 2*PI). If false, return
     * signed (-PI < radians <= PI)
     */
    static orientedRadiansBetweenVectorsXYZ(ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, upVectorX: number, upVectorY: number, upVectorZ: number, adjustToPositive?: boolean): number;
    /**
     * Add a multiple of a full circle angle (360 degrees, 2PI) in place.
     * @param multiple multiplier factor
     */
    addMultipleOf2PiInPlace(multiple: number): void;
}
