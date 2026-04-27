import { type BeJSONFunctions } from "../geometry";
import { Angle } from "./angle";
/**
 * An `AngleAngleNumber` is a pair of angles (named `longitude` and `latitude`) and an additional number.
 * * This is directly intended to support `Ellipsoid` computations, with the two angles used as
 *    * `longitude` is "around the equator"
 *    * `latitude` is "equator to pole"
 *    * `h` is altitude above the `Ellipsoid surface.
 * * The structure may also be used for torus coordinates.
 * @public
 */
export declare class LongitudeLatitudeNumber implements BeJSONFunctions {
    private readonly _longitude;
    private readonly _latitude;
    private _altitude;
    /** (property getter) longitude in radians */
    get longitudeRadians(): number;
    /** (property getter) longitude in degrees */
    get longitudeDegrees(): number;
    /** (property getter) (reference to) longitude as a strongly typed `Angle` */
    get longitudeRef(): Angle;
    /** (property getter) (clone of)  longitude as a strongly typed `Angle` */
    get longitude(): Angle;
    /** (property getter) latitude in radians */
    get latitudeRadians(): number;
    /** (property getter) latitude in degrees */
    get latitudeDegrees(): number;
    /** (property getter) (reference to) latitude as a strongly typed `Angle` */
    get latitudeRef(): Angle;
    /** (property getter) (clone of)  latitude as a strongly typed `Angle` */
    get latitude(): Angle;
    /** Get or set the altitude. */
    get altitude(): number;
    set altitude(value: number);
    /** Constructor: Capture angles and altitude */
    private constructor();
    /** Create with all zero angles and altitude. */
    static createZero(): LongitudeLatitudeNumber;
    /** Create with strongly typed `Angle` inputs */
    static create(longitude: Angle, latitude: Angle, h?: number, result?: LongitudeLatitudeNumber): LongitudeLatitudeNumber;
    /** Create with angles in radians. */
    static createRadians(longitudeRadians: number, latitudeRadians: number, h?: number, result?: LongitudeLatitudeNumber): LongitudeLatitudeNumber;
    /** Create with angles in degrees. */
    static createDegrees(longitudeDegrees: number, latitudeDegrees: number, h?: number, result?: LongitudeLatitudeNumber): LongitudeLatitudeNumber;
    /**
     * Set content from a JSON object.
     * If the json object is undefined or unrecognized, always set a default value.
     *
     */
    setFromJSON(json: any): void;
    /** Return a json object with this object's contents.
     * * Tag names are: longitude, latitude, h
     */
    toJSON(): any;
    /** Test for near equality */
    isAlmostEqual(other: LongitudeLatitudeNumber): boolean;
    /** Return a copy */
    clone(): LongitudeLatitudeNumber;
}
