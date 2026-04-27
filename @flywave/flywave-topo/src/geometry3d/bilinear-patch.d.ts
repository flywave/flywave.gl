import { CurveAndSurfaceLocationDetail } from "../bspline/surface-location-detail";
import { type UVSurface } from "./geometry-handler";
import { Plane3dByOriginAndVectors } from "./plane3d-by-origin-and-vectors";
import { Point3d } from "./point3d-vector3d";
import { type Range3d } from "./range";
import { type Ray3d } from "./ray3d";
import { type Transform } from "./transform";
/**
 * A bilinear patch is a surface defined by its 4 corner points.
 * * The corner points do not have to be coplanar, but if they are, the quadrilateral should be convex to avoid a self-intersecting surface.
 * ```
 * equation
 * \begin{matrix}
 * v\text{-direction}\\
 * \uparrow\\
 * \text{point01} &\cdots &\text{A1} &\cdots &\text{point11}\\
 * \vdots &&\vdots &&\vdots\\
 * \text{B0} &\cdots &\text{X} &\cdots &\text{B1}\\
 * \vdots &&\vdots &&\vdots\\
 * \text{point00} &\cdots &\text{A0} &\cdots &\text{point10} &\rightarrow~u\text{-direction}
 * \end{matrix}
 * ```
 * * To evaluate the point at (u,v), the following are equivalent:
 *   * interpolate first with u then with v:
 *      * A0 = interpolate between point00 and point10 at fraction u
 *      * A1 = interpolate between point01 and point11 at fraction u
 *      * X = interpolate between A0 and A1 at fraction v
 *   * interpolate first with v then with u:
 *      * B0 = interpolate between point00 and point01 at fraction v
 *      * B1 = interpolate between point10 and point11 at fraction v
 *      * X = interpolate between B0 and B1 at fraction u
 *   * sum all at once:
 *      * X = (1-u)(1-v)point00 + (1-u)(v)point01 + (u)(1-v)point10 + (u)(v)point11
 * @public
 */
export declare class BilinearPatch implements UVSurface {
    /** corner at parametric coordinate (0,0) */
    point00: Point3d;
    /** corner at parametric coordinate (1,0) */
    point10: Point3d;
    /** corner at parametric coordinate (0,1) */
    point01: Point3d;
    /** corner at parametric coordinate (1,1) */
    point11: Point3d;
    /**
     * Capture (not clone) corners to create a new BilinearPatch.
     * @param point00 Point at uv=0,0
     * @param point10 Point at uv=1,0
     * @param point10 Point at uv=0,1
     * @param point11 Point at uv=1,1
     */
    constructor(point00: Point3d, point10: Point3d, point01: Point3d, point11: Point3d);
    /**
     * Clone (not capture) corners to create a new BilinearPatch.
     * @param point00 Point at uv=0,0
     * @param point10 Point at uv=1,0
     * @param point10 Point at uv=0,1
     * @param point11 Point at uv=1,1
     */
    static create(point00: Point3d, point10: Point3d, point01: Point3d, point11: Point3d): BilinearPatch;
    /** Create a patch from xyz values of the 4 corners. */
    static createXYZ(x00: number, y00: number, z00: number, x10: number, y10: number, z10: number, x01: number, y01: number, z01: number, x11: number, y11: number, z11: number): BilinearPatch;
    /** Return a cloned patch. */
    clone(): BilinearPatch;
    /** Test equality of the 4 points. */
    isAlmostEqual(other: BilinearPatch): boolean;
    /** Apply the transform to each point. */
    tryTransformInPlace(transform: Transform): boolean;
    /** Return a cloned and transformed patch. */
    cloneTransformed(transform: Transform): BilinearPatch | undefined;
    /** Extend a range by the range of the (optionally transformed) patch. */
    extendRange(range: Range3d, transform?: Transform): void;
    /**
     * Convert fractional u and v coordinates to surface point
     * @param u fractional coordinate in u direction
     * @param v fractional coordinate in v direction
     * @param result optional pre-allocated point
     */
    uvFractionToPoint(u: number, v: number, result?: Point3d): Point3d;
    /** Evaluate as a uv surface, returning point and two derivative vectors.
     * @param u fractional coordinate in u direction
     * @param v fractional coordinate in v direction
     * @param result optional pre-allocated carrier for point and vectors
     */
    uvFractionToPointAndTangents(u: number, v: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /** If data[iB][pivotColumn] is larger in absolute value than data[iA][pivotColumn], then swap rows iA and iB. */
    private static conditionalPivot;
    /**
     * Compute the points of intersection with a ray.
     * @param ray ray in space
     * @returns 1 or 2 points if there are intersections, undefined if no intersections
     */
    intersectRay(ray: Ray3d): CurveAndSurfaceLocationDetail[] | undefined;
    /** Returns the larger of the u-direction edge lengths at v=0 and v=1. */
    maxUEdgeLength(): number;
    /** Returns the larger of the v-direction edge lengths at u=0 and u=1. */
    maxVEdgeLength(): number;
}
