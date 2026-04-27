import { Point2d } from "../geometry3d/point2d-vector2d";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type Ray3d } from "../geometry3d/ray3d";
import { type HalfEdge } from "./graph";
/**
 * Reference to a HalfEdge node with extra XYZ and UV data.
 * @internal
 */
export declare class NodeXYZUV {
    private _node;
    private _x;
    private _y;
    private _z;
    private _u;
    private _v;
    private constructor();
    /** Set all content directly from args.
     * @returns `this` reference
     */
    set(node: HalfEdge, x: number, y: number, z: number, u: number, v: number): this;
    setFrom(other: NodeXYZUV): void;
    /** Create a `NodeXYZUV` with
     * * x,y,z at ray origin
     * * u,v as dotXY and crossXY for the ray direction with x,y distances from the ray origin.
     */
    static createNodeAndRayOrigin(node: HalfEdge, ray: Ray3d, result?: NodeXYZUV): NodeXYZUV;
    /** Create a `NodeXYZUV` with explicit node, xyz, uv */
    static create(node: HalfEdge, x?: number, y?: number, z?: number, u?: number, v?: number): NodeXYZUV;
    /** Access the node. */
    get node(): HalfEdge;
    /** Access the x coordinate */
    get x(): number;
    /** Access the y coordinate */
    get y(): number;
    /** Access the z coordinate */
    get z(): number;
    /** Access the u coordinate */
    get u(): number;
    /** Access the v coordinate */
    get v(): number;
    /** Access the x,y,z coordinates as Point3d with optional caller-supplied result. */
    getXYZAsPoint3d(result?: Point3d): Point3d;
    /** Access the uv coordinates as Point2d with optional caller-supplied result. */
    getUVAsPoint2d(result?: Point2d): Point2d;
    /** Toleranced comparison function for u coordinate */
    classifyU(target: number, tol: number): number;
    /** Toleranced comparison function for v coordinate */
    classifyV(target: number, tol: number): number;
}
