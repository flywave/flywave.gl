import { type AngleProps } from "../geometry";
import { Angle } from "./angle";
import { Matrix3d } from "./matrix3d";
import { Point3d } from "./point3d-vector3d";
import { type Transform } from "./transform";
/**
 * Angle properties of a `YawPitchRoll` orientation
 * @public
 */
export interface YawPitchRollProps {
    /** yaw field */
    yaw?: AngleProps;
    /** pitch field */
    pitch?: AngleProps;
    /** roll field */
    roll?: AngleProps;
}
/**
 * Three angles that determine the orientation of an object in space, sometimes referred to as [Tait–Bryan angles]
 * (https://en.wikipedia.org/wiki/Euler_angles).
 * * The matrix construction can be replicated by this logic:
 * * xyz coordinates have
 *   * x forward
 *   * y to left
 *   * z up
 * * Note that this is a right handed coordinate system.
 * * yaw is a rotation of x towards y, i.e. around positive z (counterclockwise):
 *     * `yawMatrix = Matrix3d.createRotationAroundAxisIndex(2, Angle.createDegrees(yawDegrees));`
 * * pitch is a rotation that raises x towards z, i.e. rotation around **negative y** (**clockwise**):
 *     * `pitchMatrix = Matrix3d.createRotationAroundAxisIndex(1, Angle.createDegrees(-pitchDegrees));`
 * * roll is rotation of y towards z, i.e. rotation around positive x (counterclockwise):
 *     * `rollMatrix = Matrix3d.createRotationAroundAxisIndex(0, Angle.createDegrees(rollDegrees));`
 * * The YPR matrix is the product
 *     * `result = yawMatrix.multiplyMatrixMatrix(pitchMatrix.multiplyMatrixMatrix(rollMatrix));`
 * * Note that this is for "column based" matrix with vectors multiplying on the right of the matrix.
 * Hence a vector is first rotated by roll, then the pitch, finally yaw. So multiplication order in
 * the sense of AxisOrder is `RPY` (i.e., XYZ), in contrast to the familiar name `YPR`.
 * @public
 */
export declare class YawPitchRollAngles {
    /** The yaw angle: counterclockwise rotation angle around z  */
    yaw: Angle;
    /** The pitch angle: **clockwise** rotation angle around y */
    pitch: Angle;
    /** The roll angle: counterclockwise rotation angle around x */
    roll: Angle;
    /**
     * Constructor
     * @param yaw counterclockwise rotation angle around z
     * @param pitch **clockwise** rotation angle around y
     * @param roll counterclockwise rotation angle around x
     */
    constructor(yaw?: Angle, pitch?: Angle, roll?: Angle);
    /** Freeze this YawPitchRollAngles */
    freeze(): Readonly<this>;
    /**
     * Constructor for YawPitchRollAngles with angles in degrees.
     * @param yawDegrees counterclockwise rotation angle (in degrees) around z
     * @param pitchDegrees **clockwise** rotation angle (in degrees) around y
     * @param rollDegrees counterclockwise rotation angle (in degrees) around x
     */
    static createDegrees(yawDegrees: number, pitchDegrees: number, rollDegrees: number): YawPitchRollAngles;
    /**
     * Constructor for YawPitchRollAngles with angles in radians.
     * @param yawRadians counterclockwise rotation angle (in radians) around z
     * @param pitchRadians **clockwise** rotation angle (in radians) around y
     * @param rollRadians counterclockwise rotation angle (in radians) around x
     */
    static createRadians(yawRadians: number, pitchRadians: number, rollRadians: number): YawPitchRollAngles;
    /** Construct a `YawPitchRoll` object from an object with 3 named angles */
    static fromJSON(json?: YawPitchRollProps): YawPitchRollAngles;
    /** Populate yaw, pitch and roll fields using `Angle.fromJSON` */
    setFromJSON(json?: YawPitchRollProps): void;
    /**
     * Convert to a JSON object of form { pitch: 20 , roll: 30 , yaw: 10 }. Angles are in degrees.
     * Any values that are exactly zero (with tolerance `Geometry.smallAngleRadians`) are omitted.
     */
    toJSON(): YawPitchRollProps;
    /**
     * Install all rotations from `other` into `this`.
     * @param other YawPitchRollAngles source
     */
    setFrom(other: YawPitchRollAngles): void;
    /**
     * Compare angles between `this` and `other`.
     * * Comparisons are via `isAlmostEqualAllowPeriodShift`.
     * @param other YawPitchRollAngles source
     */
    isAlmostEqual(other: YawPitchRollAngles): boolean;
    /** Make a copy of this YawPitchRollAngles */
    clone(): YawPitchRollAngles;
    /**
     * Expand the angles into a (rigid rotation) matrix.
     * * The returned matrix is "rigid" (i.e., it has unit length rows and columns, and its transpose is its inverse).
     * * The rigid matrix is always a right handed coordinate system.
     * @param result optional pre-allocated `Matrix3d`
     */
    toMatrix3d(result?: Matrix3d): Matrix3d;
    /**
     * Returns true if this rotation does nothing.
     * * If allowPeriodShift is false, any nonzero angle is considered a non-identity
     * * If allowPeriodShift is true, all angles are individually allowed to be any multiple of 360 degrees.
     */
    isIdentity(allowPeriodShift?: boolean): boolean;
    /** Return the largest angle in radians */
    maxAbsRadians(): number;
    /** Return the sum of the angles in squared radians */
    sumSquaredRadians(): number;
    /** Return the largest difference of angles (in radians) between this and other */
    maxDiffRadians(other: YawPitchRollAngles): number;
    /** Return the largest angle in degrees. */
    maxAbsDegrees(): number;
    /** Return the sum of squared angles in degrees. */
    sumSquaredDegrees(): number;
    /** Return the largest difference of angles (in degrees) between this and other */
    maxDiffDegrees(other: YawPitchRollAngles): number;
    /** Return an object from a Transform as an origin and YawPitchRollAngles. */
    static tryFromTransform(transform: Transform): {
        origin: Point3d;
        angles: YawPitchRollAngles | undefined;
    };
    /**
     * Attempts to create a YawPitchRollAngles object from a Matrix3d
     * * This conversion fails if the matrix is not rigid (unit rows and columns, and transpose is inverse)
     * * In the failure case the method's return value is `undefined`.
     * * In the failure case, if the optional result was supplied, that result will nonetheless be filled with
     * a set of angles.
     */
    static createFromMatrix3d(matrix: Matrix3d, result?: YawPitchRollAngles): YawPitchRollAngles | undefined;
}
