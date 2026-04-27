import { type CurveCollection } from "../curve/curve-collection";
import { type AnyCurve } from "../curve/curve-types";
import { type GeometryQuery } from "../curve/geometry-query";
import { Angle } from "../geometry3d/angle";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type Range3d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { Transform } from "../geometry3d/transform";
import { SolidPrimitive } from "./solid-primitive";
import { SweepContour } from "./sweep-contour";
/**
 * A LinearSweep is
 * * A planar contour (any Loop, Path, or parityRegion)
 * * An axis vector.
 *   * The planar contour is expected to be in the plane of the axis vector
 *   * The contour may have points and/or lines that are on the axis, but otherwise is entirely on one side of the axis.
 * * A sweep angle.
 * @public
 */
export declare class RotationalSweep extends SolidPrimitive {
    /** String name for schema properties */
    readonly solidPrimitiveType = "rotationalSweep";
    private readonly _contour;
    private readonly _normalizedAxis;
    private readonly _sweepAngle;
    private constructor();
    /** Create a rotational sweep. */
    static create(contour: AnyCurve, axis: Ray3d, sweepAngle: Angle, capped: boolean): RotationalSweep | undefined;
    /** Return a coordinate frame (right handed unit vectors)
     * * origin at origin of rotation ray
     * * z direction along the rotation ray.
     * * y direction perpendicular to the base contour plane
     */
    getConstructiveFrame(): Transform | undefined;
    /** return clone of (not reference to) the axis vector. */
    cloneAxisRay(): Ray3d;
    /** Return (REFERENCE TO) the swept curves. */
    getCurves(): CurveCollection;
    /** Return (REFERENCE TO) the swept curves with containing plane markup. */
    getSweepContourRef(): SweepContour;
    /** Return the sweep angle. */
    getSweep(): Angle;
    /** Test if `other` is a `RotationalSweep` */
    isSameGeometryClass(other: any): boolean;
    /** Test for same axis, capping, and swept geometry. */
    isAlmostEqual(other: GeometryQuery): boolean;
    /** return a deep clone */
    clone(): RotationalSweep;
    /** Transform the contour and axis */
    tryTransformInPlace(transform: Transform): boolean;
    /** return a cloned transform. */
    cloneTransformed(transform: Transform): RotationalSweep;
    /** Dispatch to strongly typed handler  `handler.handleRotationalSweep(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    /** Return a transform that rotates around the rotational axis by a fraction of the total sweep. */
    getFractionalRotationTransform(vFraction: number, result?: Transform): Transform;
    /**
     * Return the curves of a constant-v section of the solid.
     * @param vFraction fractional position along the sweep direction
     */
    constantVSection(vFraction: number): CurveCollection | undefined;
    /** Extend range using sampled points on the surface. */
    extendRange(range: Range3d, transform?: Transform): void;
    /**
     * @return true if this is a closed volume.
     */
    get isClosedVolume(): boolean;
}
