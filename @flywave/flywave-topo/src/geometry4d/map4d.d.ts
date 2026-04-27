import { type BeJSONFunctions } from "../geometry";
import { type Point3d, type Vector3d } from "../geometry3d/point3d-vector3d";
import { Transform } from "../geometry3d/transform";
import { Matrix4d } from "./matrix4d";
/**
 * Map4 carries two Matrix4d which are inverses of each other.
 * @public
 */
export declare class Map4d implements BeJSONFunctions {
    private _matrix0;
    private _matrix1;
    private constructor();
    /** Return a reference to (not copy of) the "forward" Matrix4d */
    get transform0(): Matrix4d;
    /** Return a reference to (not copy of) the "reverse" Matrix4d */
    get transform1(): Matrix4d;
    /** Create a Map4d, capturing the references to the two matrices. */
    static createRefs(matrix0: Matrix4d, matrix1: Matrix4d): Map4d;
    /** Create an identity map. */
    static createIdentity(): Map4d;
    /**
     * Create a Map4d with given transform pair.
     * @returns undefined if the transforms are not inverses of each other.
     */
    static createTransform(transform0: Transform, transform1?: Transform): Map4d | undefined;
    /**
     * Create a mapping the scales and translates (no rotation) between boxes.
     * @param lowA low point of box A
     * @param highA high point of box A
     * @param lowB low point of box B
     * @param highB high point of box B
     */
    static createBoxMap(lowA: Point3d, highA: Point3d, lowB: Point3d, highB: Point3d, result?: Map4d): Map4d | undefined;
    /** Copy contents from another Map4d */
    setFrom(other: Map4d): void;
    /** Return a clone of this Map4d */
    clone(): Map4d;
    /** Reinitialize this Map4d as an identity. */
    setIdentity(): void;
    /** Set this map4d from a json object that the two Matrix4d values as properties named matrix0 and matrix1 */
    setFromJSON(json: any): void;
    /** Create a map4d from a json object that the two Matrix4d values as properties named matrix0 and matrix1 */
    static fromJSON(json?: any): Map4d;
    /** Return a json object `{matrix0: value0, matrix1: value1}` */
    toJSON(): any;
    /** Test if both matrices are almost equal to those */
    isAlmostEqual(other: Map4d): boolean;
    /**
     * Create a map between a frustum and world coordinates.
     * @param origin lower left of frustum
     * @param uVector Vector from lower left rear to lower right rear.
     * @param vVector Vector from lower left rear to upper left rear.
     * @param wVector Vector from lower left rear to lower left front, i.e. lower left rear towards eye.
     * @param fraction front size divided by rear size.
     */
    static createVectorFrustum(origin: Point3d, uVector: Vector3d, vVector: Vector3d, wVector: Vector3d, fraction: number): Map4d | undefined;
    /**
     * Multiply this*other. The output matrices are
     * * output matrix0 = `this.matrix0 * other.matrix0`
     * * output matrix1 = 'other.matrix1 * this.matrix1`
     */
    multiplyMapMap(other: Map4d): Map4d;
    /** Exchange the two matrices of the map. */
    reverseInPlace(): void;
    /**
     * Return a Map4d whose transform0 is
     * other.transform0 * this.transform0 * other.transform1
     */
    sandwich0This1(other: Map4d): Map4d;
    /**
     * Return a Map4d whose transform0 is
     * other.transform1 * this.transform0 * other.transform0
     */
    sandwich1This0(other: Map4d): Map4d;
}
