import type { GeometryHandler, IStrokeHandler } from "../geometry3d/geometry-handler";
import type { Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import type { Plane3dByOriginAndVectors } from "../geometry3d/plane3d-by-origin-and-vectors";
import type { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import type { Range1d, Range3d } from "../geometry3d/range";
import type { Ray3d } from "../geometry3d/ray3d";
import type { Transform } from "../geometry3d/transform";
import { CurvePrimitive } from "./curve-primitive";
import type { LineString3d } from "./line-string3d";
import type { OffsetOptions } from "./offset-options";
import type { StrokeOptions } from "./stroke-options";
/**
 * A ProxyCurve is expected to be used as a base class for curve types that use some existing curve (the proxy)
 * for evaluation and display but carry other defining data.
 * * The ProxyCurve implements all required CurvePrimitive methods by dispatching to the proxy.
 * * These methods presumably require support from the application class and are left abstract:
 *    * clone
 *    * curvePrimitiveType
 *    * isSameCurvePrimitiveType
 *    * isSameGeometryClass
 *    * tryTransformInPlace
 *    * reverseInPlace
 *
 * @public
 */
export declare abstract class ProxyCurve extends CurvePrimitive {
    dispatchToGeometryHandler(handler: GeometryHandler): any;
    protected _proxyCurve: CurvePrimitive;
    /** Constructor CAPTURES the proxyCurve pointer */
    constructor(proxyCurve: CurvePrimitive);
    /** Return the (pointer to) the proxy curve. */
    get proxyCurve(): CurvePrimitive;
    /** Implement by proxyCurve */
    computeStrokeCountForOptions(options?: StrokeOptions): number;
    /** Implement by proxyCurve */
    emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
    /** Return a deep clone. This override removes the undefined variant return. */
    abstract clone(): ProxyCurve;
    /** Return a transformed clone. */
    cloneTransformed(transform: Transform): ProxyCurve | undefined;
    /** Implement by proxyCurve. Subclasses may eventually override this default implementation. */
    clonePartialCurve(fractionA: number, fractionB: number): CurvePrimitive | undefined;
    /** Implement by proxyCurve */
    emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
    /** Implement by proxyCurve */
    extendRange(rangeToExtend: Range3d, transform?: Transform): void;
    /** Implement by proxyCurve */
    range(transform?: Transform, result?: Range3d): Range3d;
    /** Implement by proxyCurve */
    fractionToPoint(fraction: number, result?: Point3d): Point3d;
    /** Implement by proxyCurve */
    fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
    /** Implement by proxyCurve */
    fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;
    /** Implement by proxyCurve */
    isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
    /** Implement by proxyCurve */
    quickLength(): number;
    /** Implement by proxyCurve */
    constructOffsetXY(offsetDistanceOrOptions: number | OffsetOptions): CurvePrimitive | CurvePrimitive[] | undefined;
    /** Implement by proxyCurve */
    projectedParameterRange(ray: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
}
