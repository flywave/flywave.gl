import { CurveLocationDetailPair } from "../curve/curve-location-detail";
import { type BeJSONFunctions } from "../geometry";
import { type Plane3dByOriginAndUnitNormal } from "./plane3d-by-origin-and-unit-normal";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { type Range3d, Range1d } from "./range";
import { Transform } from "./transform";
import { type XYAndZ } from "./xyz-props";
/**
 * A Ray3d contains
 * * an `origin` point.
 * * a `direction` vector (The vector is not required to be normalized).
 * * an optional weight (number).
 * @public
 */
export declare class Ray3d implements BeJSONFunctions {
    /** The ray origin */
    origin: Point3d;
    /** The ray direction. This is commonly (but not always) a unit vector. */
    direction: Vector3d;
    /** Numeric annotation. */
    a?: number;
    private static _workVector0?;
    private static _workVector1?;
    private static _workVector2?;
    private static _workVector3?;
    private static _workVector4?;
    private static _workMatrix?;
    private constructor();
    private static _create;
    /** Create a ray on the x axis. */
    static createXAxis(): Ray3d;
    /** Create a ray on the y axis. */
    static createYAxis(): Ray3d;
    /** Create a ray on the z axis. */
    static createZAxis(): Ray3d;
    /** Create a ray with all zeros. */
    static createZero(result?: Ray3d): Ray3d;
    /**
     * Test for nearly equal Ray3d objects.
     * * This tests for near equality of origin and direction -- i.e. member-by-member comparison.
     * * Use [[isAlmostEqualPointSet]] to allow origins to be anywhere along the common ray and to have to allow the
     * directions to be scaled or opposing.
     */
    isAlmostEqual(other: Ray3d): boolean;
    /**
     * Return the dot product of the ray's direction vector with a vector from the ray origin
     * to the `spacePoint`.
     * * If the instance is the unit normal of a plane, then this method returns the (signed) altitude
     * of `spacePoint` with respect to the plane.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/ProjectVectorOnPlane
     */
    dotProductToPoint(spacePoint: Point3d): number;
    /** Return the fractional coordinate (along the direction vector) of the `spacePoint` projected to the ray. */
    pointToFraction(spacePoint: Point3d): number;
    /** Return the `spacePoint` projected onto the ray. */
    projectPointToRay(spacePoint: Point3d): Point3d;
    /**
     * Test for nearly equal rays, allowing origin float and direction scaling.
     * * Use [[isAlmostEqual]] to require member-by-member comparison.
     */
    isAlmostEqualPointSet(other: Ray3d): boolean;
    /** Create a ray from origin and direction. */
    static create(origin: Point3d, direction: Vector3d, result?: Ray3d): Ray3d;
    /**
     * Given a homogeneous point and its derivative components, construct a Ray3d with cartesian
     * coordinates and derivatives.
     * @param weightedPoint `[x,y,z,w]` parts of weighted point.
     * @param weightedDerivative `[x,y,z,w]` derivatives
     * @param result
     */
    static createWeightedDerivative(weightedPoint: Float64Array, weightedDerivative: Float64Array, result?: Ray3d): Ray3d | undefined;
    /** Create from coordinates of the origin and direction. */
    static createXYZUVW(originX: number, originY: number, originZ: number, directionX: number, directionY: number, directionZ: number, result?: Ray3d): Ray3d;
    /** Capture origin and direction in a new Ray3d. */
    static createCapture(origin: Point3d, direction: Vector3d): Ray3d;
    /** Create from (clones of) origin, direction, and numeric weight. */
    static createPointVectorNumber(origin: Point3d, direction: Vector3d, a: number, result?: Ray3d): Ray3d;
    /** Create from origin and target. The direction vector is the full length (non-unit) vector from origin to target. */
    static createStartEnd(origin: Point3d, target: Point3d, result?: Ray3d): Ray3d;
    /** Return a reference to the ray's origin. */
    getOriginRef(): Point3d;
    /** Return a reference to the ray's direction vector. */
    getDirectionRef(): Vector3d;
    /** Copy coordinates from origin and direction. */
    set(origin: Point3d, direction: Vector3d): void;
    /** Clone the ray. */
    clone(result?: Ray3d): Ray3d;
    /** Return a clone of the transformed instance */
    cloneTransformed(transform: Transform, result?: Ray3d): Ray3d;
    /** Create a clone and return the inverse transform of the clone. */
    cloneInverseTransformed(transform: Transform, result?: Ray3d): Ray3d | undefined;
    /** Apply a transform in place. */
    transformInPlace(transform: Transform): void;
    /** Copy data from another ray. */
    setFrom(source: Ray3d): void;
    /**
     * Return a point at fractional position along the ray.
     * * fraction 0 is the ray origin.
     * * fraction 1 is at the end of the direction vector when placed at the origin.
     */
    fractionToPoint(fraction: number, result?: Point3d): Point3d;
    /**
     * Return a transform for rigid axes at ray origin with z in ray direction.
     * * If the direction vector is zero, axes default to identity (from [[Matrix3d.createRigidHeadsUp]])
     */
    toRigidZFrame(result?: Transform): Transform | undefined;
    /** Convert {origin:[x,y,z], direction:[u,v,w]} to a Ray3d. */
    setFromJSON(json?: any): void;
    /**
     * Construct a JSON object from this Ray3d.
     * @return {*} [origin,normal]
     */
    toJSON(): any;
    /** Create a new ray from json object. See `setFromJSON` for json structure; */
    static fromJSON(json?: any): Ray3d;
    /**
     * Try to scale the direction vector to a given `magnitude`.
     * * Returns `false` if the ray direction is a zero vector.
     */
    trySetDirectionMagnitudeInPlace(magnitude?: number): boolean;
    /**
     * Normalize the ray direction in place.
     * * If parameter `a` is clearly nonzero and the direction vector can be normalized,
     *    * Save the parameter `a` as the optional `a` member of the ray.
     *    * Normalize the ray's direction vector.
     * * If parameter `a` is nearly zero,
     *    * Set the `a` member to zero.
     *    * Set the ray's direction vector to zero.
     * @param a value to be saved (e.g,. area).
     * @returns `true` if `a` is nonzero and normalization was successful. Otherwise, return `false`.
     */
    tryNormalizeInPlaceWithAreaWeight(a: number): boolean;
    /** Return distance from the ray to point in space. */
    distance(spacePoint: Point3d): number;
    /**
     * Return the intersection parameter of the line defined by the ray with a `plane`.
     * * Stores the point of intersection in the `result` point (if passed as a parameter) and returns the parameter
     * along the ray where the intersection occurs. If we call the parameter 'f' then the point of intersection would
     * be `ray.origin + f * ray.direction`. Therefore:
     *    * if ray intersects the plane at its origin, the function returns f = 0.
     *    * if intersects at `ray.origin + ray.direction`, the function returns f = 1.
     *    * if intersects behind the ray origin, the function returns f < 0.
     *    * if intersects after `ray.origin + ray.direction`, the function returns f > 1.
     * * Returns `undefined` if the ray and plane are parallel or coplanar.
     */
    intersectionWithPlane(plane: Plane3dByOriginAndUnitNormal, result?: Point3d): number | undefined;
    /**
     * Find the intersection of the line defined by the ray with a Range3d.
     * * Return the range of parameters (on the ray) which are "inside" the range.
     * * Note that a range is always returned; if there is no intersection it is indicated by the test `result.isNull`.
     */
    intersectionWithRange3d(range: Range3d, result?: Range1d): Range1d;
    /**
     * Compute the intersection of the ray with a triangle.
     * * This method is faster than `BarycentricTriangle.intersectRay3d`.
     * @param vertex0 first vertex of the triangle
     * @param vertex1 second vertex of the triangle
     * @param vertex2 third vertex of the triangle
     * @param distanceTol optional tolerance used to check if ray is parallel to the triangle or if we have line
     * intersection but not ray intersection (if tolerance is not provided, Geometry.smallMetricDistance is used)
     * @param parameterTol optional tolerance used to snap barycentric coordinates of the intersection point to
     * a triangle edge or vertex (if tolerance is not provided, Geometry.smallFloatingPoint is used)
     * @param result optional pre-allocated object to fill and return
     * @returns the intersection point if ray intersects the triangle. Otherwise, return undefined.
     */
    intersectionWithTriangle(vertex0: Point3d, vertex1: Point3d, vertex2: Point3d, distanceTol?: number, parameterTol?: number, result?: Point3d): Point3d | undefined;
    /**
     * Return the shortest vector `v` to `targetPoint` from the line defined by this ray.
     * * If the projection of `targetPoint` onto the line defined by this ray is q, then `v  = targetPoint - q`.
     */
    perpendicularPartOfVectorToTarget(targetPoint: XYAndZ, result?: Vector3d): Vector3d;
    /**
     * Determine if two rays intersect, or are fully overlapped, or parallel but not coincident, or skew.
     * * Return a CurveLocationDetailPair which contains fraction and point on each ray and has
     * annotation (in member `approachType`) indicating one of these relationships:
     *   * CurveCurveApproachType.Intersection -- the rays have a simple intersection, at fractions indicated
     * in detailA and detailB
     *   * CurveCurveApproachType.PerpendicularChord -- there is pair of where the rays have closest approach.
     * The rays are skew in space.
     *   * CurveCurveApproachType.CoincidentGeometry -- the rays are the same unbounded line in space. The
     * fractions and points are a representative single common point.
     *   * CurveCurveApproachType.Parallel -- the rays are parallel (and not coincident). The two points are
     * at the minimum distance
     */
    static closestApproachRay3dRay3d(rayA: Ray3d, rayB: Ray3d): CurveLocationDetailPair;
    /**
     * Return a ray with `ray.origin` interpolated between `pt1` and `pt2` at the given `fraction`
     * and `ray.direction` set to the vector from `pt1` to `pt2` multiplied by the given `tangentScale`.
     * @param pt1 start point of the interpolation.
     * @param fraction fractional position between points.
     * @param pt2 end point of the interpolation.
     * @param tangentScale scale factor to apply to the startToEnd vector.
     * @param result optional receiver.
     */
    static interpolatePointAndTangent(pt1: XYAndZ, fraction: number, pt2: XYAndZ, tangentScale: number, result?: Ray3d): Ray3d;
}
