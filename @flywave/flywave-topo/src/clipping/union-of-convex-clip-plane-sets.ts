/* Copyright (C) 2025 flywave.gl contributors */



import { type Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumberCurvePrimitive } from "../curve/curve-primitive";
import { type LineSegment3d } from "../curve/line-segment3d";
import { Geometry } from "../geometry";
import { GrowableFloat64Array } from "../geometry3d/growable-float64-array";
import { GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { type Range3d, Range1d } from "../geometry3d/range";
import { type Ray3d } from "../geometry3d/ray3d";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { Segment1d } from "../geometry3d/segment1d";
import { type Transform } from "../geometry3d/transform";
import { type Matrix4d } from "../geometry4d/matrix4d";
import {
    type Clipper,
    type PolygonClipper,
    ClipPlaneContainment,
    ClipUtilities
} from "./clip-utils";
import { type ConvexClipPlaneSetProps, ConvexClipPlaneSet } from "./convex-clip-plane-set";

export type UnionOfConvexClipPlaneSetsProps = ConvexClipPlaneSetProps[];

export class UnionOfConvexClipPlaneSets implements Clipper, PolygonClipper {
    private readonly _convexSets: ConvexClipPlaneSet[];

    public get convexSets(): ConvexClipPlaneSet[] {
        return this._convexSets;
    }

    private constructor() {
        this._convexSets = [];
    }

    public toJSON(): UnionOfConvexClipPlaneSetsProps {
        const val: ConvexClipPlaneSetProps[] = [];
        for (const convex of this._convexSets) val.push(convex.toJSON());
        return val;
    }

    public static fromJSON(
        json: UnionOfConvexClipPlaneSetsProps | undefined,
        result?: UnionOfConvexClipPlaneSets
    ): UnionOfConvexClipPlaneSets {
        result = result ? result : new UnionOfConvexClipPlaneSets();
        result._convexSets.length = 0;
        if (!Array.isArray(json)) return result;

        for (const thisJson of json) result._convexSets.push(ConvexClipPlaneSet.fromJSON(thisJson));
        return result;
    }

    public static createEmpty(result?: UnionOfConvexClipPlaneSets): UnionOfConvexClipPlaneSets {
        if (result) {
            result._convexSets.length = 0;
            return result;
        }
        return new UnionOfConvexClipPlaneSets();
    }

    public isAlmostEqual(other: UnionOfConvexClipPlaneSets): boolean {
        if (this._convexSets.length !== other._convexSets.length) return false;
        for (let i = 0; i < this._convexSets.length; i++) {
            if (!this._convexSets[i].isAlmostEqual(other._convexSets[i])) return false;
        }
        return true;
    }

    public static createConvexSets(
        convexSets: ConvexClipPlaneSet[],
        result?: UnionOfConvexClipPlaneSets
    ): UnionOfConvexClipPlaneSets {
        result = result ? result : new UnionOfConvexClipPlaneSets();
        for (const set of convexSets) result._convexSets.push(set);
        return result;
    }

    public clone(result?: UnionOfConvexClipPlaneSets): UnionOfConvexClipPlaneSets {
        result = result ? result : new UnionOfConvexClipPlaneSets();
        result._convexSets.length = 0;
        for (const convexSet of this._convexSets) result._convexSets.push(convexSet.clone());
        return result;
    }

    public addConvexSet(toAdd: ConvexClipPlaneSet | undefined) {
        if (toAdd) this._convexSets.push(toAdd);
    }

    public hasIntersectionWithRay(ray: Ray3d, maximalRange?: Range1d): boolean {
        if (maximalRange === undefined) {
            for (const planeSet of this._convexSets) {
                if (planeSet.hasIntersectionWithRay(ray)) return true;
            }
            return false;
        }
        maximalRange.setNull();
        const rangeA = Range1d.createNull();
        for (const planeSet of this._convexSets) {
            if (planeSet.hasIntersectionWithRay(ray, rangeA)) maximalRange.extendRange(rangeA);
        }
        return !maximalRange.isNull;
    }

    public isPointInside(point: Point3d): boolean {
        for (const convexSet of this._convexSets) {
            if (convexSet.isPointInside(point)) {
                return true;
            }
        }
        return false;
    }

    public isPointOnOrInside(
        point: Point3d,
        tolerance: number = Geometry.smallMetricDistance
    ): boolean {
        for (const convexSet of this._convexSets) {
            if (convexSet.isPointOnOrInside(point, tolerance)) return true;
        }
        return false;
    }

    public isSphereInside(point: Point3d, radius: number) {
        for (const convexSet of this._convexSets) {
            if (convexSet.isSphereInside(point, radius)) return true;
        }
        return false;
    }

    public isAnyPointInOrOnFromSegment(segment: LineSegment3d): boolean {
        for (const convexSet of this._convexSets) {
            if (
                convexSet.announceClippedSegmentIntervals(
                    0.0,
                    1.0,
                    segment.point0Ref,
                    segment.point1Ref
                )
            ) {
                return true;
            }
        }
        return false;
    }

    public appendIntervalsFromSegment(segment: LineSegment3d, intervals: Segment1d[]) {
        for (const convexSet of this._convexSets) {
            convexSet.announceClippedSegmentIntervals(
                0.0,
                1.0,
                segment.point0Ref,
                segment.point1Ref,
                (fraction0: number, fraction1: number) =>
                    intervals.push(Segment1d.create(fraction0, fraction1))
            );
        }
    }

    public transformInPlace(transform: Transform) {
        for (const convexSet of this._convexSets) {
            convexSet.transformInPlace(transform);
        }
    }

    public classifyPointContainment(points: Point3d[], onIsOutside: boolean): number {
        for (const convexSet of this._convexSets) {
            const thisStatus = convexSet.classifyPointContainment(points, onIsOutside);
            if (thisStatus !== ClipPlaneContainment.StronglyOutside) return thisStatus;
        }
        return ClipPlaneContainment.StronglyOutside;
    }

    public polygonClip(input: GrowableXYZArray | Point3d[], output: GrowableXYZArray[]) {
        output.length = 0;
        if (Array.isArray(input)) input = GrowableXYZArray.create(input);
        const work = new GrowableXYZArray();
        for (const convexSet of this._convexSets) {
            const convexSetOutput = new GrowableXYZArray();
            convexSet.polygonClip(input, convexSetOutput, work);
            if (convexSetOutput.length !== 0) output.push(convexSetOutput);
        }
    }

    public announceClippedSegmentIntervals(
        f0: number,
        f1: number,
        pointA: Point3d,
        pointB: Point3d,
        announce?: (fraction0: number, fraction1: number) => void
    ): boolean {
        let numAnnounce = 0;
        for (const convexSet of this._convexSets) {
            if (convexSet.announceClippedSegmentIntervals(f0, f1, pointA, pointB, announce)) {
                numAnnounce++;
            }
        }
        return numAnnounce > 0;
    }

    private static readonly _clipArcFractionArray = new GrowableFloat64Array();

    public announceClippedArcIntervals(
        arc: Arc3d,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        const breaks = UnionOfConvexClipPlaneSets._clipArcFractionArray;
        breaks.clear();
        for (const convexSet of this._convexSets) {
            for (const clipPlane of convexSet.planes) {
                clipPlane.appendIntersectionRadians(arc, breaks);
            }
        }
        arc.sweep.radiansArrayToPositivePeriodicFractions(breaks);
        return ClipUtilities.selectIntervals01(arc, breaks, this, announce);
    }

    public computePlanePlanePlaneIntersectionsInAllConvexSets(
        points: Point3d[] | undefined,
        rangeToExtend: Range3d | undefined,
        transform?: Transform,
        testContainment: boolean = true
    ): number {
        let n = 0;
        for (const convexSet of this._convexSets) {
            n += convexSet.computePlanePlanePlaneIntersections(
                points,
                rangeToExtend,
                transform,
                testContainment
            );
        }
        return n;
    }

    public multiplyPlanesByMatrix4d(
        matrix: Matrix4d,
        invert: boolean = true,
        transpose: boolean = true
    ): boolean {
        if (invert) {
            const inverse = matrix.createInverse();
            if (!inverse) return false;
            return this.multiplyPlanesByMatrix4d(inverse, false, transpose);
        }
        for (const convexSet of this._convexSets) {
            convexSet.multiplyPlanesByMatrix4d(matrix, false, transpose);
        }
        return true;
    }

    public setInvisible(invisible: boolean) {
        for (const convexSet of this._convexSets) {
            convexSet.setInvisible(invisible);
        }
    }

    public addOutsideZClipSets(invisible: boolean, zLow?: number, zHigh?: number) {
        if (zLow) {
            const convexSet = ConvexClipPlaneSet.createEmpty();
            convexSet.addZClipPlanes(invisible, zLow);
            this._convexSets.push(convexSet);
        }
        if (zHigh) {
            const convexSet = ConvexClipPlaneSet.createEmpty();
            convexSet.addZClipPlanes(invisible, undefined, zHigh);
            this._convexSets.push(convexSet);
        }
    }

    public takeConvexSets(source: UnionOfConvexClipPlaneSets) {
        let convexSet;
        while (undefined !== (convexSet = source._convexSets.pop())) {
            this._convexSets.push(convexSet);
        }
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ): void {
        const oldOutsideCount = outsideFragments.length;
        const oldInsideCount = insideFragments.length;
        let carryForwardA = [arrayCache.grabAndFill(xyz)];
        let carryForwardB: GrowableXYZArray[] = [];
        let tempAB;
        let shard;
        for (const c of this._convexSets) {
            while (undefined !== (shard = carryForwardA.pop())) {
                c.appendPolygonClip(shard, insideFragments, carryForwardB, arrayCache);
                arrayCache.dropToCache(shard);
            }
            tempAB = carryForwardB;
            carryForwardB = carryForwardA;
            carryForwardA = tempAB;
        }
        while (undefined !== (shard = carryForwardA.pop())) {
            outsideFragments.push(shard);
        }
        if (outsideFragments.length === oldOutsideCount) {
            ClipUtilities.restoreSingletonInPlaceOfMultipleShards(
                insideFragments,
                oldInsideCount,
                xyz,
                arrayCache
            );
        } else if (insideFragments.length === oldInsideCount) {
            ClipUtilities.restoreSingletonInPlaceOfMultipleShards(
                outsideFragments,
                oldOutsideCount,
                xyz,
                arrayCache
            );
        }
    }
}
