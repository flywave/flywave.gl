/** Commonly used constant values.
 * @alpha
 */
export declare class Constant {
    /** symbolic name for 1 millimeter:  0.001 meter */
    static readonly oneMillimeter: number;
    /** symbolic name for 1 centimeter:  0.01 meter */
    static readonly oneCentimeter: number;
    /** symbolic name for 1 meter:  1.0 meter */
    static readonly oneMeter: number;
    /** symbolic name for 1 kilometer: 1000 meter */
    static readonly oneKilometer: number;
    /** Diameter of the earth in kilometers. */
    static readonly diameterOfEarth: number;
    /** circumference of the earth in meters. */
    static readonly circumferenceOfEarth: number;
    /** radius of the earth using WGS-84 ellipsoid, in meters */
    static readonly earthRadiusWGS84: {
        polar: number;
        equator: number;
    };
}
