import { AxisOrder } from "../geometry";
import { Angle } from "./angle";
import { Matrix3d } from "./matrix3d";
/**
 * Represents a non-trivial rotation using three simple axis rotation angles and an order in which to apply them.
 * * This class accommodates application-specific interpretation of "multiplying 3 rotation matrices" with regard to
 *   * Whether a "vector" is a "row" or a "column"
 *   * The order in which the X,Y,Z rotations are applied.
 * * This class bakes in angle rotation directions via create functions (i.e., createRadians, createDegrees, and
 * createAngles) so you can define each of the 3 rotations to be clockwise or counterclockwise. The default
 * rotation is counterclockwise.
 * * Within the imodel geometry library, the preferred rotation order is encapsulated in `YawPitchRollAngles`.
 * @alpha
 */
export declare class OrderedRotationAngles {
    /** rotation around x */
    private readonly _x;
    /** rotation around y */
    private readonly _y;
    /** rotation around z */
    private readonly _z;
    /** rotation order. For example XYZ means to rotate around x axis first, then y axis, and finally Z axis */
    private _order;
    /** treat vectors as matrix columns */
    private static _sTreatVectorsAsColumns;
    /** constructor */
    private constructor();
    /** (Property accessor) Return the `AxisOrder` controlling matrix multiplication order. */
    get order(): AxisOrder;
    /** (Property accessor) Return the strongly typed angle of rotation around x. */
    get xAngle(): Angle;
    /** (Property accessor) Return the strongly typed angle of rotation around y. */
    get yAngle(): Angle;
    /** (Property accessor) Return the strongly typed angle of rotation around z. */
    get zAngle(): Angle;
    /** (Property accessor) Return the angle of rotation around x, in degrees */
    get xDegrees(): number;
    /** (Property accessor) Return the angle of rotation around y, in degrees */
    get xRadians(): number;
    /** (Property accessor) Return the angle of rotation around z, in degrees */
    get yDegrees(): number;
    /** (Property accessor) Return the angle of rotation around x, in radians */
    get yRadians(): number;
    /** (Property accessor) Return the angle of rotation around y, in radians */
    get zDegrees(): number;
    /** (Property accessor) Return the angle of rotation around z, in radians */
    get zRadians(): number;
    /** The flag controlling whether vectors are treated as rows or as columns */
    static get treatVectorsAsColumns(): boolean;
    static set treatVectorsAsColumns(value: boolean);
    /**
     * Create an OrderedRotationAngles from three angles (in radians), an ordering in which to apply them when
     * rotating, and a flag triple controlling whether direction of x,y,z is clockwise or counterclockwise.
     * @param xRadians rotation around x
     * @param yRadians rotation around y
     * @param zRadians rotation around z
     * @param order left to right order of axis names identifies the order that rotations are applied.
     * For example XYZ means to rotate around x axis first, then y axis, and finally Z axis.
     * * Note that rotation order is reverse of rotation matrix multiplication so for XYZ the rotation
     * matrix multiplication would be zRot*yRot*xRot
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/CubeRotationAroundStandardAxes
     * @param xyzRotationIsClockwise the flags controlling whether direction of x,y,z is clockwise or counterclockwise.
     * rotation direction of x,y,z: true ---> clockwise - false ---> counterclockwise.
     * * if xyzRotationIsClockwise is undefined it's set to [false, false, false].
     * @param result caller-allocated OrderedRotationAngles
     */
    static createRadians(xRadians: number, yRadians: number, zRadians: number, order: AxisOrder, xyzRotationIsClockwise?: [boolean, boolean, boolean], result?: OrderedRotationAngles): OrderedRotationAngles;
    /**
     * Create an OrderedRotationAngles from three angles (in degrees) and an ordering in which to apply
     * them when rotating.
     * @param xDegrees rotation around x
     * @param yDegrees rotation around y
     * @param zDegrees rotation around z
     * @param order left to right order of axis names identifies the order that rotations are applied.
     * For example XYZ means to rotate around x axis first, then y axis, and finally Z axis.
     * * Note that rotation order is reverse of rotation matrix multiplication so for XYZ the rotation
     * matrix multiplication would be zRot*yRot*xRot
     * @param xyzRotationIsClockwise the flags controlling whether direction of x,y,z is clockwise or counterclockwise.
     * rotation direction of x,y,z: true ---> clockwise - false ---> counterclockwise.
     * * if xyzRotationIsClockwise is undefined it's set to [false, false, false].
     * @param result caller-allocated OrderedRotationAngles
     */
    static createDegrees(xDegrees: number, yDegrees: number, zDegrees: number, order: AxisOrder, xyzRotationIsClockwise?: [boolean, boolean, boolean], result?: OrderedRotationAngles): OrderedRotationAngles;
    /**
     * Create an OrderedRotationAngles from three angles, an ordering in which to apply them when rotating,
     * and a flag triple controlling whether direction of x,y,z is clockwise or counterclockwise.
     * @param xRotation rotation around x
     * @param yRotation rotation around y
     * @param zRotation rotation around z
     * @param order left to right order of axis names identifies the order that rotations are applied
     * For example XYZ means to rotate around x axis first, then y axis, and finally Z axis.
     * * Note that rotation order is reverse of rotation matrix multiplication so for XYZ the rotation
     * matrix multiplication would be zRot*yRot*xRot
     * @param xyzRotationIsClockwise the flags controlling whether direction of x,y,z is clockwise or counterclockwise.
     * rotation direction of x,y,z: true ---> clockwise - false ---> counterclockwise.
     * * if xyzRotationIsClockwise is undefined it's set to [false, false, false].
     * @param result caller-allocated OrderedRotationAngles
     */
    static createAngles(xRotation: Angle, yRotation: Angle, zRotation: Angle, order: AxisOrder, xyzRotationIsClockwise?: [boolean, boolean, boolean], result?: OrderedRotationAngles): OrderedRotationAngles;
    /**
     * Create an OrderedRotationAngles from a 3x3 rotational matrix, given the ordering of axis rotations
     * that the matrix derives from.
     * * This function creates an OrderedRotationAngles with default angle rotation directions, i.e.,
     * it assumes all x, y, and z rotations are counterclockwise.
     * * In the failure case the method's return value is `undefined`.
     * * In the failure case, if the optional result was supplied, that result will nonetheless be filled with
     * a set of angles.
     */
    static createFromMatrix3d(matrix: Matrix3d, order: AxisOrder, result?: OrderedRotationAngles): OrderedRotationAngles | undefined;
    /**
     * Create a 3x3 rotational matrix from this OrderedRotationAngles.
     ** math details can be found at docs/learning/geometry/Angle.md
     **/
    toMatrix3d(result?: Matrix3d): Matrix3d;
}
