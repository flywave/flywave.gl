import { type Point3d } from "../geometry3d/point3d-vector3d";
import { Point4d } from "./point4d";
/**
 * A PlaneByOriginAndVectors4d is a 4d origin and pair of 4d "vectors" defining a 4d plane.
 * * The parameterization of the plane is    `X = origin + vectorU * u + vectorV * v`
 * * With particular weight values `origin.w === 1, vectorU.w === 0, vectorV.w === 0` this is like `Plane3dByOriginAndVectors`
 * * With other weights, the deweighted xyz coordinates of points on the 4d plane still form a 3d plane.
 * @public
 */
export declare class PlaneByOriginAndVectors4d {
    /** homogeneous origin */
    origin: Point4d;
    /** homogeneous u-direction vector */
    vectorU: Point4d;
    /** homogeneous v-direction vector */
    vectorV: Point4d;
    private constructor();
    /** Return a clone of this plane */
    clone(result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
    /** copy all content from other plane */
    setFrom(other: PlaneByOriginAndVectors4d): void;
    /** Return true if origin, vectorU, and vectorV pass isAlmostEqual. */
    isAlmostEqual(other: PlaneByOriginAndVectors4d): boolean;
    /** Create a plane with (copies of) origin, vectorU, vectorV parameters, all given as full 4d points.
     */
    static createOriginAndVectors(origin: Point4d, vectorU: Point4d, vectorV: Point4d, result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
    /** Set all numeric data from complete list of (x,y,z,w) in origin, vectorU, and vectorV */
    setOriginAndVectorsXYZW(x0: number, y0: number, z0: number, w0: number, ux: number, uy: number, uz: number, uw: number, vx: number, vy: number, vz: number, vw: number): this;
    /** Copy the contents of origin, vectorU, vectorV parameters to respective member variables */
    setOriginAndVectors(origin: Point4d, vectorU: Point4d, vectorV: Point4d): this;
    /** Create from complete list of (x,y,z,w) in origin, vectorU, and vectorV */
    static createOriginAndVectorsXYZW(x0: number, y0: number, z0: number, w0: number, ux: number, uy: number, uz: number, uw: number, vx: number, vy: number, vz: number, vw: number, result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
    /** create from origin point, (u=1,v=0) point, and (u=0,v=1) point. */
    static createOriginAndTargets3d(origin: Point3d, targetU: Point3d, targetV: Point3d, result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
    /** evaluate plane point (full 3d) at given (u,v) coordinate. */
    fractionToPoint(u: number, v: number, result?: Point4d): Point4d;
    /** create a new plane which maps to the cartesian xy plane. */
    static createXYPlane(result?: PlaneByOriginAndVectors4d): PlaneByOriginAndVectors4d;
}
