import { type Point2d } from "../geometry3d/point2d-vector2d";
import { Range1d } from "../geometry3d/range";
import { Ray2d } from "../geometry3d/ray2d";
/**
 * Convex hull of points in 2d.
 * @internal
 */
export declare class ConvexPolygon2d {
    private _hullPoints;
    constructor(points: Point2d[] | undefined);
    /** Create the hull */
    static createHull(points: Point2d[]): ConvexPolygon2d;
    /** Create the hull. First try to use the points as given. */
    static createHullIsValidCheck(points: Point2d[]): ConvexPolygon2d;
    /** Return a reference of the hull points. */
    get points(): Point2d[];
    /** Test if hull points are a convex, CCW polygon */
    static isValidConvexHull(points: Point2d[]): boolean;
    /** Return true if the convex hull (to the left of the edges) contains the test point */
    containsPoint(point: Point2d): boolean;
    /** Return the largest outside. (return 0 if in or on) */
    distanceOutside(xy: Point2d): number;
    /** Offset the entire hull (in place) by distance.
     * Returns false if an undefined occurred from normalizing (could occur after changing some hull points already)
     */
    offsetInPlace(distance: number): boolean;
    /**
     * Return 2 distances bounding the intersection of the ray with this convex hull.
     * @param ray ray to clip to this convex polygon. ASSUME normalized direction vector, so that ray fractions are distances.
     * @returns intersection bounds as min and max distances along the ray (from its origin).
     * * Both negative and positive distances along the ray are possible.
     * * Range has extreme values if less than 3 points, distanceA > distanceB, or if cross product < 0.
     */
    clipRay(ray: Ray2d): Range1d;
    /** Return the range of (fractional) ray positions for projections of all points from the arrays. */
    rangeAlongRay(ray: Ray2d): Range1d;
    /** Return the range of (fractional) ray positions for projections of all points from the arrays. */
    rangePerpendicularToRay(ray: Ray2d): Range1d;
    /** Computes the hull of a convex polygon from points given. Returns the hull as a new Point2d array.
     *  Returns an empty hull if less than 3 points are given.
     */
    static computeConvexHull(points: Point2d[]): Point2d[] | undefined;
}
