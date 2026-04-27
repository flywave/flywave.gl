import { type CurveCollection } from "../curve/curve-collection";
import { type GeometryQuery } from "../curve/geometry-query";
import { LineString3d } from "../curve/line-string3d";
import { type GeometryHandler } from "../geometry3d/geometry-handler";
import { type Matrix3d } from "../geometry3d/matrix3d";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Transform } from "../geometry3d/transform";
import { SolidPrimitive } from "./solid-primitive";
/**
 * A box-like solid defined by
 * * A local coordinate frame
 *   * (0,0,0) is left lower rear corner of box (considering "left" to reference x, "lower" to reference y, "rear and front" to reference z=0 and z=1)
 *   * (0,0,1) is left lower front corner.
 *   * (baseX,baseY,z) is right upper corner at z
 *   * note that the frame x and y columns are usually unit vectors in local space, but z is full rear to front vector
 * * The separate values for base and top x and y allow the box to be a "view frustum" with parallel back and front planes but independent x and y bellows effects.
 * @public
 */
export declare class Box extends SolidPrimitive {
    /** String name for schema properties */
    readonly solidPrimitiveType = "box";
    private readonly _localToWorld;
    private readonly _baseX;
    private readonly _baseY;
    private readonly _topX;
    private readonly _topY;
    protected constructor(map: Transform, baseX: number, baseY: number, topX: number, topY: number, capped: boolean);
    /** Return a clone */
    clone(): Box;
    /** Return a coordinate frame (right handed unit vectors)
     * * origin lower left of box
     * * x direction on base rectangle x edge
     * * y direction in base rectangle
     * * z direction perpendicular
     */
    getConstructiveFrame(): Transform | undefined;
    /** Apply the transform to the box's `localToWorld` frame.
     * * Note that this may make the frame nonrigid.
     */
    tryTransformInPlace(transform: Transform): boolean;
    /** Clone the box and immediately apply `transform` to the local frame of the clone. */
    cloneTransformed(transform: Transform): Box | undefined;
    /**
     * Create a new box from vector and size daa.
     * @param origin Origin of base rectangle
     * @param vectorX  Direction for base rectangle
     * @param vectorY Direction for base rectangle
     * @param topOrigin origin of top rectangle
     * @param baseX size factor for base rectangle (multiplies vectorX)
     * @param baseY size factor for base rectangle (multiplies vectorY)
     * @param topX size factor for top rectangle (multiplies vectorX)
     * @param topY size factor for top rectangle (multiplies vectorY)
     * @param capped true to define top and bottom closure caps
     */
    static createTopoBox(origin: Point3d, vectorX: Vector3d, vectorY: Vector3d, topOrigin: Point3d, baseX: number, baseY: number, topX: number, topY: number, capped: boolean): Box | undefined;
    /**
     * Create a new box with xy directions taken from columns of the `axes` matrix.
     * @param origin Origin of base rectangle
     * @param axes  Direction for base rectangle
     * @param topOrigin origin of top rectangle
     * @param baseX size factor for base rectangle (multiplies vectorX)
     * @param baseY size factor for base rectangle (multiplies vectorY)
     * @param topX size factor for top rectangle (multiplies vectorX)
     * @param topY size factor for top rectangle (multiplies vectorY)
     * @param capped true to define top and bottom closure caps
     */
    static createTopoBoxWithAxes(origin: Point3d, axes: Matrix3d, topOrigin: Point3d, baseX: number, baseY: number, topX: number, topY: number, capped: boolean): Box | undefined;
    /**
     * Create an axis-aligned `Box` primitive for a range.
     * @param range range corners Origin of base rectangle
     * @param capped true to define top and bottom closure caps
     */
    static createRange(range: Range3d, capped: boolean): Box | undefined;
    /** (property accessor) return the x length at z = 0 */
    getBaseX(): number;
    /** (property accessor) return the y length at z = 0 */
    getBaseY(): number;
    /** (property accessor) return the x length at z = 1 */
    getTopX(): number;
    /** (property accessor) return the x length at z = 1 */
    getTopY(): number;
    /** (property accessor) return the local coordinates point (0,0,0) to world */
    getBaseOrigin(): Point3d;
    /** (property accessor) return the local coordinates point (0,0,1) to world */
    getTopOrigin(): Point3d;
    /** (property accessor) return the local coordinate frame x vector */
    getVectorX(): Vector3d;
    /** (property accessor) return the local coordinate frame y vector */
    getVectorY(): Vector3d;
    /** (property accessor) return the local coordinate frame z vector */
    getVectorZ(): Vector3d;
    /** Test of `other` is also of class `Box` */
    isSameGeometryClass(other: any): boolean;
    /** test for near equality */
    isAlmostEqual(other: GeometryQuery): boolean;
    /** Second step of double dispatch:  call `handler.handleBox(this)` */
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    /** Return strokes of the cross-section rectangle at local z coordinate */
    strokeConstantVSection(zFraction: number): LineString3d;
    /**
     * Returns the 8 corners in x fastest, then y, finally z lexical order.
     */
    getCorners(): Point3d[];
    /**
     * Consider the box sides (not top and bottom) as a (u,v) surface with
     * * v = 0 as the z=0 local plane
     * * v = 1 as the z=1 local plane
     * Return the (rectangular) section at fractional v
     */
    constantVSection(zFraction: number): CurveCollection;
    /** Extend  `rangeToExtend` by each of the 8 corners */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /**
     * @return true if this is a closed volume.
     */
    get isClosedVolume(): boolean;
}
