import { type BSplineCurve3d } from "../../bspline/bspline-curve";
import { type BSplineCurve3dH } from "../../bspline/bspline-curve3d-homogeneous";
import { type PlaneAltitudeEvaluator } from "../../geometry";
import { RecurseToCurvesGeometryHandler } from "../../geometry3d/geometry-handler";
import { GrowableXYZArray } from "../../geometry3d/growable-xyz-array";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { Range1d } from "../../geometry3d/range";
import { Ray3d } from "../../geometry3d/ray3d";
import { type Arc3d } from "../arc3d";
import { GeometryQuery } from "../geometry-query";
import { LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";
/**
 * Accumulator context for searching for extrema of geometry along a plane.
 * @internal
 */
export declare class PlaneAltitudeRangeContext extends RecurseToCurvesGeometryHandler {
    plane: PlaneAltitudeEvaluator;
    range: Range1d;
    lowPoint: Point3d | undefined;
    highPoint: Point3d | undefined;
    private constructor();
    resetRange(): void;
    announcePoint(point: Point3d): void;
    announcePoints(points: GrowableXYZArray): void;
    static createCapture(plane: PlaneAltitudeEvaluator): PlaneAltitudeRangeContext;
    handleLineSegment3d(segment: LineSegment3d): void;
    handleLineString3d(lineString: LineString3d): void;
    private _strokeOptions?;
    private initStrokeOptions;
    handleBSplineCurve3d(bcurve: BSplineCurve3d): void;
    handleBSplineCurve3dH(bcurve: BSplineCurve3dH): void;
    private _sineCosinePolynomial?;
    private _workPoint?;
    handleArc3d(g: Arc3d): void;
    private static findExtremesInDirection;
    /**
     * Compute altitudes for the geometry (via dispatch) over the plane defined by the given direction, and
     * return points at min and max altitude, packed into a `LineSegment3d`.
     * @param geometry geometry to project
     * @param direction vector or ray on which to project the instance. A `Vector3d` is treated as a `Ray3d` with
     * zero origin.
     * @param lowHigh optional receiver for output
     */
    static findExtremePointsInDirection(geometry: GeometryQuery | GrowableXYZArray | Point3d[], direction: Vector3d | Ray3d, lowHigh?: LineSegment3d): LineSegment3d | undefined;
    /**
     * Compute altitudes for the geometry (via dispatch) over the plane defined by the given direction, and return
     * the min and max altitudes, packed into a Range1d.
     * @param geometry geometry to project
     * @param direction vector or ray on which to project the instance. A `Vector3d` is treated as a `Ray3d` with
     * zero origin.
     * @param lowHigh optional receiver for output
     */
    static findExtremeAltitudesInDirection(geometry: GeometryQuery | GrowableXYZArray | Point3d[], direction: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
    /**
     * Project geometry (via dispatch) onto the given ray, and return the extreme fractional parameters of projection.
     * @param geometry geometry to project
     * @param direction vector or ray onto which the instance is projected. A `Vector3d` is treated as a `Ray3d` with
     * zero origin.
     * @param lowHigh optional receiver for output
     */
    static findExtremeFractionsAlongDirection(geometry: GeometryQuery | GrowableXYZArray | Point3d[], direction: Vector3d | Ray3d, lowHigh?: Range1d): Range1d | undefined;
}
