/* Copyright (C) 2025 flywave.gl contributors */



import { type Arc3d } from "../curve/arc3d";
import { BagOfCurves } from "../curve/curve-collection";
import { CurveFactory } from "../curve/curve-factory";
import {
    type AnnounceNumberNumber,
    type AnnounceNumberNumberCurvePrimitive,
    CurvePrimitive
} from "../curve/curve-primitive";
import { type AnyCurve, type AnyRegion } from "../curve/curve-types";
import { type GeometryQuery } from "../curve/geometry-query";
import { LineString3d } from "../curve/line-string3d";
import { Loop } from "../curve/loop";
import { Path } from "../curve/path";
import { RegionBinaryOpType, RegionOps } from "../curve/region-ops";
import { UnionRegion } from "../curve/union-region";
import { Geometry } from "../geometry";
import { FrameBuilder } from "../geometry3d/frame-builder";
import { type GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Plane3dByOriginAndUnitNormal } from "../geometry3d/plane3d-by-origin-and-unit-normal";
import { Point3dArrayCarrier } from "../geometry3d/point3d-array-carrier";
import { Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { Range1d, Range3d } from "../geometry3d/range";
import { GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { type Transform } from "../geometry3d/transform";
import { type XAndY } from "../geometry3d/xyz-props";
import { PolyfaceBuilder } from "../polyface/polyface-builder";
import { ClipPlane } from "./clip-plane";
import { ClipPrimitive } from "./clip-primitive";
import { ClipVector } from "./clip-vector";
import { ConvexClipPlaneSet } from "./convex-clip-plane-set";
import { LineStringOffsetClipperContext } from "./internal/line-string-offset-clipper-context";
import { UnionOfConvexClipPlaneSets } from "./union-of-convex-clip-plane-sets";

export enum ClipPlaneContainment {
    StronglyInside = 1,
    Ambiguous = 2,
    StronglyOutside = 3
}

export enum ClipStepAction {
    acceptIn = 1,
    acceptOut = -1,
    passToNextStep = 0
}

export enum ClipStatus {
    ClipRequired,
    TrivialReject,
    TrivialAccept
}

export interface Clipper {
    isPointOnOrInside(point: Point3d, tolerance?: number): boolean;

    announceClippedSegmentIntervals(
        f0: number,
        f1: number,
        pointA: Point3d,
        pointB: Point3d,
        announce?: AnnounceNumberNumber
    ): boolean;

    announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;

    appendPolygonClip?: AppendPolygonClipFunction;
}

type AppendPolygonClipFunction = (
    xyz: IndexedXYZCollection,
    insideFragments: GrowableXYZArray[],
    outsideFragments: GrowableXYZArray[],
    arrayCache: GrowableXYZArrayCache
) => void;

export interface PolygonClipper {
    appendPolygonClip: AppendPolygonClipFunction;
}

export class ClipUtilities {
    private static _workTransform?: Transform;
    private static _workRange?: Range3d;
    private static _workClipper?: ConvexClipPlaneSet;

    private static readonly _selectIntervals01TestPoint = Point3d.create();

    public static selectIntervals01(
        curve: CurvePrimitive,
        unsortedFractions: GrowableFloat64Array,
        clipper: Clipper,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        unsortedFractions.push(0);
        unsortedFractions.push(1);
        unsortedFractions.sort();
        let f0 = unsortedFractions.atUncheckedIndex(0);
        let f1;
        let fMid;
        const testPoint = ClipUtilities._selectIntervals01TestPoint;
        const n = unsortedFractions.length;
        for (let i = 1; i < n; i++) {
            f1 = unsortedFractions.atUncheckedIndex(i);
            if (f1 > f0 + Geometry.smallFraction) {
                fMid = 0.5 * (f0 + f1);
                if (fMid >= 0.0 && fMid <= 1.0) {
                    curve.fractionToPoint(fMid, testPoint);
                    if (clipper.isPointOnOrInside(testPoint)) {
                        if (announce) announce(f0, f1, curve);
                        else return true;
                    }
                }
                f0 = f1;
            }
        }
        return false;
    }

    public static announceNNC(
        intervals: Range1d[],
        cp: CurvePrimitive,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        if (announce) {
            for (const ab of intervals) {
                announce(ab.low, ab.high, cp);
            }
        }
        return intervals.length > 0;
    }

    public static collectClippedCurves(curve: CurvePrimitive, clipper: Clipper): CurvePrimitive[] {
        const result: CurvePrimitive[] = [];
        curve.announceClipIntervals(
            clipper,
            (fraction0: number, fraction1: number, curveA: CurvePrimitive) => {
                if (fraction1 !== fraction0) {
                    const partialCurve = curveA.clonePartialCurve(fraction0, fraction1);
                    if (partialCurve) result.push(partialCurve);
                }
            }
        );
        return result;
    }

    public static clipAnyRegion(region: AnyRegion, clipper: Clipper): AnyRegion | undefined {
        let result: UnionRegion | undefined;
        const localToWorld = (ClipUtilities._workTransform = FrameBuilder.createRightHandedFrame(
            undefined,
            region,
            ClipUtilities._workTransform
        ));
        if (!localToWorld) return result;
        const worldToLocal = localToWorld?.inverse();
        if (!worldToLocal) return result;
        const localRegion = region.cloneTransformed(worldToLocal) as AnyRegion;
        if (!localRegion) return result;

        const localRegionRange = (ClipUtilities._workRange = localRegion.range());
        const xLength = localRegionRange.xLength();
        const yLength = localRegionRange.yLength();
        const rectangle = LineString3d.createRectangleXY(
            localRegionRange.low,
            xLength,
            yLength,
            true
        );
        rectangle.tryTransformInPlace(localToWorld);

        const insideFragments: GrowableXYZArray[] = [];
        const outsideFragments: GrowableXYZArray[] = [];
        const cache = new GrowableXYZArrayCache();
        clipper.appendPolygonClip?.(
            rectangle.packedPoints,
            insideFragments,
            outsideFragments,
            cache
        );
        if (insideFragments.length === 0) return result;
        // Create the "clipped region".
        for (const fragment of insideFragments) {
            const loop = Loop.createPolygon(fragment);
            loop.tryTransformInPlace(worldToLocal);
            const clippedLocalRegion = RegionOps.regionBooleanXY(
                localRegion,
                loop,
                RegionBinaryOpType.Intersection
            );
            if (clippedLocalRegion) {
                clippedLocalRegion.tryTransformInPlace(localToWorld);
                if (!result) {
                    result =
                        clippedLocalRegion instanceof UnionRegion
                            ? clippedLocalRegion
                            : UnionRegion.create(clippedLocalRegion);
                } else if (!result.tryAddChild(clippedLocalRegion)) {
                    result.children.push(...(clippedLocalRegion as UnionRegion).children);
                }
            }
        }
        return result;
    }

    public static clipAnyCurve(curve: AnyCurve, clipper: Clipper): AnyCurve[] {
        if (curve instanceof CurvePrimitive) {
            return ClipUtilities.collectClippedCurves(curve, clipper);
        }
        if (curve.isAnyRegion()) {
            const ret = ClipUtilities.clipAnyRegion(curve, clipper);
            return ret ? [ret] : [];
        }
        const result: AnyCurve[] = [];
        if (curve instanceof Path || curve instanceof BagOfCurves) {
            for (const child of curve.children) {
                const partialClip = ClipUtilities.clipAnyCurve(child, clipper);
                result.push(...partialClip);
            }
        }
        return result;
    }

    public static clipPolygonToClipShape(
        polygon: Point3d[],
        clipShape: ClipPrimitive
    ): Point3d[][] {
        const outputA = this.clipPolygonToClipShapeReturnGrowableXYZArrays(polygon, clipShape);
        const output = [];
        for (const g of outputA) output.push(g.getPoint3dArray());
        return output;
    }

    public static clipPolygonToClipShapeReturnGrowableXYZArrays(
        polygon: Point3d[],
        clipShape: ClipPrimitive
    ): GrowableXYZArray[] {
        const output: GrowableXYZArray[] = [];
        const clipper = clipShape.fetchClipPlanesRef();
        if (clipper) {
            clipper.polygonClip(polygon, output);
        }
        return output;
    }

    public static pointSetSingleClipStatus(
        points: GrowableXYZArray,
        planeSet: UnionOfConvexClipPlaneSets,
        tolerance: number
    ): ClipStatus {
        if (planeSet.convexSets.length === 0) return ClipStatus.TrivialAccept;

        for (const convexSet of planeSet.convexSets) {
            let allOutsideSinglePlane = false;
            let anyOutside = false;

            for (const plane of convexSet.planes) {
                let numInside = 0;
                let numOutside = 0;
                const planeDistance = plane.distance - tolerance;

                const currPt = Point3d.create();
                const currVec = Vector3d.create();
                for (let i = 0; i < points.length; i++) {
                    points.getPoint3dAtUncheckedPointIndex(i, currPt);
                    currVec.setFrom(currPt);
                    currVec.dotProduct(plane.inwardNormalRef) > planeDistance
                        ? numInside++
                        : numOutside++;
                }

                anyOutside = numOutside !== 0 ? true : anyOutside;
                if (numInside === 0) {
                    allOutsideSinglePlane = true;
                    break;
                }
            }

            if (!anyOutside) return ClipStatus.TrivialAccept;
            if (!allOutsideSinglePlane) return ClipStatus.ClipRequired;
        }
        return ClipStatus.TrivialReject;
    }

    public static announceLoopsOfConvexClipPlaneSetIntersectRange(
        convexSet: ConvexClipPlaneSet | ClipPlane,
        range: Range3d,
        loopFunction: (loopPoints: GrowableXYZArray) => void,
        includeConvexSetFaces: boolean = true,
        includeRangeFaces: boolean = true,
        ignoreInvisiblePlanes = false
    ): void {
        const work = new GrowableXYZArray();
        if (includeConvexSetFaces) {
            if (convexSet instanceof ConvexClipPlaneSet) {
                for (const plane of convexSet.planes) {
                    if (ignoreInvisiblePlanes && plane.invisible) continue;
                    const pointsClippedToRange = plane.intersectRange(range, true);
                    const finalPoints = new GrowableXYZArray();
                    if (pointsClippedToRange) {
                        convexSet.polygonClip(pointsClippedToRange, finalPoints, work, plane);
                        if (finalPoints.length > 0) loopFunction(finalPoints);
                    }
                }
            } else {
                if (ignoreInvisiblePlanes && convexSet.invisible) {
                    // skip it !
                } else {
                    const pointsClippedToRange = convexSet.intersectRange(range, true);
                    if (pointsClippedToRange) loopFunction(pointsClippedToRange);
                }
            }
        }

        if (includeRangeFaces) {
            const corners = range.corners();
            for (let i = 0; i < 6; i++) {
                const indices = Range3d.faceCornerIndices(i);
                const finalPoints = new GrowableXYZArray();
                const lineString = LineString3d.createIndexedPoints(corners, indices);
                if (convexSet instanceof ConvexClipPlaneSet) {
                    convexSet.polygonClip(lineString.packedPoints, finalPoints, work);
                    if (finalPoints.length > 0) loopFunction(finalPoints);
                } else {
                    convexSet.clipConvexPolygonInPlace(lineString.packedPoints, work);
                    if (lineString.packedPoints.length > 0) loopFunction(lineString.packedPoints);
                }
            }
        }
    }

    public static loopsOfConvexClipPlaneIntersectionWithRange(
        allClippers: ConvexClipPlaneSet | UnionOfConvexClipPlaneSets | ClipPlane,
        range: Range3d,
        includeConvexSetFaces: boolean = true,
        includeRangeFaces: boolean = true,
        ignoreInvisiblePlanes = false
    ): GeometryQuery[] {
        const result: GeometryQuery[] = [];
        if (allClippers instanceof UnionOfConvexClipPlaneSets) {
            for (const clipper of allClippers.convexSets) {
                this.announceLoopsOfConvexClipPlaneSetIntersectRange(
                    clipper,
                    range,
                    (points: GrowableXYZArray) => {
                        if (points.length > 0) result.push(Loop.createPolygon(points));
                    },
                    includeConvexSetFaces,
                    includeRangeFaces,
                    ignoreInvisiblePlanes
                );
            }
        } else if (allClippers instanceof ConvexClipPlaneSet || allClippers instanceof ClipPlane) {
            this.announceLoopsOfConvexClipPlaneSetIntersectRange(
                allClippers,
                range,
                (points: GrowableXYZArray) => {
                    if (points.length > 0) result.push(Loop.createPolygon(points));
                },
                includeConvexSetFaces,
                includeRangeFaces,
                ignoreInvisiblePlanes
            );
        }
        return result;
    }

    public static rangeOfConvexClipPlaneSetIntersectionWithRange(
        convexSet: ConvexClipPlaneSet,
        range: Range3d
    ): Range3d {
        const result = Range3d.createNull();
        this.announceLoopsOfConvexClipPlaneSetIntersectRange(
            convexSet,
            range,
            (points: GrowableXYZArray) => {
                if (points.length > 0) result.extendArray(points);
            },
            true,
            true,
            false
        );
        return result;
    }

    public static rangeOfClipperIntersectionWithRange(
        clipper:
            | ConvexClipPlaneSet
            | UnionOfConvexClipPlaneSets
            | ClipPrimitive
            | ClipVector
            | undefined,
        range: Range3d,
        observeInvisibleFlag: boolean = true
    ): Range3d {
        if (clipper === undefined) return range.clone();
        if (clipper instanceof ConvexClipPlaneSet) {
            return this.rangeOfConvexClipPlaneSetIntersectionWithRange(clipper, range);
        }
        if (clipper instanceof UnionOfConvexClipPlaneSets) {
            const rangeUnion = Range3d.createNull();
            for (const c of clipper.convexSets) {
                const rangeC = this.rangeOfConvexClipPlaneSetIntersectionWithRange(c, range);
                rangeUnion.extendRange(rangeC);
            }
            return rangeUnion;
        }
        if (clipper instanceof ClipPrimitive) {
            if (observeInvisibleFlag && clipper.invisible) return range.clone();
            return this.rangeOfClipperIntersectionWithRange(clipper.fetchClipPlanesRef(), range);
        }
        if (clipper instanceof ClipVector) {
            const rangeIntersection = range.clone();
            for (const c of clipper.clips) {
                if (observeInvisibleFlag && c.invisible) {
                    // trivial range tests do not expose the effects.   Assume the hole allows everything.
                } else {
                    const rangeC = this.rangeOfClipperIntersectionWithRange(
                        c,
                        range,
                        observeInvisibleFlag
                    );
                    rangeIntersection.intersect(rangeC, rangeIntersection);
                }
            }
            return rangeIntersection;
        }
        return range.clone();
    }

    public static doesClipperIntersectRange(
        clipper:
            | ConvexClipPlaneSet
            | UnionOfConvexClipPlaneSets
            | ClipPrimitive
            | ClipVector
            | undefined,
        range: Range3d,
        observeInvisibleFlag: boolean = true
    ): boolean {
        if (clipper === undefined) return true;

        if (clipper instanceof ConvexClipPlaneSet) {
            return this.doesConvexClipPlaneSetIntersectRange(clipper, range);
        }

        if (clipper instanceof UnionOfConvexClipPlaneSets) {
            for (const c of clipper.convexSets) {
                if (this.doesConvexClipPlaneSetIntersectRange(c, range)) return true;
            }
            return false;
        }

        if (clipper instanceof ClipPrimitive) {
            if (observeInvisibleFlag && clipper.invisible) {
                // um is there an easy way to detect range-completely-inside?
                return true;
            }
            return this.doesClipperIntersectRange(clipper.fetchClipPlanesRef(), range);
        }

        if (clipper instanceof ClipVector) {
            const rangeIntersection = range.clone();
            for (const c of clipper.clips) {
                if (observeInvisibleFlag && c.invisible) {
                    // trivial range tests do not expose the effects.   Assume the hole allows everything.
                } else {
                    const rangeC = this.rangeOfClipperIntersectionWithRange(
                        c,
                        range,
                        observeInvisibleFlag
                    );
                    rangeIntersection.intersect(rangeC, rangeIntersection);
                }
            }
            return !rangeIntersection.isNull;
        }
        return false;
    }

    public static doesConvexClipPlaneSetIntersectRange(
        convexSet: ConvexClipPlaneSet,
        range: Range3d,
        includeConvexSetFaces: boolean = true,
        includeRangeFaces: boolean = true,
        ignoreInvisiblePlanes = false
    ): boolean {
        const work = new GrowableXYZArray();
        if (includeConvexSetFaces) {
            for (const plane of convexSet.planes) {
                if (ignoreInvisiblePlanes && plane.invisible) continue;
                const pointsClippedToRange = plane.intersectRange(range, true);
                if (pointsClippedToRange) {
                    const finalPoints = new GrowableXYZArray();
                    convexSet.polygonClip(pointsClippedToRange, finalPoints, work, plane);
                    if (finalPoints.length > 0) return true;
                }
            }
        }

        if (includeRangeFaces) {
            const corners = range.corners();
            for (let i = 0; i < 6; i++) {
                const indices = Range3d.faceCornerIndices(i);
                const finalPoints = new GrowableXYZArray();
                const lineString = LineString3d.createIndexedPoints(corners, indices);
                convexSet.polygonClip(lineString.packedPoints, finalPoints, work);
                if (finalPoints.length > 0) return true;
            }
        }
        return false;
    }

    public static doLocalRangesIntersect(
        range0: Range3d,
        local0ToWorld: Transform,
        range1: Range3d,
        local1ToWorld: Transform,
        range1Margin?: number
    ): boolean {
        const worldToLocal1 = (ClipUtilities._workTransform = local1ToWorld.inverse(
            ClipUtilities._workTransform
        ));
        if (!worldToLocal1) return false;
        let myRange1 = range1;
        if (range1Margin) {
            myRange1 = ClipUtilities._workRange = range1.clone(ClipUtilities._workRange);
            myRange1.expandInPlace(range1Margin);
        }
        const local0ToLocal1 = worldToLocal1.multiplyTransformTransform(
            local0ToWorld,
            worldToLocal1
        );
        const builder = PolyfaceBuilder.create();
        builder.addTransformedRangeMesh(local0ToLocal1, range0);
        const mesh0 = builder.claimPolyface();
        const clipper = (ClipUtilities._workClipper = ConvexClipPlaneSet.createConvexPolyface(
            mesh0,
            ClipUtilities._workClipper
        ).clipper);
        return ClipUtilities.doesClipperIntersectRange(clipper, myRange1);
    }

    public static isClipper(obj: any): boolean {
        if (obj) {
            if (
                obj.isPointOnOrInside &&
                obj.announceClippedSegmentIntervals &&
                obj.announceClippedArcIntervals
            ) {
                return true;
            }
        }
        return false;
    }

    public static restoreSingletonInPlaceOfMultipleShards(
        fragments: GrowableXYZArray[] | undefined,
        baseCount: number,
        singleton: IndexedXYZCollection,
        arrayCache: GrowableXYZArrayCache
    ): void {
        if (fragments && fragments.length > baseCount + 1) {
            while (fragments.length > baseCount) {
                const f = fragments.pop();
                arrayCache.dropToCache(f);
            }
            fragments.push(arrayCache.grabAndFill(singleton));
        }
    }

    public static createXYOffsetClipFromLineString(
        points: Point3d[] | IndexedXYZCollection,
        leftOffset: number,
        rightOffset: number,
        z0: number,
        z1: number
    ): UnionOfConvexClipPlaneSets {
        if (Array.isArray(points)) {
            return LineStringOffsetClipperContext.createClipBetweenOffsets(
                new Point3dArrayCarrier(points),
                leftOffset,
                rightOffset,
                z0,
                z1
            );
        }
        return LineStringOffsetClipperContext.createClipBetweenOffsets(
            points,
            leftOffset,
            rightOffset,
            z0,
            z1
        );
    }

    public static captureOrDrop(
        data: GrowableXYZArray,
        minLength: number,
        destination: GrowableXYZArray[],
        cache: GrowableXYZArrayCache
    ): void {
        if (data.length >= minLength) destination.push(data);
        else cache.dropToCache(data);
    }

    public static clipSegmentToLLeftOfLineXY(
        linePointA: XAndY,
        linePointB: XAndY,
        segmentPoint0: XAndY,
        segmentPoint1: XAndY,
        interval: Range1d,
        absoluteTolerance: number = 1.0e-14
    ): void {
        const ux = linePointB.x - linePointA.x;
        const uy = linePointB.y - linePointA.y;
        const h0 = -(ux * (segmentPoint0.y - linePointA.y) - uy * (segmentPoint0.x - linePointA.x));
        const h1 = -(ux * (segmentPoint1.y - linePointA.y) - uy * (segmentPoint1.x - linePointA.x));
        if (h0 < absoluteTolerance && h1 < absoluteTolerance) {
            return;
        }
        if (h0 * h1 > 0.0) {
            if (h0 > 0.0) interval.setNull();
        } else if (h0 * h1 < 0.0) {
            const fraction = -h0 / (h1 - h0);
            if (h0 < 0.0) {
                interval.intersectRangeXXInPlace(0.0, fraction);
                return;
            } else {
                interval.intersectRangeXXInPlace(fraction, 1.0);
                return;
            }
        } else {
            if (h0 > 0.0) {
                interval.intersectRangeXXInPlace(1.0, 1.0);
            } else if (h1 > 0.0) {
                interval.intersectRangeXXInPlace(0.0, 0.0);
            }
        }
    }

    public static clipSegmentToCCWTriangleXY(
        pointA: XAndY,
        pointB: XAndY,
        pointC: XAndY,
        segment0: XAndY,
        segment1: XAndY,
        interval: Range1d,
        absoluteTolerance: number = 1.0e-14
    ): void {
        if (!interval.isNull) {
            this.clipSegmentToLLeftOfLineXY(
                pointA,
                pointB,
                segment0,
                segment1,
                interval,
                absoluteTolerance
            );
            if (!interval.isNull) {
                this.clipSegmentToLLeftOfLineXY(
                    pointB,
                    pointC,
                    segment0,
                    segment1,
                    interval,
                    absoluteTolerance
                );
                if (!interval.isNull) {
                    this.clipSegmentToLLeftOfLineXY(
                        pointC,
                        pointA,
                        segment0,
                        segment1,
                        interval,
                        absoluteTolerance
                    );
                }
            }
        }
    }

    public static clipSegmentBelowPlaneXY(
        plane: Plane3dByOriginAndUnitNormal,
        segmentPoint0: XAndY,
        segmentPoint1: XAndY,
        interval: Range1d,
        absoluteTolerance: number = 1.0e-14
    ): void {
        const h0 = plane.altitudeXY(segmentPoint0.x, segmentPoint0.y);
        const h1 = plane.altitudeXY(segmentPoint1.x, segmentPoint1.y);
        if (h0 < absoluteTolerance && h1 < absoluteTolerance) {
            return;
        }
        if (h0 * h1 > 0.0) {
            if (h0 > 0.0) interval.setNull();
        } else if (h0 * h1 < 0.0) {
            const fraction = -h0 / (h1 - h0);
            if (h0 < 0.0) {
                interval.intersectRangeXXInPlace(0.0, fraction);
                return;
            } else {
                interval.intersectRangeXXInPlace(fraction, 1.0);
                return;
            }
        } else {
            if (h0 > 0.0) {
                interval.intersectRangeXXInPlace(1.0, 1.0);
            } else if (h1 > 0.0) {
                interval.intersectRangeXXInPlace(0.0, 0.0);
            }
        }
    }

    public static clipSegmentBelowPlanesXY(
        planes: Plane3dByOriginAndUnitNormal[],
        segment0: XAndY,
        segment1: XAndY,
        interval: Range1d,
        signedAltitude: number = 1.0e-14
    ): void {
        const numPlanes = planes.length;
        for (let i = 0; !interval.isNull && i < numPlanes; i++) {
            this.clipSegmentBelowPlaneXY(planes[i], segment0, segment1, interval, signedAltitude);
        }
    }

    public static announcePolylineClip(
        clipper: Clipper,
        points: Point3d[],
        announce: (point0: Point3d, point1: Point3d) => void
    ): void {
        for (let i = 0; i + 1 < points.length; i++) {
            clipper.announceClippedSegmentIntervals(
                0,
                1,
                points[i],
                points[i + 1],
                (f0: number, f1: number) => {
                    announce(
                        points[i].interpolate(f0, points[i + 1]),
                        points[i].interpolate(f1, points[i + 1])
                    );
                }
            );
        }
    }

    public static sumPolylineClipLength(clipper: Clipper, points: Point3d[]): number {
        let s = 0;
        for (let i = 0; i + 1 < points.length; i++) {
            const a = points[i].distance(points[i + 1]);
            clipper.announceClippedSegmentIntervals(
                0,
                1,
                points[i],
                points[i + 1],
                (f0: number, f1: number) => {
                    s += Math.abs(f1 - f0) * a;
                }
            );
        }
        return s;
    }

    public static doPolygonClipSequence(
        xyz: IndexedXYZCollection,
        clippers: Clipper[],
        acceptedIn: GrowableXYZArray[] | undefined,
        acceptedOut: GrowableXYZArray[] | undefined,
        finalCandidates: GrowableXYZArray[] | undefined,
        inAction: ClipStepAction,
        outAction: ClipStepAction,
        finalFragmentAction: ClipStepAction,
        arrayCache: GrowableXYZArrayCache | undefined
    ) {
        if (arrayCache === undefined) arrayCache = new GrowableXYZArrayCache();
        let candidates = [arrayCache.grabAndFill(xyz)];
        let nextCandidates: GrowableXYZArray[] = [];
        const intermediateIn: GrowableXYZArray[] = [];
        const intermediateOut: GrowableXYZArray[] = [];
        const oldInsideCount = acceptedIn ? acceptedIn.length : 0;
        const oldOutsideCount = acceptedOut ? acceptedOut.length : 0;
        let shard;
        for (const c of clippers) {
            if (c.appendPolygonClip) {
                while (undefined !== (shard = candidates.pop())) {
                    c.appendPolygonClip(shard, intermediateIn, intermediateOut, arrayCache);
                    distributeFragments(
                        inAction,
                        intermediateIn,
                        acceptedIn,
                        acceptedOut,
                        nextCandidates,
                        arrayCache
                    );
                    distributeFragments(
                        outAction,
                        intermediateOut,
                        acceptedIn,
                        acceptedOut,
                        nextCandidates,
                        arrayCache
                    );
                    arrayCache.dropToCache(shard);
                }
                const temp = candidates;
                candidates = nextCandidates;
                nextCandidates = temp;
            }
        }
        distributeFragments(
            finalFragmentAction,
            candidates,
            acceptedIn,
            acceptedOut,
            finalCandidates,
            arrayCache
        );
        if (acceptedOut?.length === oldOutsideCount) {
            ClipUtilities.restoreSingletonInPlaceOfMultipleShards(
                acceptedIn,
                oldInsideCount,
                xyz,
                arrayCache
            );
        }
        if (acceptedIn?.length === oldInsideCount) {
            ClipUtilities.restoreSingletonInPlaceOfMultipleShards(
                acceptedOut,
                oldOutsideCount,
                xyz,
                arrayCache
            );
        }
    }

    public static doPolygonClipParitySequence(
        xyz: IndexedXYZCollection,
        clippers: Clipper[],
        acceptedIn: GrowableXYZArray[] | undefined,
        acceptedOut: GrowableXYZArray[] | undefined,
        arrayCache: GrowableXYZArrayCache | undefined
    ) {
        if (arrayCache === undefined) arrayCache = new GrowableXYZArrayCache();
        let candidatesOut = [arrayCache.grabAndFill(xyz)];
        let candidatesIn: GrowableXYZArray[] = [];
        let nextCandidatesIn: GrowableXYZArray[] = [];
        let nextCandidatesOut: GrowableXYZArray[] = [];
        const intermediateIn: GrowableXYZArray[] = [];
        const intermediateOut: GrowableXYZArray[] = [];
        let shard;
        for (const c of clippers) {
            if (c.appendPolygonClip) {
                while (undefined !== (shard = candidatesIn.pop())) {
                    c.appendPolygonClip(shard, intermediateIn, intermediateOut, arrayCache);
                    distributeFragments(
                        ClipStepAction.acceptOut,
                        intermediateIn,
                        nextCandidatesIn,
                        nextCandidatesOut,
                        undefined,
                        arrayCache
                    );
                    distributeFragments(
                        ClipStepAction.acceptIn,
                        intermediateOut,
                        nextCandidatesIn,
                        nextCandidatesOut,
                        undefined,
                        arrayCache
                    );
                    arrayCache.dropToCache(shard);
                }
                while (undefined !== (shard = candidatesOut.pop())) {
                    c.appendPolygonClip(shard, intermediateIn, intermediateOut, arrayCache);
                    distributeFragments(
                        ClipStepAction.acceptIn,
                        intermediateIn,
                        nextCandidatesIn,
                        nextCandidatesOut,
                        undefined,
                        arrayCache
                    );
                    distributeFragments(
                        ClipStepAction.acceptOut,
                        intermediateOut,
                        nextCandidatesIn,
                        nextCandidatesOut,
                        undefined,
                        arrayCache
                    );
                    arrayCache.dropToCache(shard);
                }
                const tempA = candidatesIn;
                candidatesIn = nextCandidatesIn;
                nextCandidatesIn = tempA;
                const tempB = candidatesOut;
                candidatesOut = nextCandidatesOut;
                nextCandidatesOut = tempB;
            }
        }
        if (candidatesOut.length === 0) acceptedIn?.push(arrayCache.grabAndFill(xyz));
        else if (candidatesOut.length === 0) acceptedOut?.push(arrayCache.grabAndFill(xyz));
        else {
            moveFragments(candidatesIn, acceptedIn, arrayCache);
            moveFragments(candidatesOut, acceptedOut, arrayCache);
        }
    }

    public static createComplementaryClips(
        clipper: ConvexClipPlaneSet
    ): UnionOfConvexClipPlaneSets {
        const planes = clipper.planes;
        const interval = Range1d.createNull();
        const n = planes.length;
        const newClippers: ConvexClipPlaneSet[] = [];
        for (const p of planes) {
            const outerSet = ConvexClipPlaneSet.createEmpty();
            outerSet.addPlaneToConvexSet(p.cloneNegated());
            newClippers.push(outerSet);
        }
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const ray = CurveFactory.planePlaneIntersectionRay(planes[i], planes[j]);
                if (ray) {
                    if (clipper.hasIntersectionWithRay(ray, interval)) {
                        const newNormal = planes[j].inwardNormalRef.minus(
                            planes[i].inwardNormalRef
                        );
                        const plane1 = ClipPlane.createNormalAndPoint(newNormal, ray.origin);
                        if (plane1) {
                            const plane2 = plane1.cloneNegated();
                            newClippers[i].addPlaneToConvexSet(plane1);
                            newClippers[j].addPlaneToConvexSet(plane2);
                        }
                    }
                }
            }
        }
        return UnionOfConvexClipPlaneSets.createConvexSets(newClippers);
    }
}
function moveFragments(
    fragments: GrowableXYZArray[],
    destination: GrowableXYZArray[] | undefined,
    arrayCache: GrowableXYZArrayCache
) {
    if (destination === undefined) arrayCache.dropAllToCache(fragments);
    else {
        for (const f of fragments) destination.push(f);
    }
    fragments.length = 0;
}

function distributeFragments(
    action: ClipStepAction,
    fragments: GrowableXYZArray[],
    acceptedIn: GrowableXYZArray[] | undefined,
    acceptedOut: GrowableXYZArray[] | undefined,
    passToNextStep: GrowableXYZArray[] | undefined,
    arrayCache: GrowableXYZArrayCache
) {
    let destination;
    if (action === ClipStepAction.acceptIn) destination = acceptedIn;
    else if (action === ClipStepAction.acceptOut) destination = acceptedOut;
    else if (action === ClipStepAction.passToNextStep) destination = passToNextStep;
    if (destination === undefined) arrayCache.dropAllToCache(fragments);
    else {
        for (const f of fragments) destination.push(f);
    }
    fragments.length = 0;
}
