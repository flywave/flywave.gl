import { BSplineCurve3d } from "../../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../../bspline/bspline-curve3d-homogeneous";
import { RecurseToCurvesGeometryHandler } from "../../geometry3d/geometry-handler";
import { Arc3d } from "../arc3d";
import { CurveChainWithDistanceIndex } from "../curve-chain-with-distance-index";
import { CurveLocationDetail, CurveLocationDetailPair } from "../curve-location-detail";
import { type CurvePrimitive } from "../curve-primitive";
import { type AnyCurve } from "../curve-types";
import { LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";
/**
 * Handler class for XY close approach between _geometryB and another geometry.
 * * Approach means the XY distance (z is ignored) between _geometryB and another geometry.
 * * Closest approach is a measure of the proximity of one curve to another. It's the length of the shortest line
 * segment perpendicular to both curves; if the curves intersect, the closest approach is zero. In the context of
 * this class, z-coordinates are ignored, so the closest approach is as seen in the top view. If you have coplanar
 * input curves and want to find closest approach in their plane, rotate them first into a plane parallel to the
 * xy-plane, then afterward, rotate the results back as required.
 * * Close approach can also be from a curve endpoint perpendicular to another curve or from a curve endpoint to
 * another curve endpoint.
 * * Instances are initialized and called from CurveCurve.
 * * geometryB is saved for later reference.
 * @internal
 */
export declare class CurveCurveCloseApproachXY extends RecurseToCurvesGeometryHandler {
    private _geometryB;
    private _circularArcB;
    private _circularRadiusB;
    private setGeometryB;
    /**
     * Maximum XY distance (z is ignored). Approach larger than this is not interesting.
     * This is caller defined and can be undefined.
     */
    private _maxDistanceToAccept;
    /** Squared max distance. This is private, and is forced to at least small metric distance squared. */
    private _maxDistanceSquared;
    /**
     * Start and end points of line segments that meet closest approach criteria, i.e., they are perpendicular to
     * both curves and their length is smaller than _maxDistanceToAccept.
     */
    private _results;
    private static readonly _workPointAA0;
    private static readonly _workPointAA1;
    private static readonly _workPointBB0;
    private static readonly _workPointBB1;
    private static _workPointB;
    /**
     * Constructor.
     * @param geometryB second curve for intersection. Saved for reference by specific handler methods.
     */
    constructor(geometryB: AnyCurve | undefined);
    /** Set the (possibly undefined) max XY distance (z is ignored) to accept. */
    set maxDistanceToAccept(value: number | undefined);
    /** Access the (possibly undefined) max XY distance (z is ignored) to accept. */
    get maxDistanceToAccept(): number | undefined;
    /** Ask if the maxDistanceToAccept value is defined and positive */
    get isMaxDistanceSet(): boolean;
    /** Reset the geometry and flags, leaving all other parts unchanged (and preserving accumulated intersections) */
    resetGeometry(geometryB: AnyCurve): void;
    /** returns true if `fraction` is in [0,1] within tolerance */
    private acceptFraction;
    /**
     * Return the results structure for the intersection calculation, structured as an array of CurveLocationDetailPair.
     * @param reinitialize if true, a new results structure is created for use by later calls.
     */
    grabPairedResults(reinitialize?: boolean): CurveLocationDetailPair[];
    /**
     * If distance between pointA and pointB is less than maxDistance, record CurveLocationDetailPair which is
     * the approach from pointA to pointB.
     */
    private testAndRecordPointPairApproach;
    /**
     * Create a close approach pair if XY distance is within maxDistance.
     * @param localFractionA a fraction on first curve
     * @param cpA the first curve
     * @param fractionA0 start of the first curve
     * @param fractionA1 end of the first curve
     * @param localFractionB a fraction on second curve
     * @param cpB the second curve
     * @param fractionB0 start of the second curve
     * @param fractionB1 end of the second curve
     * @param reversed whether to reverse the details in the pair (e.g., so that detailB refers to geometryB).
     * @param intervalDetails optional CurveLocationDetailPair
     */
    private recordPointWithLocalFractions;
    /**
     * Capture a close approach pair that has point and local fraction but not curve.
     * * Record the pair, each detail modified with global fraction and input curve.
     * * Pair is neither modified nor recorded if it would be a duplicate of the last recorded pair.
     * @param pair details computed with local fractions
     * @param cpA curveA
     * @param fractionA0 global start fraction on curveA
     * @param fractionA1 global end fraction on curveA
     * @param cpB curveB
     * @param fractionB0 global start fraction on curveB
     * @param fractionB1 global end fraction on curveB
     * @param reversed whether to reverse the details in the pair (e.g., so that detailB refers to geometryB).
     */
    private capturePairWithLocalFractions;
    /**
     * Emit recordPoint for multiple pairs (on full curve) if within maxDistance.
     * @param cpA first curve primitive (possibly different from curve in detailA, but fraction compatible)
     * @param cpB second curve primitive (possibly different from curve in detailA, but fraction compatible)
     * @param pairs array of pairs
     * @param reversed whether to reverse the details in the pair (e.g., so that detailB refers to geometryB).
     */
    recordPairs(cpA: CurvePrimitive, cpB: CurvePrimitive, pairs: CurveLocationDetailPair[] | undefined, reversed: boolean): void;
    /**
     * Record fully assembled (but possibly reversed) detail pair.
     * @param detailA first detail
     * @param detailB second detail
     * @param reversed whether to reverse the details in the pair (e.g., so that detailB refers to geometryB).
     */
    captureDetailPair(detailA: CurveLocationDetail | undefined, detailB: CurveLocationDetail | undefined, reversed: boolean): void;
    private static updatePointToSegmentDistance;
    /**
     * Return fractions of close approach within maxDistance between two line segments (a0,a1) and (b0,b1).
     * * Math details can be found at core/geometry/internaldocs/Curve.md
     * @param a0 start point of line a
     * @param a1 end point of line a
     * @param b0 start point of line b
     * @param b1 end point of line b
     * @param maxDistanceSquared maximum distance squared (assumed to be positive)
     * @returns the fractional (not xy) coordinates in result.x and result.y. result.x is fraction on line a.
     * result.y is fraction on line b.
     */
    private static segmentSegmentBoundedApproach;
    /**
     * Check different combination of fractions on curveA and curveB. If distance between points at 2 fractions
     * is less than maxDistance, record CurveLocationDetailPair which is the approach between the 2 points.
     * Optionally, record close approaches of one curve's points if they fall between the other curve's points.
     * @param cpA curveA
     * @param fA0 fraction0 on curveA
     * @param fA1 fraction1 on curveA
     * @param testProjectionOnA whether to record projections of the given curveB points onto curveA
     * @param cpB curveB
     * @param fB0 fraction0 on curveB
     * @param fB1 fraction0 on curveB
     * @param testProjectionOnB whether to record projections of the given curveA points onto curveB
     * @param reversed whether to reverse the details in the pair (e.g., so that detailB refers to geometryB).
     */
    private testAndRecordFractionalPairApproach;
    /** Find the closest approach between pointA and cpB. Add the approach if it's within fB0 and fB1. */
    private testAndRecordProjection;
    /**
     * Compute intersection of two line segments.
     * Filter by extension rules.
     * Record with fraction mapping.
     * * The fraction mappings allow portions of a linestring to be passed here.
     */
    private computeSegmentSegment3D;
    /** Low level dispatch of segment with segment. */
    private dispatchSegmentSegment;
    /**
     * Low level dispatch of segment with arc.
     * Find close approaches within maxDistance between a line segments (pointA0, pointA1) and an arc.
     * To consider:
     * 1) intersection between arc and segment.
     * 2) arc endpoints to segment endpoints or arc endpoints projection to the segment.
     * 3) line parallel to arc tangent.
     * @param cpA curve A (line segment or line string)
     * @param pointA0 start point of the segment
     * @param fractionA0 fraction of the start of the segment
     * @param pointA1 end point of the segment
     * @param fractionA1 fraction of the end of the segment
     * @param arc the arc
     * @param reversed whether to reverse the details in the pair (e.g., so that detailB refers to geometryB).
     */
    private dispatchSegmentArc;
    /** Low level dispatch of circular arc with circular arc. radiusA must be larger than or equal to radiusB. */
    private dispatchCircularCircularOrdered;
    /** Find the fractional point (if any) on the circular `arc` in the direction of `radialVector`. */
    private resolveDirectionToArcXYFraction;
    /** Low level dispatch of arc with arc. Only circular arcs are supported. */
    private dispatchArcArc;
    /** Low level dispatch of arc with (beziers of) a bspline curve */
    private dispatchArcBsplineCurve3d;
    /** Low level dispatch of (beziers of) a bspline curve with (beziers of) a bspline curve */
    private dispatchBSplineCurve3dBSplineCurve3d;
    /** Low level dispatch of linestring with (beziers of) a bspline curve */
    dispatchLineStringBSplineCurve(lsA: LineString3d, curveB: BSplineCurve3d, reversed: boolean): any;
    /** Low level dispatch of segment with (beziers of) a bspline curve */
    dispatchSegmentBsplineCurve(segA: LineSegment3d, curveB: BSplineCurve3d, reversed: boolean): any;
    /** Detail computation for segment approaching linestring. */
    computeSegmentLineString(segA: LineSegment3d, lsB: LineString3d, reversed: boolean): void;
    /** Detail computation for arc approaching linestring. */
    computeArcLineString(arcA: Arc3d, lsB: LineString3d, reversed: boolean): any;
    /** Low level dispatch of curve collection. */
    private dispatchCurveCollection;
    /** Low level dispatch to geomA given a CurveChainWithDistanceIndex in geometryB. */
    private dispatchCurveChainWithDistanceIndex;
    /** Double dispatch handler for strongly typed segment. */
    handleLineSegment3d(segmentA: LineSegment3d): any;
    /**
     * Set bits for comparison to range xy
     * * bit 0x01 => x smaller than range.low.x
     * * bit 0x02 => x larger than range.high.x
     * * bit 0x04 => y smaller than range.low.y
     * * bit 0x08 => y larger than range.high.y
     * * If we divide XY plane into 9 areas using the range, the function returns 0 for points
     * inside the range. Below is other binary numbers returned by the function for all 9 areas:
     *   1001 | 1000 | 1010
     *   ------------------
     *    1   |  0   |  10
     *   ------------------
     *   101  | 100  | 110
     * @param xy point to test
     * @param range range for comparison
     */
    private classifyBitsPointRangeXY;
    /** Low level dispatch of line string with line string. */
    private computeLineStringLineString;
    /** Double dispatch handler for strongly typed linestring. */
    handleLineString3d(lsA: LineString3d): any;
    /** Double dispatch handler for strongly typed arc. */
    handleArc3d(arc0: Arc3d): any;
    /** Double dispatch handler for strongly typed bspline curve. */
    handleBSplineCurve3d(curve: BSplineCurve3d): any;
    /** Double dispatch handler for strongly typed CurveChainWithDistanceIndex. */
    handleCurveChainWithDistanceIndex(chain: CurveChainWithDistanceIndex): any;
    /** Double dispatch handler for strongly typed homogeneous bspline curve .. */
    handleBSplineCurve3dH(_curve: BSplineCurve3dH): any;
}
