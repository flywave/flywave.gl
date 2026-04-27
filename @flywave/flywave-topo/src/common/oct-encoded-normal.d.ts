import { Vector3d } from "../geometry3d/point3d-vector3d";
import { type XYAndZ } from "../geometry3d/xyz-props";
/** Represents a 3d normal vector compressed into a single 16-bit integer using [oct-encoding](http://jcgt.org/published/0003/02/01/paper.pdf).
 * These are chiefly used to reduce the space required to store normal vectors for [RenderGraphic]($frontend)s.
 * @public
 */
export declare class OctEncodedNormal {
    /** The encoded normal. */
    readonly value: number;
    /** Construct directly from a 16-bit encoded value.
     * @see [[encode]] to compute the encoded value.
     * @see [[fromVector]] to construct from a vector.
     */
    constructor(val: number);
    /** Compute the encoded 16-bit value of the supplied normalized vector. */
    static encode(vec: XYAndZ): number;
    /** Compute the encoded 16-bit value of the supplied normalized vector components. */
    static encodeXYZ(nx: number, ny: number, nz: number): number;
    /** Create an OctEncodedNormal from a normalized vector. */
    static fromVector(val: XYAndZ): OctEncodedNormal;
    /** Decode this oct-encoded normal into a normalized vector. */
    decode(): Vector3d;
    /** Decode a 16-bit encoded value into a normalized vector. */
    static decodeValue(val: number, result?: Vector3d): Vector3d;
}
/** @internal */
export declare class OctEncodedNormalPair {
    first: OctEncodedNormal;
    second: OctEncodedNormal;
    constructor(first: OctEncodedNormal, second: OctEncodedNormal);
}
