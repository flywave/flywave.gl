import { type BeJSONFunctions } from "../geometry";
import { Angle } from "../geometry3d/angle";
/**
 * OPerations on a "complex number" class with real part `x` and complex part `y`
 * @internal
 */
export declare class Complex implements BeJSONFunctions {
    private _x;
    /** Real part */
    get x(): number;
    set x(value: number);
    private _y;
    /** Imaginary part */
    get y(): number;
    set y(value: number);
    constructor(x?: number, y?: number);
    /** set x and y parts from args. */
    set(x?: number, y?: number): void;
    /** set `this.x` and `this.y` from `other.x` and `other.y` */
    setFrom(other: Complex): void;
    /** clone the complex x,y */
    clone(): Complex;
    /** test for near equality using coordinate tolerances */
    isAlmostEqual(other: Complex): boolean;
    /** Create a new Complex instance from given x and y. */
    static create(x?: number, y?: number, result?: Complex): Complex;
    /** Return the complex sum `this+other` */
    plus(other: Complex, result?: Complex): Complex;
    /** Return the complex difference  `this-other` */
    minus(other: Complex, result?: Complex): Complex;
    /** Return the complex product  `this * other` */
    times(other: Complex, result?: Complex): Complex;
    /** Return the complex product `this * x+i*y`. That is, the second Complex value exists via the args without being formally created as an instance. */
    timesXY(x: number, y: number, result?: Complex): Complex;
    /** Return the mangitude of the complex number */
    magnitude(): number;
    /** Return the angle from x axis to the vector (x,y) */
    angle(): Angle;
    /** Return the xy plane distance between this and other */
    distance(other: Complex): number;
    /** Return the squared xy plane distance between this and other. */
    magnitudeSquared(): number;
    /** Return the complex division `this / other` */
    divide(other: Complex, result?: Complex): Complex | undefined;
    /** Return the complex square root of this. */
    sqrt(result?: Complex): Complex;
    /** set the complex x,y from a json object of the form like
     * * x,y key value pairs:   `{x:1,y:2}`
     * * array of numbers:  `[1,2]`
     */
    setFromJSON(json?: any): void;
    /** Create a `Complex` instance from a json object. */
    static fromJSON(json?: any): Complex;
    /**
     * Convert an Complex to a JSON object.
     * @return {*} [x,y]
     */
    toJSON(): any;
}
