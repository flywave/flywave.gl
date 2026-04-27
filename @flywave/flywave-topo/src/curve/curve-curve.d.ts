import { type Matrix4d } from "../geometry4d/matrix4d";
import { type CurveLocationDetailPair } from "./curve-location-detail";
import { type CurvePrimitive } from "./curve-primitive";
import { type AnyCurve } from "./curve-types";
/**
 * `CurveCurve` has static method for various computations that work on a pair of curves or curve collections.
 * @public
 */
export declare class CurveCurve {
    /**
     * Return xy intersections of 2 curves.
     * @param curveA first curve
     * @param extendA true to allow curveA to extend
     * @param curveB second curve
     * @param extendB true to allow curveB to extend
     * @param tolerance optional distance tolerance for coincidence
     */
    static intersectionXYPairs(curveA: AnyCurve, extendA: boolean, curveB: AnyCurve, extendB: boolean, tolerance?: number): CurveLocationDetailPair[];
    /**
     * Return xy intersections of 2 projected curves.
     * @param worldToLocal transform (possibly perspective) defining the local coordinates in which to compute xy intersections
     * @param curveA first curve
     * @param extendA true to allow curveA to extend
     * @param curveB second curve
     * @param extendB true to allow curveB to extend
     * @param tolerance optional distance tolerance for coincidence
     */
    static intersectionProjectedXYPairs(worldToLocal: Matrix4d | undefined, curveA: AnyCurve, extendA: boolean, curveB: AnyCurve, extendB: boolean, tolerance?: number): CurveLocationDetailPair[];
    /**
     * Return full 3d xyz intersections of 2 curves.
     *  * Implemented for combinations of LineSegment3d, LineString3d, Arc3d.
     *  * Not Implemented for bspline and bezier curves.
     * @beta
     * @param curveA first curve
     * @param extendA true to allow curveA to extend
     * @param curveB second curve
     * @param extendB true to allow curveB to extend
     * @returns array of intersections structured as CurveLocationDetailPair[]
     */
    static intersectionXYZPairs(curveA: AnyCurve, extendA: boolean, curveB: AnyCurve, extendB: boolean): CurveLocationDetailPair[];
    /**
     * Return xy intersections of input curves.
     * @param primitives input curves to intersect
     * @param tolerance optional distance tolerance for coincidence
     */
    static allIntersectionsAmongPrimitivesXY(primitives: CurvePrimitive[], tolerance?: number): CurveLocationDetailPair[];
    /**
     * Return at least one XY close approach between 2 curves.
     * * Close approach xy-distances are measured without regard to z. This is equivalent to their separation distance
     * as seen in the top view, or as measured between their projections onto the xy-plane.
     * * If more than one approach is returned, one of them is the closest approach.
     * * If an input curve is a `CurveCollection`, then close approaches are computed to each `CurvePrimitive` child.
     * This can lead to many returned pairs, especially when both inputs are `CurveCollection`s. If an input curve is
     * an `AnyRegion` then close approaches are computed only to the boundary curves, not to the interior.
     * @param curveA first curve
     * @param curveB second curve
     * @param maxDistance maximum xy-distance to consider between the curves.
     * Close approaches further than this xy-distance are not returned.
     */
    static closeApproachProjectedXYPairs(curveA: AnyCurve, curveB: AnyCurve, maxDistance: number): CurveLocationDetailPair[];
    /**
     * Convenience method that calls [[closeApproachProjectedXYPairs]] with a large `maxDistance`
     * and returns a detail pair representing the closest xy-approach between the curves.
     * * There may be many detail pairs that represent "closest" xy-approach, including coincident interval pairs,
     * isolated intersections, or close approaches within tolerance of each other. This method makes no attempt to
     * distinguish among them, and returns a pair whose `detail.point` values are separated by the smallest xy distance
     * found among the pairs.
     * @param curveA first curve
     * @param curveB second curve
     * @return detail pair of closest xy-approach, undefined if not found
     */
    static closestApproachProjectedXYPair(curveA: AnyCurve, curveB: AnyCurve): CurveLocationDetailPair | undefined;
}
