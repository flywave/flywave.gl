import { CurveAndSurfaceLocationDetail } from "../bspline/surface-location-detail";
import { type Clipper } from "../clipping/clip-utils";
import { Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumber, type AnnounceNumberNumberCurvePrimitive } from "../curve/curve-primitive";
import { Point4d } from "../geometry4d/point4d";
import { Angle } from "./angle";
import { AngleSweep } from "./angle-sweep";
import { type UVSurface } from "./geometry-handler";
import { LongitudeLatitudeNumber } from "./longitude-latitude-altitude";
import { Matrix3d } from "./matrix3d";
import { Plane3dByOriginAndUnitNormal } from "./plane3d-by-origin-and-unit-normal";
import { Plane3dByOriginAndVectors } from "./plane3d-by-origin-and-vectors";
import { Point3d, Vector3d } from "./point3d-vector3d";
import { Range3d } from "./range";
import { Ray3d } from "./ray3d";
import { Transform } from "./transform";
import { type XYAndZ } from "./xyz-props";
/**
 * * An Ellipsoid is a (complete) unit sphere with an arbitrary (possibly skewed) `Transform` to 3d.
 * * The (unit) sphere parameterization with respect to longitude `theta` and latitude `phi` is
 *    * `u = cos(theta) * cos (phi)`
 *    * `v = sin(theta) * cos(phi)`
 *    * `w = sin(phi)`
 *  * The sphere (u,v,w) multiply the x,y,z columns of the Ellipsoid transform.
 * @public
 */
export declare class Ellipsoid implements Clipper {
    private readonly _transform;
    private readonly _unitVectorA;
    private readonly _unitVectorB;
    private readonly _workPointA;
    private readonly _workPointB;
    private constructor();
    /** Create with a clone (not capture) with given transform.
     * * If transform is undefined, create a unit sphere.
     */
    static create(matrixOrTransform?: Transform | Matrix3d): Ellipsoid;
    /**
     * Create a transform with given center and directions, applying the radii as multipliers for the respective columns of the axes.
     * @param center center of ellipsoid
     * @param axes x,y,z directions are columns of this matrix
     * @param radiusX multiplier to be applied to the x direction
     * @param radiusY multiplier to be applied to the y direction
     * @param radiusZ  multiplier to be applied to the z direction
     */
    static createCenterMatrixRadii(center: Point3d, axes: Matrix3d | undefined, radiusX: number, radiusY: number, radiusZ: number): Ellipsoid;
    /** Return a (REFERENCE TO) the transform from world space to the mapped sphere space.
     * * This maps coordinates "relative to the sphere" to world.
     * * Its inverse maps world coordinates into the sphere space.
     *   * In the sphere space, an xyz (vector from origin) with magnitude equal to 1 is ON the sphere (hence its world image is ON the ellipsoid)
     *   * In the sphere space, an xyz (vector from origin) with magnitude less than 1 is INSIDE the sphere (hence its world image is INSIDE the ellipsoid)
     *   * In the sphere space, an xyz (vector from origin) with magnitude greater than 1 is OUTSIDE the sphere (hence its world image is OUTSIDE the ellipsoid)
     */
    get transformRef(): Transform;
    /**
     * * Convert a world point to point within the underlying mapped sphere space.
     *   * In the sphere space, an xyz (vector from origin) with magnitude equal to 1 is ON the sphere (hence its world image is ON the ellipsoid)
     *   * In the sphere space, an xyz (vector from origin) with magnitude less than 1 is INSIDE the sphere (hence its world image is INSIDE the ellipsoid)
     *   * In the sphere space, an xyz (vector from origin) with magnitude greater than 1 is OUTSIDE the sphere (hence its world image is OUTSIDE the ellipsoid)
     * * This is undefined in the highly unusual case that the ellipsoid frame is singular.
     */
    worldToLocal(worldPoint: XYAndZ, result?: Point3d): Point3d | undefined;
    /**
     * * Convert a point within the underlying mapped sphere space to world coordinates.
     *   * In the sphere space, an xyz (vector from origin) with magnitude equal to 1 is ON the sphere (hence its world image is ON the ellipsoid)
     *   * In the sphere space, an xyz (vector from origin) with magnitude less than 1 is INSIDE the sphere (hence its world image is INSIDE the ellipsoid)
     *   * In the sphere space, an xyz (vector from origin) with magnitude greater than 1 is OUTSIDE the sphere (hence its world image is OUTSIDE the ellipsoid)
     */
    localToWorld(localPoint: XYAndZ, result?: Point3d): Point3d;
    /** return a clone with same coordinates */
    clone(): Ellipsoid;
    /** test equality of the 4 points */
    isAlmostEqual(other: Ellipsoid): boolean;
    /** Apply the transform to each point */
    tryTransformInPlace(transform: Transform): boolean;
    /**
     * return a cloned and transformed ellipsoid.
     * @param transform
     */
    cloneTransformed(transform: Transform): Ellipsoid | undefined;
    /** Find the closest point of the (patch of the) ellipsoid.
     * * In general there are multiple points where a space point projects onto an ellipse.
     * * This searches for only one point, using heuristics which are reliable for points close to the surface but not for points distant from highly skewed ellipsoid
     */
    projectPointToSurface(spacePoint: Point3d): LongitudeLatitudeNumber | undefined;
    /** Find the silhouette of the ellipsoid as viewed from a homogeneous eyepoint.
     * * Returns undefined if the eyepoint is inside the ellipsoid
     */
    silhouetteArc(eyePoint: Point4d): Arc3d | undefined;
    /** Compute intersections with a ray.
     * * Return the number of intersections
     * * Fill any combinations of arrays of
     *    * rayFractions = fractions along the ray
     *    * xyz = xyz intersection coordinates points in space
     *    * thetaPhiRadians = sphere longitude and latitude in radians.
     * * For each optional array, caller must of course initialize an array (usually empty)
     * * return 0 if ray length is too small.
     */
    intersectRay(ray: Ray3d, rayFractions: number[] | undefined, xyz: Point3d[] | undefined, thetaPhiRadians: LongitudeLatitudeNumber[] | undefined): number;
    /** Return the range of a uv-aligned patch of the sphere. */
    patchRangeStartEndRadians(theta0Radians: number, theta1Radians: number, phi0Radians: number, phi1Radians: number, result?: Range3d): Range3d;
    /**
     * Evaluate a point on the ellipsoid at angles give in radians.
     * @param thetaRadians longitude, in radians
     * @param phiRadians latitude, in radians
     * @param result optional point result
     */
    radiansToPoint(thetaRadians: number, phiRadians: number, result?: Point3d): Point3d;
    /**
     * * For a given pair of points on an ellipsoid, construct an arc (possibly elliptical) which
     *   * passes through both points
     *   * is completely within the ellipsoid surface
     *   * has its centerEvaluate a point on the ellipsoid at angles give in radians.
     * * If the ellipsoid is a sphere, this is the shortest great-circle arc between the two points.
     * * If the ellipsoid is not a sphere, this is close to but not precisely the shortest path.
     * @param thetaARadians longitude, in radians, for pointA
     * @param phiARadians latitude, in radians, for pointA
     * @param thetaBRadians longitude, in radians, for pointB
     * @param phiBRadians latitude, in radians, for pointB
     * @param result optional preallocated result
     */
    radiansPairToGreatArc(thetaARadians: number, phiARadians: number, thetaBRadians: number, phiBRadians: number, result?: Arc3d): Arc3d | undefined;
    /**
     * See radiansPairToGreatArc, which does this computation with positions from `angleA` and `angleB` directly as radians
     */
    anglePairToGreatArc(angleA: LongitudeLatitudeNumber, angleB: LongitudeLatitudeNumber, result?: Arc3d): Arc3d | undefined;
    /**
     * Construct an arc for the section cut of a plane with the ellipsoid.
     * * this is undefined if the plane does not intersect the ellipsoid.
     */
    createPlaneSection(plane: Plane3dByOriginAndUnitNormal): Arc3d | undefined;
    /**
     * Construct an arc which
     *  * start at pointA (defined by its angle position)
     *  * ends at pointB (defined by its angle position)
     *  * contains the 3rd vector as an in-plane point.
     */
    createSectionArcPointPointVectorInPlane(pointAnglesA: LongitudeLatitudeNumber, pointAnglesB: LongitudeLatitudeNumber, inPlaneVector: Vector3d, result?: Arc3d): Arc3d | undefined;
    /**
     * * For a given pair of points on an ellipsoid, construct another ellipsoid
     *   * touches the same xyz points in space
     *   * has transformation modified so that the original two points are on the equator.
     * * Note that except for true sphere inputs, the result axes can be both non-perpendicular axes and of different lengths.
     * @param thetaARadians longitude, in radians, for pointA
     * @param phiARadians latitude, in radians, for pointA
     * @param thetaBRadians longitude, in radians, for pointB
     * @param phiBRadians latitude, in radians, for pointB
     * @param result optional preallocated result
     */
    radiansPairToEquatorialEllipsoid(thetaARadians: number, phiARadians: number, thetaBRadians: number, phiBRadians: number, result?: Ellipsoid): Ellipsoid | undefined;
    /**
     * Return an arc (circular or elliptical) at constant longitude
     * @param longitude (strongly typed) longitude
     * @param latitude latitude sweep angles
     * @param result
     */
    constantLongitudeArc(longitude: Angle, latitudeSweep: AngleSweep, result?: Arc3d): Arc3d | undefined;
    /**
     * Return an arc (circular or elliptical) at constant longitude
     * @param latitude sweep angles
     * @param latitude (strongly typed) latitude
     * @param result
     */
    constantLatitudeArc(longitudeSweep: AngleSweep, latitude: Angle, result?: Arc3d): Arc3d | undefined;
    /**
     * * create a section arc with and end at positions A and B, and in plane with the normal at a fractional
     *    interpolation between.
     * @param angleA start point of arc (given as angles on this ellipsoid)
     * @param intermediateNormalFraction
     * @param angleB end point of arc (given as angles on this ellipsoid)
     */
    sectionArcWithIntermediateNormal(angleA: LongitudeLatitudeNumber, intermediateNormalFraction: number, angleB: LongitudeLatitudeNumber): Arc3d;
    /**
     * Evaluate a point and derivatives with respect to angle on the ellipsoid at angles give in radians.
     * * "u direction" vector of the returned plane is derivative with respect to longitude.
     * * "v direction" vector fo the returned plane is derivative with respect ot latitude.
     * @param thetaRadians longitude, in radians
     * @param phiRadians latitude, in radians
     * @param applyCosPhiFactor selector for handling of theta (around equator derivative)
     *   * if true, compute the properly scaled derivative, which goes to zero at the poles.
     *    * If false, omit he cos(phi) factor on the derivative wrt theta.  This ensures it is always nonzero and can be safely used in cross product for surface normal.
     * @param result optional plane result
     */
    radiansToPointAndDerivatives(thetaRadians: number, phiRadians: number, applyCosPhiFactor?: boolean, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * Evaluate a point and derivatives wrt to theta, phi, thetaTheta, phiPhi, and thetaPhi.
     * All outputs are to caller-allocated points and vectors.
     * @param thetaRadians longitude, in radians
     * @param phiRadians latitude, in radians
     * @param point (returned) surface point
     * @param d1Theta (returned) derivative wrt theta
     * @param d1Phi (returned) derivative wrt phi
     * @param d2ThetaTheta (returned) second derivative wrt theta twice
     * @param d2PhiPhi (returned) second derivative wrt phi twice
     * @param d2ThetaPhi (returned) second derivative wrt theta and phi
     * @param result optional plane result
     */
    radiansToPointAnd2Derivatives(thetaRadians: number, phiRadians: number, point: Point3d, d1Theta: Vector3d, d1Phi: Vector3d, d2ThetaTheta: Vector3d, d2PhiPhi: Vector3d, d2ThetaPhi: Vector3d): void;
    /**
     * Evaluate a point and rigid local coordinate frame the ellipsoid at angles give in radians.
     * * The undefined return is only possible if the placement transform is singular (and even then only at critical angles)
     * @param thetaRadians longitude, in radians
     * @param phiRadians latitude, in radians
     * @param result optional transform result
     *
     */
    radiansToFrenetFrame(thetaRadians: number, phiRadians: number, result?: Transform): Transform | undefined;
    /**
     * Evaluate a point and unit normal at given angles.
     * @param thetaRadians longitude, in radians
     * @param phiRadians latitude, in radians
     * @param result optional transform result
     *
     */
    radiansToUnitNormalRay(thetaRadians: number, phiRadians: number, result?: Ray3d): Ray3d | undefined;
    /**
     * Find the (unique) extreme point for a given true surface perpendicular vector (outward)
     */
    surfaceNormalToAngles(normal: Vector3d, result?: LongitudeLatitudeNumber): LongitudeLatitudeNumber;
    /**
     * * Evaluate the surface normal on `other` ellipsoid at given angles
     *    * If `other` is undefined, default to unit sphere.
     * * Find the angles for the same normal on `this` ellipsoid
     */
    otherEllipsoidAnglesToThisEllipsoidAngles(otherEllipsoid: Ellipsoid | undefined, otherAngles: LongitudeLatitudeNumber, result?: LongitudeLatitudeNumber): LongitudeLatitudeNumber | undefined;
    /**
     * * if ellipsoid is given, return its surface point and unit normal as a Ray3d.
     * * if not given, return surface point and unit normal for unit sphere.
     */
    static radiansToUnitNormalRay(ellipsoid: Ellipsoid | undefined, thetaRadians: number, phiRadians: number, result?: Ray3d): Ray3d | undefined;
    /** Implement the `isPointInOnOrOutside` test fom the `interface` */
    isPointOnOrInside(point: Point3d): boolean;
    /** Announce "in" portions of a line segment.  See `Clipper.announceClippedSegmentIntervals` */
    announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: AnnounceNumberNumber): boolean;
    /** Announce "in" portions of a line segment.  See `Clipper.announceClippedSegmentIntervals` */
    announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
}
/**
 * * An `EllipsoidPatch` is
 *   * An underlying (full) `Ellipsoid` object
 *   * an angular range (`AngleSweep`) of longitudes around the equator
 *   * an angular range (`AngleSweep`) of latitudes, with 0 at the equator, +90 degrees at north pole.
 * * The `EllipsoidPatch` implements `UVSurface` methods, so a `PolyfaceBuilder` can generate facets in its method `addUVGridBody`
 * @public
 */
export declare class EllipsoidPatch implements UVSurface {
    ellipsoid: Ellipsoid;
    longitudeSweep: AngleSweep;
    latitudeSweep: AngleSweep;
    /**
     * CAPTURE ellipsoid and sweeps as an EllipsoidPatch.
     * @param ellipsoid
     * @param longitudeSweep
     * @param latitudeSweep
     */
    private constructor();
    /**
     * Create a new EllipsoidPatch, capturing (not cloning) all input object references.
     * @param ellipsoid  full ellipsoid
     * @param longitudeSweep sweep of longitudes in the active patch
     * @param latitudeSweep sweep of latitudes in the active patch.
     */
    static createCapture(ellipsoid: Ellipsoid, longitudeSweep: AngleSweep, latitudeSweep: AngleSweep): EllipsoidPatch;
    /** Return the point on the ellipsoid at fractional positions in the angular ranges. */
    uvFractionToPoint(longitudeFraction: number, latitudeFraction: number, result?: Point3d): Point3d;
    /** Return the point and derivative vectors on the ellipsoid at fractional positions in the angular ranges.
     * * Derivatives are with respect to fractional position.
     */
    uvFractionToPointAndTangents(longitudeFraction: number, latitudeFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /** Return the range of the patch, considering both boundary and internal extrema. */
    range(result?: Range3d): Range3d;
    /** Return intersections of the ray and surface.
     * * uv values in the intersections are in radians unless `convertIntersectionRadiansToFractions` is true requesting conversion to patch fractions.
     */
    intersectRay(ray: Ray3d, restrictToPatch: boolean, convertIntersectionRadiansToFractions?: boolean): CurveAndSurfaceLocationDetail[];
    /**
     * test if the angles of the `LongitudeLatitudeNumber` are within the sweep ranges.
     * @param position longitude and latitude to test.
     * @param `allowPeriodicLongitude` true to allow the longitude to be in when shifted by a multiple of 2 PI
     *    (latitude is never periodic for patches)
     */
    containsAngles(position: LongitudeLatitudeNumber, allowPeriodicLongitude?: boolean): boolean;
    /**
     * Compute point (with altitude) at given angles and altitude.
     * * Never fails for non-singular ellipsoid.
     * * In the returned ray,
     *    * ray.origin is the point at requested altitude.
     *    * ray.direction is an outward-directed unit vector
     * @param position longitude, latitude, and height
     *
     */
    anglesToUnitNormalRay(position: LongitudeLatitudeNumber, result?: Ray3d): Ray3d | undefined;
    /**
     * Return simple angles of a fractional position in the patch.
     * @param thetaFraction fractional position in longitude (theta) interval
     * @param phiFraction fractional position in latitude (phi) interval
     * @param h optional altitude
     * @param result optional preallocated result.
     */
    uvFractionToAngles(longitudeFraction: number, phiFraction: number, h?: number, result?: LongitudeLatitudeNumber): LongitudeLatitudeNumber;
    /** Find the closest point of the (patch of the) ellipsoid. */
    projectPointToSurface(spacePoint: Point3d): LongitudeLatitudeNumber | undefined;
}
/**
 * Detailed data for a point on a 2-angle parameter space.
 * @public
 */
export declare class GeodesicPathPoint {
    /** First angle, in radians */
    thetaRadians: number;
    /** Second angle, in radians */
    phiRadians: number;
    point: Point3d;
    dTheta: Vector3d;
    dPhi: Vector3d;
    d2Theta: Vector3d;
    d2Phi: Vector3d;
    d2ThetaPhi: Vector3d;
    d1Cross: Vector3d;
    constructor();
    /** Fill all evaluations at given theta and phi. */
    evaluateDerivativesAtCurrentAngles(ellipsoid: Ellipsoid): void;
    private static _vectorAB?;
    private static _vectorCB?;
    private static _vectorCross?;
    /** Evaluate the newton function and derivatives:
     *          `(UAB cross UCB) dot d1cross`
     * with as the central data, UAB = vector from pointA to pointB, UCB = vector from pointC to pointB.
     * * Return order is:
     *   * values[0] = the function
     *   * values[1] = derivative wrt pointA.phi
     *   * values[2] = derivative wrt pointB.phi
     *   * values[3] = derivative wrt pointC.phi
     */
    static evaluateNewtonFunction(pointA: GeodesicPathPoint, pointB: GeodesicPathPoint, pointC: GeodesicPathPoint, values: Float64Array): void;
    /**
     * Extract the two angles form this structure to a LongitudeLatitudeNumber structure.
     */
    toAngles(): LongitudeLatitudeNumber;
}
/**
 * Algorithm implementation class for computing approximate optimal (shortest) path points.
 * * Call the static method `createGeodesicPath` to compute path points.
 * @public
 */
export declare class GeodesicPathSolver {
    private readonly _defaultArc;
    private readonly _pathPoints;
    private _tridiagonalSolver;
    private constructor();
    /**
     *
     * @param originalEllipsoid Given start and endpoints on an ellipsoid, compute points along a near-optimal shortest path.
     * * The points are located so that at each point the local surface normal is contained in the plane of the point and its two neighbors.
     * @param startAngles angles for the start of the path
     * @param endAngles angles for the end of the path
     * @param density If this is a number, it is the requested edge count.  If this is an angle, it ias an angular spacing measured in the great arc through the two points.
     */
    static createGeodesicPath(originalEllipsoid: Ellipsoid, startAngles: LongitudeLatitudeNumber, endAngles: LongitudeLatitudeNumber, density: number | Angle): GeodesicPathPoint[] | undefined;
    private createInitialPointsAndTridiagonalSystem;
    private applyUpdate;
    /**
     * Set up a step with specified ellipsoid.
     * * ASSUME angles in _pathPoints are valid on given ellipsoid.
     * @param ellipsoid
     */
    private setupStep;
    private solve;
    /**
     * Construct various section arcs (on the ellipsoid), using planes that (a) pass through the two given points and (b) have in-plane vector sampled between the normals of the two points.
     * * Each candidate ellipse has is in a plane with ellipsoid normal at vector constructed "between" the endpoint normals.
     * * The intermediate construction is by interpolation between stated fractions (which maybe outside 0 to 1)
     * @param ellipsoid
     * @param angleA start point of all candidates
     * @param angleB end point of all candidates
     * @param numSample number of ellipses to construct as candidates.
     * @param normalInterpolationFraction0
     * @param normalInterpolationFraction1
     */
    static approximateMinimumLengthSectionArc(ellipsoid: Ellipsoid, angleA: LongitudeLatitudeNumber, angleB: LongitudeLatitudeNumber, numSample: number, normalInterpolationFraction0: number, normalInterpolationFraction1: number): {
        minLengthArc: Arc3d;
        minLengthNormalInterpolationFraction: number;
    } | undefined;
}
