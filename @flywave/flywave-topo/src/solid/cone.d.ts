import { type CurveCollection } from "../curve/curve-collection";
import { type GeometryQuery } from "../curve/geometry-query";
import { LineString3d } from "../curve/line-string3d";
import { type StrokeOptions } from "../curve/stroke-options";
import { type GeometryHandler, type UVSurface, type UVSurfaceIsoParametricDistance } from "../geometry3d/geometry-handler";
import { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import { Vector2d } from "../geometry3d/point2d-vector2d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Transform } from "../geometry3d/transform";
import { SolidPrimitive } from "./solid-primitive";
/**
 * A cone with axis along the z axis of a (possibly skewed) local coordinate system.
 *
 * * In local coordinates, the sections at z=0 and z=1 are circles of radius r0 and r1.
 * * Either one individually  may be zero, but they may not both be zero.
 * * The stored matrix has unit vectors in the xy columns, and full-length z column.
 * @public
 */
export declare class Cone extends SolidPrimitive implements UVSurface, UVSurfaceIsoParametricDistance {
    /** String name for schema properties */
    readonly solidPrimitiveType = "cone";
    private readonly _localToWorld;
    private readonly _radiusA;
    private readonly _radiusB;
    private readonly _maxRadius;
    protected constructor(map: Transform, radiusA: number, radiusB: number, capped: boolean);
    /** Return a clone of this Cone. */
    clone(): Cone;
    /** Return a coordinate frame (right handed unit vectors)
     * * origin at center of the base circle.
     * * base circle in the xy plane
     * * z axis by right hand rule.
     */
    getConstructiveFrame(): Transform | undefined;
    /** Apply the transform to this cone's locla to world coordinates.
     * * Note that the radii are not changed.  Scaling is absorbed into the frame.
     * * This fails if the transformation is singular.
     */
    tryTransformInPlace(transform: Transform): boolean;
    /**
     * Create a clone and immediately transform the clone.
     */
    cloneTransformed(transform: Transform): Cone | undefined;
    /** create a cylinder or cone from two endpoints and their radii.   The circular cross sections are perpendicular to the axis line
     * from start to end point.
     * * both radii must be of the same sign.
     * * negative radius is accepted to create interior surface.    Downstream effects of that combined with capping may be a problem.
     */
    static createAxisPoints(centerA: Point3d, centerB: Point3d, radiusA: number, radiusB: number, capped: boolean): Cone | undefined;
    /** create a cylinder or cone from axis start and end with cross section defined by vectors that do not need to be perpendicular to each other or
     * to the axis.
     */
    static createBaseAndTarget(centerA: Point3d, centerB: Point3d, vectorX: Vector3d, vectorY: Vector3d, radiusA: number, radiusB: number, capped: boolean): Cone;
    /** (Property accessor) Return the center point at the base plane */
    getCenterA(): Point3d;
    /** (Property accessor) */
    getCenterB(): Point3d;
    /** (Property accessor) Return the x vector in the local frame */
    getVectorX(): Vector3d;
    /** (Property accessor) Return the y vector in the local frame */
    getVectorY(): Vector3d;
    /** (Property accessor) return the radius at the base plane */
    getRadiusA(): number;
    /** (Property accessor) return the radius at the top plane */
    getRadiusB(): number;
    /** (Property accessor) return the larger of the base and top plane radii */
    getMaxRadius(): number;
    /** (Property accessor) return the radius at fraction `v` along the axis */
    vFractionToRadius(v: number): number;
    /** (Property accessor) test if `other` is an instance of `Cone` */
    isSameGeometryClass(other: any): boolean;
    /** (Property accessor) Test for nearly equal coordinate data. */
    isAlmostEqual(other: GeometryQuery): boolean;
    /** Second step of double dispatch:   call `handler.handleCone(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    /**
     *  return strokes for a cross-section (elliptic arc) at specified fraction v along the axis.
     * * fixedStrokeCount takes priority over stroke options.
     * * The linestring is created by LineString3d.createForStrokes (fixedStrokeCount, options), which sets up property according to the options:
     *   * optional fractions member
     *   * optional uvParams.  uvParams are installed as full-scale distance parameters.
     *   * optional derivatives.
     * @param v fractional position along the cone axis
     * @param fixedStrokeCount optional stroke count.
     * @param options optional stroke options.
     */
    strokeConstantVSection(v: number, fixedStrokeCount: number | undefined, options: StrokeOptions | undefined): LineString3d;
    /**
     * Return the Arc3d section at vFraction
     * @param vFraction fractional position along the sweep direction
     */
    constantVSection(vFraction: number): CurveCollection | undefined;
    /** Extend `rangeToExtend` so it includes this `Cone` instance. */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** Evaluate a point on the Cone surfaces, with
     * * v = 0 is the base plane.
     * * v = 1 is the top plane
     * * u = 0 to u = 1 wraps the angular range.
     */
    uvFractionToPoint(uFraction: number, vFraction: number, result?: Point3d): Point3d;
    /** Evaluate a point tangent plane on the Cone surfaces, with
     * * v = 0 is the base plane.
     * * v = 1 is the top plane
     * * u = 0 to u = 1 wraps the angular range.
     */
    uvFractionToPointAndTangents(uFraction: number, vFraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors;
    /**
     * @return true if this is a closed volume.
     */
    get isClosedVolume(): boolean;
    /**
     * Directional distance query
     * * u direction is around longitude circle at maximum distance from axis.
     * * v direction is on a line of longitude between the latitude limits.
     */
    maxIsoParametricDistance(): Vector2d;
}
