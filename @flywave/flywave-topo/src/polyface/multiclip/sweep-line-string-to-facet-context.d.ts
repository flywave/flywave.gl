import { ClipPlane } from "../../clipping/clip-plane";
import { ConvexClipPlaneSet } from "../../clipping/convex-clip-plane-set";
import { type GrowableXYZArray } from "../../geometry3d/growable-xyz-array";
import { Point3d, Vector3d } from "../../geometry3d/point3d-vector3d";
import { type Polyface } from "../polyface";
import { type AnnounceDrapePanel } from "../polyface-query";
export declare class SweepLineStringToFacetContext {
    private readonly _spacePoints;
    private readonly _spacePointsRange;
    private readonly _numSpacePoints;
    private constructor();
    static create(xyz: GrowableXYZArray): SweepLineStringToFacetContext | undefined;
    private readonly _segmentPoint0;
    private readonly _segmentPoint1;
    private readonly _localSegmentPoint0;
    private readonly _localSegmentPoint1;
    private readonly _clipFractions;
    private readonly _localFrame;
    private readonly _polygonRange;
    /** process a single polygon.
     * @returns number crudely indicating how much work was done.
     */
    projectToPolygon(polygon: GrowableXYZArray, announce: AnnounceDrapePanel, polyface: Polyface, readIndex: number): number;
}
/**
 * Context for sweeping a line segment onto a convex polygon.
 * @internal
 */
export declare class EdgeClipData {
    /** Plane containing the edge and sweep vector */
    edgePlane: ClipPlane;
    /** Two clip planes facing each other at each end of the edge */
    clip: ConvexClipPlaneSet;
    /** work array for clipper method */
    private readonly _crossingPoints;
    /** CAPTURE the planes */
    constructor(edgePlane: ClipPlane, clip: ConvexClipPlaneSet);
    /** create object from segment and sweep. Inputs are not captured. */
    static createPointPointSweep(pointA: Point3d, pointB: Point3d, sweep: Vector3d): EdgeClipData | undefined;
    /** Intersect this edge plane with the given convex polygon and announce the intersection segment to the callback. */
    processPolygon(polygon: Point3d[] | GrowableXYZArray, announceEdge: (pointA: Point3d, pointB: Point3d) => void): void;
}
/**
 * Context for sweeping a line string onto a convex polygon.
 * @internal
 */
export declare class ClipSweptLineStringContext {
    private readonly _edgeClippers;
    private readonly _localToWorld?;
    private readonly _worldToLocal?;
    private readonly _localRange?;
    private constructor();
    static create(xyz: GrowableXYZArray, sweepVector: Vector3d | undefined): ClipSweptLineStringContext | undefined;
    /**
     * Intersect a polygon with each of the edgeClippers.
     * * If transforms and local range are defined, test the polygon's local range to see if it offers a quick exit.
     */
    processPolygon(polygon: Point3d[], announceEdge: (pointA: Point3d, pointB: Point3d) => void): void;
}
