import { type BezierCurveBase } from "../../bspline/bezier-curve-base";
import { BSplineCurve3d } from "../../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../../bspline/bspline-curve3d-homogeneous";
import { RecurseToCurvesGeometryHandler } from "../../geometry3d/geometry-handler";
import { type Matrix4d } from "../../geometry4d/matrix4d";
import { NewtonEvaluatorRRtoRRD } from "../../numerics/newton";
import { Arc3d } from "../arc3d";
import { CurveChainWithDistanceIndex } from "../curve-chain-with-distance-index";
import { CurveLocationDetailPair } from "../curve-location-detail";
import { type CurvePrimitive } from "../curve-primitive";
import { type AnyCurve } from "../curve-types";
import { LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";
/**
 * Private class for refining bezier-bezier intersections.
 * * The inputs are assumed pre-transformed so that the target condition is to match x and y coordinates.
 * @internal
 */
export declare class BezierBezierIntersectionXYRRToRRD extends NewtonEvaluatorRRtoRRD {
    private readonly _curveA;
    private readonly _curveB;
    private readonly _rayA;
    private readonly _rayB;
    constructor(curveA: BezierCurveBase, curveB: BezierCurveBase);
    evaluate(fractionA: number, fractionB: number): boolean;
}
/**
 * Handler class for XY intersections between _geometryB and another geometry.
 * * Instances are initialized and called from CurveCurve.
 * * geometryB is saved for later reference.
 * @internal
 */
export declare class CurveCurveIntersectXY extends RecurseToCurvesGeometryHandler {
    private readonly _extendA;
    private _geometryB;
    private readonly _extendB;
    private _results;
    private readonly _worldToLocalPerspective;
    private readonly _worldToLocalAffine;
    private readonly _coincidentGeometryContext;
    private static readonly _workVector2dA;
    private static readonly _workPointA0H;
    private static readonly _workPointA1H;
    private static readonly _workPointB0H;
    private static readonly _workPointB1H;
    private static readonly _workPointAA0;
    private static readonly _workPointAA1;
    private static readonly _workPointBB0;
    private static readonly _workPointBB1;
    private static readonly _workPointA0;
    private static readonly _workPointA1;
    private static readonly _workPointB0;
    private static readonly _workPointB1;
    private _xyzwA0?;
    private _xyzwA1?;
    private _xyzwPlane?;
    private _xyzwB?;
    /**
     * The constructor.
     * @param worldToLocal optional transform (possibly perspective) to project to xy plane for intersection.
     * @param extendA flag for extension of the other geometry.
     * @param geometryB second curve for intersection. Saved for reference by specific handler methods.
     * @param extendB flag for extension of geometryB.
     * @param tolerance optional distance tolerance for coincidence.
     */
    constructor(worldToLocal: Matrix4d | undefined, extendA: boolean, geometryB: AnyCurve | undefined, extendB: boolean, tolerance?: number);
    /** Reset the geometry, leaving all other parts unchanged (and preserving accumulated intersections). */
    resetGeometry(geometryB: AnyCurve): void;
    private acceptFraction;
    /** Test the fraction by strict parameter, but allow toleranced distance test at ends. */
    private acceptFractionOnLine;
    /**
     * Return the results structure for the intersection calculation, structured as an array of CurveLocationDetailPair
     * @param reinitialize if true, a new results structure is created for use by later calls.
     */
    grabPairedResults(reinitialize?: boolean): CurveLocationDetailPair[];
    /**
     * Record the pre-computed intersection between two curves. Filter by extension rules. Record with fraction mapping.
     * @param localFractionA intersection fraction local to the subcurve of cpA between fractionA0 and fractionA1
     * @param cpA the first curve
     * @param fractionA0 start of the subcurve of cpA
     * @param fractionA1 end of the subcurve of cpA
     * @param localFractionB intersection fraction local to the subcurve of cpB between fractionB0 and fractionB1
     * @param cpB the second curve
     * @param fractionB0 start of the subcurve of cpB
     * @param fractionB1 end of the subcurve of cpB
     * @param reversed whether to reverse the details in the recorded intersection pair
     * @param intervalDetails optional data for a coincident segment intersection
     */
    private recordPointWithLocalFractions;
    /**
     * Emit recordPoint for multiple pairs (on full curve).
     * @param cpA first curve primitive (possibly different from curve in detailA, but fraction compatible).
     * @param cpB second curve primitive (possibly different from curve in detailA, but fraction compatible).
     * @param pairs array of pairs.
     * @param reversed true to have order reversed in final structures.
     */
    recordPairs(cpA: CurvePrimitive, cpB: CurvePrimitive, pairs: CurveLocationDetailPair[] | undefined, reversed: boolean): void;
    /** Compute intersection of two line segments. Filter by extension rules. Record with fraction mapping. */
    private computeSegmentSegment3D;
    /**
     * Compute intersection of projected homogeneous line segments. Filter by extension rules. Record with
     * fraction mapping. Assumes caller knows the _worldToLocal is present.
     */
    private computeSegmentSegment3DH;
    private dispatchSegmentSegment;
    private dispatchSegmentArc;
    private dispatchArcArcThisOrder;
    private dispatchArcArc;
    private dispatchArcBsplineCurve3d;
    /** Apply the transformation to bezier curves. Optionally construct ranges. */
    private transformBeziers;
    private getRanges;
    private dispatchBezierBezierStrokeFirst;
    private dispatchBSplineCurve3dBSplineCurve3d;
    /**
     * Apply the projection transform (if any) to (xyz, w).
     * @param xyz xyz parts of input point.
     * @param w weight to use for homogeneous effects.
     */
    private projectPoint;
    private mapNPCPlaneToWorld;
    private dispatchSegmentBsplineCurve;
    /** Low level dispatch of linestring with (beziers of) a bspline curve. */
    dispatchLineStringBSplineCurve(lsA: LineString3d, extendA: boolean, curveB: BSplineCurve3d, extendB: boolean, reversed: boolean): any;
    /** Detail computation for segment intersecting linestring. */
    computeSegmentLineString(lsA: LineSegment3d, extendA: boolean, lsB: LineString3d, extendB: boolean, reversed: boolean): any;
    /** Detail computation for arc intersecting linestring. */
    computeArcLineString(arcA: Arc3d, extendA: boolean, lsB: LineString3d, extendB: boolean, reversed: boolean): any;
    /** Detail computation for linestring intersecting linestring. */
    private computeLineStringLineString;
    private static setTransformedWorkPoints;
    /** Low level dispatch of curve collection. */
    private dispatchCurveCollection;
    /** Low level dispatch to geomA given a CurveChainWithDistanceIndex in geometryB. */
    private dispatchCurveChainWithDistanceIndex;
    /** Double dispatch handler for strongly typed segment. */
    handleLineSegment3d(segmentA: LineSegment3d): any;
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
