import { Point3d } from "../../geometry3d/point3d-vector3d";
import { type CurveChain, type CurveCollection } from "../curve-collection";
import { CurvePrimitive } from "../curve-primitive";
import { Loop } from "../loop";
import { JointOptions, OffsetOptions } from "../offset-options";
import { Path } from "../path";
/**
 * Context for building a wire offset.
 * @internal
 */
export declare class PolygonWireOffsetContext {
    /** Construct a context. */
    constructor();
    private static readonly _unitAlong;
    private static readonly _unitPerp;
    private static readonly _offsetA;
    private static readonly _offsetB;
    private static createOffsetSegment;
    /**
     * Construct a wire (not area) that is offset from given polyline or polygon (which must be in xy-plane or in
     *  a plane parallel to xy-plane).
     * * This is a simple wire offset (in the form of a line string), not an area.
     * * If offsetDistance is given as a number, default OffsetOptions are applied.
     * * See [[JointOptions]] class doc for offset construction rules.
     * @param points a single loop or path
     * @param wrap true to offset the wraparound joint. Assumes first = last point.
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or JointOptions
     * object.
     */
    constructPolygonWireXYOffset(points: Point3d[], wrap: boolean, leftOffsetDistanceOrOptions: number | JointOptions): CurveChain | undefined;
}
/**
 * Context for building a wire offset from a Path or Loop of CurvePrimitives
 * @internal
 */
export declare class CurveChainWireOffsetContext {
    /** construct a context. */
    constructor();
    /**
     * Annotate a CurvePrimitive with properties `baseCurveStart` and `baseCurveEnd`.
     * @param cp curve primitive to annotate
     * @param startPoint optional start point
     * @param endPoint optional end point
     * @return the input CurvePrimitive with annotations
     */
    static applyBasePoints(cp: CurvePrimitive | undefined, startPoint: Point3d | undefined, endPoint: Point3d | undefined): CurvePrimitive | undefined;
    /**
     * Create the offset of a single curve primitive as viewed in the xy-plane (ignoring z).
     * * Each primitive may be labeled (as an `any` object) with start or end point of base curve:
     *   * `(primitive as any).baseCurveStart: Point3d`
     *   * `(primitive as any).baseCurveEnd: Point3d`
     * @param curve primitive to offset
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or options object
     */
    static createSingleOffsetPrimitiveXY(curve: CurvePrimitive, offsetDistanceOrOptions: number | OffsetOptions): CurvePrimitive | CurvePrimitive[] | undefined;
    /**
     * Construct curves that are offset from a Path or Loop as viewed in xy-plane (ignoring z).
     * * The construction will remove "some" local effects of features smaller than the offset distance, but will
     * not detect self intersection among widely separated edges.
     * * Visualization can be found at https://www.itwinjs.org/sandbox/SaeedTorabi/Offset
     * @param curves base curves.
     * @param offsetDistanceOrOptions offset distance (positive to left of curve, negative to right) or options object.
     */
    static constructCurveXYOffset(curves: Path | Loop, offsetDistanceOrOptions: number | JointOptions | OffsetOptions): CurveCollection | undefined;
}
