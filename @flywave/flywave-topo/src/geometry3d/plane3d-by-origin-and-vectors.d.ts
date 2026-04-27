import { type BeJSONFunctions } from "../geometry";
import { type Point4d } from "../geometry4d/point4d";
import { Plane3d } from "./plane3d";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { Ray3d } from "./ray3d";
import { Transform } from "./transform";
import { type XYAndZ } from "./xyz-props";
/**
 * A Plane3dByOriginAndVectors is an origin and a pair of vectors.
 * This defines a plane with a (possibly skewed) uv coordinate grid
 * * The grid directions (`vectorU` and `vectorV`)
 *   * are NOT required to be unit vectors.
 *   * are NOT required to be perpendicular vectors.
 * * The skewed, non-uniform scaling of the grid directions is the primary focus of this class.
 * * Queries of altitude, velocity, normalX, normalY, and normalZ use the NORMALIZED cross product of vectorU
 * and vectorV as plane normal.
 *   * Hence these are cartesian distances.
 *   * If numerous calls to these are expected, the repeated normalization may be a performance issue.
 *   * Using a [[Plane3dByOriginAndUnitNormal]] or the rigid transform returned by [[toRigidFrame]] would provide
 * better performance.
 * @public
 */
export declare class Plane3dByOriginAndVectors extends Plane3d implements BeJSONFunctions {
    /** Origin of plane grid */
    origin: Point3d;
    /** u direction in plane grid */
    vectorU: Vector3d;
    /** v direction in plane grid */
    vectorV: Vector3d;
    private constructor();
    /** Create a new plane from origin and 2 in-plane vectors. */
    static createOriginAndVectors(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /** Clone to a new plane. */
    clone(result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Create a new Plane3dByOriginAndVectors from a variety of plane types.
     * * The input is NOT captured.
     */
    static createFrom(source: Plane3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
    /**
     * Return a Plane3dByOriginAndVectors, with
     * * origin is the translation (aka origin) from the Transform
     * * vectorU is the X column of the transform
     * * vectorV is the Y column of the transform.
     * @param transform source transform
     * @param xLength optional length to impose on vectorU.
     * @param yLength optional length to impose on vectorV.
     * @param result optional preexisting result
     */
    static createFromTransformColumnsXYAndLengths(transform: Transform, xLength: number | undefined, yLength: number | undefined, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /** Capture origin and directions in a new plane. */
    static createCapture(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /** Set all origin and both vectors from direct numeric parameters */
    setOriginAndVectorsXYZ(x0: number, y0: number, z0: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number): this;
    /**
     * Set all origin and both vectors from coordinates in given origin and vectors.
     * * Note that coordinates are copied out of the parameters -- the given parameters are NOT retained by reference.
     */
    setOriginAndVectors(origin: Point3d, vectorU: Vector3d, vectorV: Vector3d): this;
    /** Create a new plane from direct numeric parameters */
    static createOriginAndVectorsXYZ(x0: number, y0: number, z0: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Define a plane by three points in the plane.
     * @param origin origin for the parameterization.
     * @param targetU target point for the vectorU starting at the origin.
     * @param targetV target point for the vectorV originating at the origin.
     * @param result optional result.
     */
    static createOriginAndTargets(origin: Point3d, targetU: Point3d, targetV: Point3d, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /** Create a plane with origin at 000, unit vectorU in x direction, and unit vectorV in the y direction. */
    static createXYPlane(result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Create a plane from data presented as Float64Arrays.
     * @param origin x,y,z of origin.
     * @param vectorU x,y,z of vectorU
     * @param vectorV x,y,z of vectorV
     */
    static createOriginAndVectorsArrays(origin: Float64Array, vectorU: Float64Array, vectorV: Float64Array, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Create a plane from data presented as Float64Array with weights
     * @param origin x,y,z,w of origin.
     * @param vectorU x,y,z,w of vectorU
     * @param vectorV x,y,z,w of vectorV
     */
    static createOriginAndVectorsWeightedArrays(originW: Float64Array, vectorUw: Float64Array, vectorVw: Float64Array, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Evaluate a point a grid coordinates on the plane.
     * * The computed point is `origin + vectorU * u + vectorV * v`
     * @param u coordinate along vectorU
     * @param v coordinate along vectorV
     * @param result optional result destination.
     * @returns Return the computed coordinate.
     */
    fractionToPoint(u: number, v: number, result?: Point3d): Point3d;
    /** Return the vector from the plane origin to parametric coordinate (u.v) */
    fractionToVector(u: number, v: number, result?: Vector3d): Vector3d;
    /** Set coordinates from a json object such as `{origin: [1,2,3], vectorU:[4,5,6], vectorV[3,2,1]}` */
    setFromJSON(json?: any): void;
    /**
     * Convert an Angle to a JSON object.
     * @return {*} [origin,normal]
     */
    toJSON(): any;
    /** Create a new plane.   See `setFromJSON` for layout example. */
    static fromJSON(json?: any): Plane3dByOriginAndVectors;
    /** Test origin and vectors for isAlmostEqual with `other` */
    isAlmostEqual(other: Plane3dByOriginAndVectors): boolean;
    /**
     * Normalize both `vectorU` and `vectorV` in place. This does NOT make them perpendicular.
     * * Return true if both succeeded.
     */
    normalizeInPlace(): boolean;
    /** Return (if possible) a unit normal to the plane */
    getUnitNormal(result?: Vector3d): Vector3d | undefined;
    /**
     * Return (if possible) a unit normal to the plane.
     * * This method is the same as getUnitNormal, which was created later as part of the abstract base class Plane3d.
     */
    unitNormal(result?: Vector3d): Vector3d | undefined;
    /**
     * Return some point on the plane.
     */
    getAnyPointOnPlane(result?: Point3d): Point3d;
    private static _workVector;
    /** Return (if possible) a ray with origin at plane origin, direction as unit normal to the plane */
    unitNormalRay(result?: Ray3d): Ray3d | undefined;
    /**
     * Create a rigid frame (i.e. frenet frame) with
     * * origin at the plane origin
     * * x axis along the (normalized) vectorU
     * * y axis normalized vectorU to vectorV plane, and perpendicular to x axis
     * * z axis perpendicular to both.
     * @param result optional result
     */
    toRigidFrame(result?: Transform): Transform | undefined;
    /** Apply the transform to the origin and vectors in place */
    transformInPlace(transform: Transform): void;
    /**
     * Return x component of the (normalized!) {vectorU CROSS vectorV}.
     * Return 0 if the cross product is zero.
     */
    normalX(): number;
    /**
     * Return y component of the (normalized!) {vectorU CROSS vectorV}.
     * Return 0 if the cross product is zero.
     */
    normalY(): number;
    /**
     * Return z component of the (normalized!) {vectorU CROSS vectorV}.
     * Return 0 if the cross product is zero.
     */
    normalZ(): number;
    /** Return signed cartesian altitude perpendicular to the plane. This uses the normalized cross product as normal. */
    altitude(xyz: XYAndZ): number;
    /** Return signed cartesian altitude perpendicular to the plane. This uses the normalized cross product as normal. */
    altitudeXYZ(x: number, y: number, z: number): number;
    /** Return signed projection of the input vector to the plane normal. This uses the normalized cross product as normal. */
    velocity(xyzVector: XYAndZ): number;
    /** Return signed projection of the input vector to the plane normal. This uses the normalized cross product as normal. */
    velocityXYZ(x: number, y: number, z: number): number;
    /**
     * Return triple product of homogeneous difference {(xyzw - w * origin)} with vectorU and vectorV.
     * * In the usual manner of homogeneous calculations, this is proportional to true cartesian distance from the
     * plane but is not a physical distance.
     */
    weightedAltitude(xyzw: Point4d): number;
    /**
     * Return the projection of spacePoint onto the plane.
     * If the plane is degenerate to a ray, project to the ray.
     * If the plane is degenerate to its origin, return the point
     */
    projectPointToPlane(spacePoint: Point3d, result?: Point3d): Point3d;
}
