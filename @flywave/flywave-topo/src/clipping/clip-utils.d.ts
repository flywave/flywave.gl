import { type Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumber, type AnnounceNumberNumberCurvePrimitive, CurvePrimitive } from "../curve/curve-primitive";
import { type AnyCurve, type AnyRegion } from "../curve/curve-types";
import { type GeometryQuery } from "../curve/geometry-query";
import { type GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { Range1d, Range3d } from "../geometry3d/range";
import { GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { type Transform } from "../geometry3d/transform";
import { type XAndY } from "../geometry3d/xyz-props";
import { ClipPlane } from "./clip-plane";
import { ClipPrimitive } from "./clip-primitive";
import { ClipVector } from "./clip-vector";
import { ConvexClipPlaneSet } from "./convex-clip-plane-set";
import { UnionOfConvexClipPlaneSets } from "./union-of-convex-clip-plane-sets";
export declare enum ClipPlaneContainment {
    StronglyInside = 1,
    Ambiguous = 2,
    StronglyOutside = 3
}
export declare enum ClipStepAction {
    acceptIn = 1,
    acceptOut = -1,
    passToNextStep = 0
}
export declare enum ClipStatus {
    ClipRequired = 0,
    TrivialReject = 1,
    TrivialAccept = 2
}
export interface Clipper {
    isPointOnOrInside(point: Point3d, tolerance?: number): boolean;
    announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: AnnounceNumberNumber): boolean;
    announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    appendPolygonClip?: AppendPolygonClipFunction;
}
type AppendPolygonClipFunction = (xyz: IndexedXYZCollection, insideFragments: GrowableXYZArray[], outsideFragments: GrowableXYZArray[], arrayCache: GrowableXYZArrayCache) => void;
export interface PolygonClipper {
    appendPolygonClip: AppendPolygonClipFunction;
}
export declare class ClipUtilities {
    private static _workTransform?;
    private static _workRange?;
    private static _workClipper?;
    private static readonly _selectIntervals01TestPoint;
    static selectIntervals01(curve: CurvePrimitive, unsortedFractions: GrowableFloat64Array, clipper: Clipper, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    static announceNNC(intervals: Range1d[], cp: CurvePrimitive, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    static collectClippedCurves(curve: CurvePrimitive, clipper: Clipper): CurvePrimitive[];
    static clipAnyRegion(region: AnyRegion, clipper: Clipper): AnyRegion | undefined;
    static clipAnyCurve(curve: AnyCurve, clipper: Clipper): AnyCurve[];
    static clipPolygonToClipShape(polygon: Point3d[], clipShape: ClipPrimitive): Point3d[][];
    static clipPolygonToClipShapeReturnGrowableXYZArrays(polygon: Point3d[], clipShape: ClipPrimitive): GrowableXYZArray[];
    static pointSetSingleClipStatus(points: GrowableXYZArray, planeSet: UnionOfConvexClipPlaneSets, tolerance: number): ClipStatus;
    static announceLoopsOfConvexClipPlaneSetIntersectRange(convexSet: ConvexClipPlaneSet | ClipPlane, range: Range3d, loopFunction: (loopPoints: GrowableXYZArray) => void, includeConvexSetFaces?: boolean, includeRangeFaces?: boolean, ignoreInvisiblePlanes?: boolean): void;
    static loopsOfConvexClipPlaneIntersectionWithRange(allClippers: ConvexClipPlaneSet | UnionOfConvexClipPlaneSets | ClipPlane, range: Range3d, includeConvexSetFaces?: boolean, includeRangeFaces?: boolean, ignoreInvisiblePlanes?: boolean): GeometryQuery[];
    static rangeOfConvexClipPlaneSetIntersectionWithRange(convexSet: ConvexClipPlaneSet, range: Range3d): Range3d;
    static rangeOfClipperIntersectionWithRange(clipper: ConvexClipPlaneSet | UnionOfConvexClipPlaneSets | ClipPrimitive | ClipVector | undefined, range: Range3d, observeInvisibleFlag?: boolean): Range3d;
    static doesClipperIntersectRange(clipper: ConvexClipPlaneSet | UnionOfConvexClipPlaneSets | ClipPrimitive | ClipVector | undefined, range: Range3d, observeInvisibleFlag?: boolean): boolean;
    static doesConvexClipPlaneSetIntersectRange(convexSet: ConvexClipPlaneSet, range: Range3d, includeConvexSetFaces?: boolean, includeRangeFaces?: boolean, ignoreInvisiblePlanes?: boolean): boolean;
    static doLocalRangesIntersect(range0: Range3d, local0ToWorld: Transform, range1: Range3d, local1ToWorld: Transform, range1Margin?: number): boolean;
    static isClipper(obj: any): boolean;
    static restoreSingletonInPlaceOfMultipleShards(fragments: GrowableXYZArray[] | undefined, baseCount: number, singleton: IndexedXYZCollection, arrayCache: GrowableXYZArrayCache): void;
    static createXYOffsetClipFromLineString(points: Point3d[] | IndexedXYZCollection, leftOffset: number, rightOffset: number, z0: number, z1: number): UnionOfConvexClipPlaneSets;
    static captureOrDrop(data: GrowableXYZArray, minLength: number, destination: GrowableXYZArray[], cache: GrowableXYZArrayCache): void;
    static clipSegmentToLLeftOfLineXY(linePointA: XAndY, linePointB: XAndY, segmentPoint0: XAndY, segmentPoint1: XAndY, interval: Range1d, absoluteTolerance?: number): void;
    static clipSegmentToCCWTriangleXY(pointA: XAndY, pointB: XAndY, pointC: XAndY, segment0: XAndY, segment1: XAndY, interval: Range1d, absoluteTolerance?: number): void;
    static clipSegmentBelowPlaneXY(plane: Plane3dByOriginAndUnitNormal, segmentPoint0: XAndY, segmentPoint1: XAndY, interval: Range1d, absoluteTolerance?: number): void;
    static clipSegmentBelowPlanesXY(planes: Plane3dByOriginAndUnitNormal[], segment0: XAndY, segment1: XAndY, interval: Range1d, signedAltitude?: number): void;
    static announcePolylineClip(clipper: Clipper, points: Point3d[], announce: (point0: Point3d, point1: Point3d) => void): void;
    static sumPolylineClipLength(clipper: Clipper, points: Point3d[]): number;
    static doPolygonClipSequence(xyz: IndexedXYZCollection, clippers: Clipper[], acceptedIn: GrowableXYZArray[] | undefined, acceptedOut: GrowableXYZArray[] | undefined, finalCandidates: GrowableXYZArray[] | undefined, inAction: ClipStepAction, outAction: ClipStepAction, finalFragmentAction: ClipStepAction, arrayCache: GrowableXYZArrayCache | undefined): void;
    static doPolygonClipParitySequence(xyz: IndexedXYZCollection, clippers: Clipper[], acceptedIn: GrowableXYZArray[] | undefined, acceptedOut: GrowableXYZArray[] | undefined, arrayCache: GrowableXYZArrayCache | undefined): void;
    static createComplementaryClips(clipper: ConvexClipPlaneSet): UnionOfConvexClipPlaneSets;
}
export {};
