import { BSplineCurve3d } from "../../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../../bspline/bspline-curve3d-homogeneous";
import { RecurseToCurvesGeometryHandler } from "../../geometry3d/geometry-handler";
import { Plane3dByOriginAndUnitNormal } from "../../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { Arc3d } from "../arc3d";
import { CurveChainWithDistanceIndex } from "../curve-chain-with-distance-index";
import { CurveLocationDetailPair } from "../curve-location-detail";
import { type AnyCurve } from "../curve-types";
import { LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";
/**
 * Handler class for XYZ intersections between _geometryB and another geometry.
 * * Instances are initialized and called from CurveCurve.
 * * geometryB is saved for later reference.
 * @internal
 */
export declare class CurveCurveIntersectXYZ extends RecurseToCurvesGeometryHandler {
    private readonly _extendA;
    private _geometryB;
    private readonly _extendB;
    private _results;
    private static readonly _workVector2dA;
    private static readonly _workPointAA0;
    private static readonly _workPointAA1;
    private static readonly _workPointBB0;
    private static readonly _workPointBB1;
    /**
     * @param extendA flag to enable using extension of the other geometry.
     * @param geometryB second curve for intersection.  Saved for reference by specific handler methods.
     * @param extendB flag for extension of geometryB.
     */
    constructor(extendA: boolean, geometryB: AnyCurve, extendB: boolean);
    /** Reset the geometry, leaving all other parts unchanged (and preserving accumulated intersections). */
    resetGeometry(geometryB: AnyCurve): void;
    /**
     * Return the results structure for the intersection calculation, structured as an array of CurveLocationDetailPair.
     * @param reinitialize if true, a new results structure is created for use by later calls.
     */
    grabPairedResults(reinitialize?: boolean): CurveLocationDetailPair[];
    private acceptFraction;
    /**
     * Compute intersection of two line segments.
     * Filter by extension rules.
     * Reject if evaluated points do not match coordinates (e.g. close approach point).
     * Record with fraction mapping.
     */
    private recordPointWithLocalFractions;
    /**
     * Compute intersection of two line segments.
     * Filter by extension rules.
     * Record with fraction mapping.
     */
    private computeSegmentSegment3D;
    private dispatchSegmentSegment;
    /**
     * Create a plane whose normal is the "better" cross product: `vectorA.crossProduct(vectorB)` or
     * `vectorA.crossProduct(vectorC)`
     * * The heuristic for "better" is:
     *   * first choice is cross product with `vectorB`, if `vectorA` and `vectorB` are sufficiently far from parallel
     * (or anti-parallel).
     *   * otherwise use vectorC
     * @param origin plane origin
     * @param vectorA vector which must be in the plane.
     * @param cosineValue largest cosine of the angle theta between vectorA and vectorB to prefer their cross product, e.g.
     * passing 0.94 ~ cos(20deg) will switch to using vectorC in the cross product if theta < ~20deg or theta > ~160deg.
     * @param vectorB first candidate for additional in-plane vector
     * @param vectorC second candidate for additional in-plane vector
     */
    createPlaneWithPreferredPerpendicular(origin: Point3d, vectorA: Vector3d, cosineValue: number, vectorB: Vector3d, vectorC: Vector3d): Plane3dByOriginAndUnitNormal | undefined;
    private dispatchSegmentArc;
    private dispatchArcArcInPlane;
    private dispatchArcArc;
    private dispatchArcBsplineCurve3d;
    private dispatchBSplineCurve3dBSplineCurve3d;
    private dispatchSegmentBsplineCurve;
    dispatchLineStringBSplineCurve(lsA: LineString3d, extendA: boolean, curveB: BSplineCurve3d, extendB: boolean, reversed: boolean): void;
    /** Detail computation for segment intersecting linestring. */
    computeSegmentLineString(lsA: LineSegment3d, extendA: boolean, lsB: LineString3d, extendB: boolean, reversed: boolean): any;
    /** Detail computation for arc intersecting linestring. */
    computeArcLineString(arcA: Arc3d, extendA: boolean, lsB: LineString3d, extendB: boolean, reversed: boolean): any;
    /** Detail computation for linestring intersecting linestring. */
    private computeLineStringLineString;
    /** Low level dispatch of curve collection. */
    private dispatchCurveCollection;
    /** Low level dispatch to geomA given a CurveChainWithDistanceIndex in geometryB. */
    private dispatchCurveChainWithDistanceIndex;
    /** Double dispatch handler for strongly typed segment. */
    handleLineSegment3d(segmentA: LineSegment3d): any;
    /** double dispatch handler for strongly typed linestring. */
    handleLineString3d(lsA: LineString3d): any;
    /** Double dispatch handler for strongly typed arc. */
    handleArc3d(arc0: Arc3d): any;
    /** Double dispatch handler for strongly typed bspline curve. */
    handleBSplineCurve3d(curve: BSplineCurve3d): any;
    /** Double dispatch handler for strongly typed CurveChainWithDistanceIndex. */
    handleCurveChainWithDistanceIndex(chain: CurveChainWithDistanceIndex): any;
    /** Double dispatch handler for strongly typed homogeneous bspline curve. */
    handleBSplineCurve3dH(_curve: BSplineCurve3dH): any;
}
