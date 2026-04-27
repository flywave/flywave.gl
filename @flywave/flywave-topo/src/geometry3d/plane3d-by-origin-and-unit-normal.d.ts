import { type BeJSONFunctions } from "../geometry";
import { type Point4d } from "../geometry4d/point4d";
import { type Angle } from "./angle";
import { Plane3d } from "./plane3d";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { Transform } from "./transform";
import { type XAndY } from "./xyz-props";
/**
 * A plane defined by
 * * Any point on the plane.
 * * a unit normal.
 * @public
 */
export declare class Plane3dByOriginAndUnitNormal extends Plane3d implements BeJSONFunctions {
    private readonly _origin;
    private readonly _normal;
    private constructor();
    private static _create;
    /**
     * Create a plane parallel to the XY plane
     * @param origin optional plane origin.  If omitted, the origin is placed at 000
     */
    static createXYPlane(origin?: Point3d): Plane3dByOriginAndUnitNormal;
    /**
     * Create a plane parallel to the YZ plane
     * @param origin optional plane origin.  If omitted, the origin is placed at 000
     */
    static createYZPlane(origin?: Point3d): Plane3dByOriginAndUnitNormal;
    /**
     * Create a plane parallel to the ZX plane
     * @param origin optional plane origin.  If omitted, the origin is placed at 000
     */
    static createZXPlane(origin?: Point3d): Plane3dByOriginAndUnitNormal;
    /**
     * Create a new Plane3dByOriginAndUnitNormal with given origin and normal.
     * * The inputs are NOT captured.
     * * Returns undefined if `normal.normalize()` returns undefined.
     */
    static create(origin: Point3d, normal: Vector3d, result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
    /**
     * Create a new Plane3dByOriginAndUnitNormal from a variety of plane types.
     * * The inputs are NOT captured.
     * * Returns undefined if `source.getUnitNormal()` returns undefined.
     */
    static createFrom(source: Plane3d, result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
    /**
     * Create a new  Plane3dByOriginAndUnitNormal with direct coordinates of origin and normal.
     * * Returns undefined if the normal vector is all zeros.
     * * If unable to normalize return undefined. (And if result is given it is left unchanged)
     */
    static createXYZUVW(ax: number, ay: number, az: number, ux: number, uy: number, uz: number, result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
    /**
     * Create a new  Plane3dByOriginAndUnitNormal with unit normal (a) in the xy plane (b) perpendicular to the line
     * defined by xy parts of origin to target.
     * * origin and normal both have z = 0.
     * * The inputs are NOT captured.
     * * Returns undefined if the normal vector is all zeros.
     */
    static createOriginAndTargetXY(origin: XAndY, target: XAndY, result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal | undefined;
    /**
     * Create a new  Plane3dByOriginAndUnitNormal with xy origin (at z=0) and normal angle in xy plane.
     * * Returns undefined if the normal vector is all zeros.
     */
    static createXYAngle(x: number, y: number, normalAngleFromX: Angle, result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal;
    /**
     * Create a plane defined by two points and an in-plane vector.
     * @param pointA any point in the plane
     * @param pointB any other point in the plane
     * @param vector any vector in the plane but not parallel to the vector from pointA to pointB
     */
    static createPointPointVectorInPlane(pointA: Point3d, pointB: Point3d, vector: Vector3d): Plane3dByOriginAndUnitNormal | undefined;
    /**
     * Create a plane defined by three points.
     * @param pointA any point in the plane.  This will be the origin.
     * @param pointB any other point in the plane
     * @param pointC any third point in the plane but not on the line of pointA and pointB
     */
    static createOriginAndTargets(pointA: Point3d, pointB: Point3d, pointC: Point3d): Plane3dByOriginAndUnitNormal | undefined;
    /**
     * Create a plane defined by a point and two vectors in the plane
     * @param pointA any point in the plane
     * @param vectorB any vector in the plane
     * @param vectorC any vector in the plane but not parallel to vectorB
     */
    static createOriginAndVectors(pointA: Point3d, vectorB: Vector3d, vectorC: Vector3d): Plane3dByOriginAndUnitNormal | undefined;
    /** Test for (toleranced) equality with `other` */
    isAlmostEqual(other: Plane3dByOriginAndUnitNormal): boolean;
    /** Parse a json fragment `{origin: [x,y,z], normal: [ux,uy,uz]}`  */
    setFromJSON(json?: any): void;
    /**
     * Convert to a JSON object.
     * @return {*} [origin,normal]
     */
    toJSON(): any;
    /**
     * Create a new Plane3dByOriginAndUnitNormal from json fragment.
     * * See `Plane3dByOriginAndUnitNormal.setFromJSON`
     */
    static fromJSON(json?: any): Plane3dByOriginAndUnitNormal;
    /** Return a reference to the origin. */
    getOriginRef(): Point3d;
    /** Return a reference to the unit normal. */
    getNormalRef(): Vector3d;
    /**
     * Return coordinate axes (as a transform) with
     * * origin at plane origin
     * * z axis in direction of plane normal.
     * * x,y axes in plane.
     */
    getLocalToWorld(): Transform;
    /** Return a (singular) transform which projects points to this plane. */
    getProjectionToPlane(): Transform;
    /** Copy coordinates from the given origin and normal. */
    set(origin: Point3d, normal: Vector3d): void;
    /** Return a deep clone (point and normal cloned) */
    clone(result?: Plane3dByOriginAndUnitNormal): Plane3dByOriginAndUnitNormal;
    /** Create a clone and return the transform of the clone. */
    cloneTransformed(transform: Transform, inverse?: boolean): Plane3dByOriginAndUnitNormal | undefined;
    /** Copy data from the given plane. */
    setFrom(source: Plane3dByOriginAndUnitNormal): void;
    /** Return the altitude of spacePoint above or below the plane.  (Below is negative) */
    altitude(spacePoint: Point3d): number;
    /** Return the altitude of point (x,y)  given xy parts using only the xy parts of origin and unit normal */
    altitudeXY(x: number, y: number): number;
    /** Return the x component of the normal used to evaluate altitude. */
    normalX(): number;
    /** Return the x component of the normal used to evaluate altitude. */
    normalY(): number;
    /** Return the z component of the normal used to evaluate altitude. */
    normalZ(): number;
    /** Return (a clone of) the unit normal. */
    getUnitNormal(result?: Vector3d): Vector3d | undefined;
    /** Return (a clone of) the origin. */
    getAnyPointOnPlane(result?: Point3d): Point3d;
    /** Return the signed altitude of weighted spacePoint above or below the plane.  (Below is negative) */
    weightedAltitude(spacePoint: Point4d): number;
    /** Return any point at specified (signed) altitude. */
    altitudeToPoint(altitude: number, result?: Point3d): Point3d;
    /**
     * Return the dot product of spaceVector with the plane's unit normal. This tells the rate of change of altitude
     * for a point moving at speed one along the spaceVector.
     */
    velocityXYZ(x: number, y: number, z: number): number;
    /**
     * Return the dot product of spaceVector with the plane's unit normal.  This tells the rate of change of altitude
     * for a point moving at speed one along the spaceVector.
     */
    velocity(spaceVector: Vector3d): number;
    /** Return the altitude of a point given as separate x,y,z components. */
    altitudeXYZ(x: number, y: number, z: number): number;
    /** Return the altitude of a point given as separate x,y,z,w components. */
    altitudeXYZW(x: number, y: number, z: number, w: number): number;
    /** Return the projection of spacePoint onto the plane. */
    projectPointToPlane(spacePoint: Point3d, result?: Point3d): Point3d;
    /**
     * Returns true if spacePoint is within distance tolerance of the plane.
     * * This logic is identical to the [[Plane3d]] method but avoids a level of function call.
     */
    isPointInPlane(spacePoint: Point3d, tolerance?: number): boolean;
}
