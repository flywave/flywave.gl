import { type Arc3d } from "../curve/arc3d";
import { CurveLocationDetail, CurveLocationDetailPair } from "../curve/curve-location-detail";
import { type Point3d } from "./point3d-vector3d";
/**
 * `CoincidentGeometryQuery` has methods useful in testing for overlapping geometry.
 * * Each instance carries tolerance information that can be reused over extended call sequences.
 * * These methods are expected to be called internally by CurveCurve intersection methods.
 * @internal
 */
export declare class CoincidentGeometryQuery {
    private _vectorU?;
    private _vectorV?;
    private _point0?;
    private _point1?;
    private readonly _tolerance;
    get tolerance(): number;
    private constructor();
    static create(tolerance?: number): CoincidentGeometryQuery;
    /**
     * * Assign both the fraction and fraction1 values in the detail, possibly swapped.
     * * reevaluate the points as simple interpolation between given points.
     */
    static assignDetailInterpolatedFractionsAndPoints(detail: CurveLocationDetail, f0: number, f1: number, pointA: Point3d, pointB: Point3d, swap?: boolean): void;
    /** Return a curve location detail with projection of a `spacePoint` to the line segment with `pointA` and `pointB` */
    projectPointToSegmentXY(spacePoint: Point3d, pointA: Point3d, pointB: Point3d): CurveLocationDetail;
    /**
     * Given a detail pair representing the projection of each of two colinear line segments onto the other,
     * clamp the details (in place) to the line segments' endpoints according to the given flags.
     * @param overlap segment overlap as returned by [[coincidentSegmentRangeXY]], modified on return
     * @param pointA0 start point of segment A
     * @param pointA1 end point of segment A
     * @param pointB0 start point of segment B
     * @param pointB1 end point of segment B
     * @param extendA0 whether to extend segment A beyond its start
     * @param extendA1 whether to extend segment A beyond its end
     * @param extendB0 whether to extend segment B beyond its start
     * @param extendB1 whether to extend segment B beyond its end
     * @return reference to the input clamped in place, or undefined (leaving interval untouched) if clamping would result in empty interval.
     */
    clampCoincidentOverlapToSegmentBounds(overlap: CurveLocationDetailPair, pointA0: Point3d, pointA1: Point3d, pointB0: Point3d, pointB1: Point3d, extendA0?: boolean, extendA1?: boolean, extendB0?: boolean, extendB1?: boolean): CurveLocationDetailPair | undefined;
    /**
     * Compute whether two line segments have a coincident overlap in xy.
     * * Project `pointA0` and `pointA1` onto the line formed by `pointB0` and `pointB1` and vice versa
     * * If all projection distances are sufficiently small, return a detail pair recording the coincident interval, optionally clipped to segment bounds.
     * @param pointA0 start point of segment A
     * @param pointA1 end point of segment A
     * @param pointB0 start point of segment B
     * @param pointB1 end point of segment B
     * @param restrictToBounds whether to clip the coincident segment details to the segment bounds
     * @return detail pair for the coincident interval (`detailA` has fractions along segment A, and `detailB` has fractions along segment B), or undefined if no coincidence
     */
    coincidentSegmentRangeXY(pointA0: Point3d, pointA1: Point3d, pointB0: Point3d, pointB1: Point3d, restrictToBounds?: boolean): CurveLocationDetailPair | undefined;
    /**
     * Create a CurveLocationDetailPair for a coincident interval of two overlapping curves
     * @param cpA curveA
     * @param cpB curveB
     * @param fractionsOnA coincident interval of curveB in fraction space of curveA
     * @param fractionB0 curveB start in fraction space of curveA
     * @param fractionB1 curveB end in fraction space of curveA
     * @param reverse whether curveB and curveA have opposite direction
     */
    private createDetailPair;
    private appendDetailPair;
    /**
     * Test if 2 arcs have coinciding portions.
     * @param arcA
     * @param arcB
     * @param _restrictToBounds
     * @return 0, 1, or 2 overlap points/intervals
     */
    coincidentArcIntersectionXY(arcA: Arc3d, arcB: Arc3d, _restrictToBounds?: boolean): CurveLocationDetailPair[] | undefined;
}
