import { RecurseToCurvesGeometryHandler } from "../../geometry3d/geometry-handler";
import { Vector3d } from "../../geometry3d/point3d-vector3d";
import { type Ray3d } from "../../geometry3d/ray3d";
import { type Arc3d } from "../arc3d";
import { type AnyCurve } from "../curve-types";
import { type GeometryQuery } from "../geometry-query";
import { type LineSegment3d } from "../line-segment3d";
import { LineString3d } from "../line-string3d";
/**
 * Context for computing geometry range around an axis.
 * * The publicly called method is `computeZRRange (ray, geometry)
 */
export declare class CylindricalRangeQuery extends RecurseToCurvesGeometryHandler {
    private readonly _perpVector;
    private _maxDistance;
    private readonly _localToWorld;
    /** capture ray and initialize evolving ranges. */
    private constructor();
    private readonly _localPoint;
    private readonly _worldPoint;
    private announcePoint;
    handleLineSegment3d(segment0: LineSegment3d): void;
    handleLineString3d(ls0: LineString3d): void;
    handleArc3d(arc0: Arc3d): any;
    /**
     * Compute the largest vector perpendicular to a ray and ending on the geometry.
     * @param geometry0 geometry to search
     * @returns vector from ray to geometry.
     */
    static computeMaxVectorFromRay(ray: Ray3d, geometry: GeometryQuery): Vector3d;
    /**
     * Recurse through geometry.children to find linestrings.
     * In each linestring, compute the surface normal annotation from
     *  * the curve tangent stored in the linestring
     *  * the axis of rotation
     *  * a default V vector to be used when the linestring point is close to the axis.
     * @param geometry
     * @param axis
     * @param defaultVectorV
     */
    static buildRotationalNormalsInLineStrings(geometry: AnyCurve, axis: Ray3d, defaultVectorFromAxis: Vector3d): void;
}
