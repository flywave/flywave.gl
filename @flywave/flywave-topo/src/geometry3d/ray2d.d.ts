import { type Point2d, type Vector2d } from "./point2d-vector2d";
/**
 * Ray with xy origin and direction
 * @public
 */
export declare class Ray2d {
    private _origin;
    private _direction;
    private constructor();
    /** Copy coordinates from origin and direction. */
    set(origin: Point2d, direction: Vector2d): void;
    /**
     * Create from `origin` and `target` points.
     * @param origin ray origin, cloned
     * @param target end of ray direction vector. The direction vector is `target - origin`.
     * @param result optional pre-allocated object to return
     */
    static createOriginAndTarget(origin: Point2d, target: Point2d, result?: Ray2d): Ray2d;
    /**
     * Create by copying coordinates from `origin` and `direction`.
     * @param origin ray origin
     * @param direction ray direction
     * @param result optional pre-allocated object to return
     */
    static createOriginAndDirection(origin: Point2d, direction: Vector2d, result?: Ray2d): Ray2d;
    /** Create from captured `origin` and `direction`. */
    static createOriginAndDirectionCapture(origin: Point2d, direction: Vector2d, result?: Ray2d): Ray2d;
    /** Get the reference to the ray origin. */
    get origin(): Point2d;
    /** Get the reference to the ray direction. */
    get direction(): Vector2d;
    /**
     * Return a parallel ray to the left of this ray.
     * @param leftFraction distance between rays, as a fraction of the magnitude of this ray's direction vector
     */
    parallelRay(leftFraction: number, result?: Ray2d): Ray2d;
    /** Return a ray with cloned origin and with direction rotated 90 degrees counterclockwise */
    ccwPerpendicularRay(result?: Ray2d): Ray2d;
    /** Return a ray with cloned origin and with direction rotated 90 degrees clockwise */
    cwPerpendicularRay(result?: Ray2d): Ray2d;
    /**
     * Normalize the direction vector in place.
     * @param defaultX value to set `this.direction.x` if normalization fails. Default value 1.
     * @param defaultY value to set `this.direction.y` if normalization fails. Default value 0.
     * @returns whether normalization succeeded (i.e., direction is nonzero)
     */
    normalizeDirectionInPlace(defaultX?: number, defaultY?: number): boolean;
    /**
     * Intersect this ray with the unbounded line defined by the given points.
     * @param linePointA start of the line
     * @param linePointB end of the line
     * @returns object with named values:
     * * `hasIntersection`: whether the intersection exists.
     * * `fraction`: ray parameter of intersection, or 0.0 if `!hasIntersection`. If the instance is normalized, this is the signed distance along the ray to the intersection point.
     * * `cross`: the 2D cross product `this.direction x (linePointB - linePointA)`, useful for determining orientation of the line and ray.
     */
    intersectUnboundedLine(linePointA: Point2d, linePointB: Point2d): {
        hasIntersection: boolean;
        fraction: number;
        cross: number;
    };
    /** Return the ray fraction where the given point projects onto the ray. */
    projectionFraction(point: Point2d): number;
    /** Return the ray fraction where the given point projects onto the perpendicular ray. */
    perpendicularProjectionFraction(point: Point2d): number;
    /** Compute and return origin plus scaled direction. */
    fractionToPoint(f: number, result?: Point2d): Point2d;
}
