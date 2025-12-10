/* Copyright (C) 2025 flywave.gl contributors */



import { type Arc3d } from "../curve/arc3d";
import {
    type AnnounceNumberNumber,
    type AnnounceNumberNumberCurvePrimitive
} from "../curve/curve-primitive";
import { LineSegment3d } from "../curve/line-segment3d";
import { Geometry } from "../geometry";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Point3d, type Vector3d } from "../geometry3d/point3d-vector3d";
import { Range3d } from "../geometry3d/range";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { type Segment1d } from "../geometry3d/segment1d";
import { Transform } from "../geometry3d/transform";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { assert } from "../utils";
import { BooleanClipNodeIntersection } from "./boolean-clip-node";
import { type ClipPlane } from "./clip-plane";
import {
    type ClipPrimitiveProps,
    ClipMaskXYZRangePlanes,
    ClipPrimitive,
    ClipShape
} from "./clip-primitive";
import { type Clipper, ClipPlaneContainment } from "./clip-utils";
import { type ConvexClipPlaneSet } from "./convex-clip-plane-set";

export type ClipVectorProps = ClipPrimitiveProps[];

export class ClipVector implements Clipper {
    private _clips: ClipPrimitive[];

    public boundingRange: Range3d = Range3d.createNull();

    public get clips() {
        return this._clips;
    }

    private constructor(clips?: ClipPrimitive[]) {
        this._clips = clips ? clips : [];
    }

    public get isValid(): boolean {
        return this._clips.length > 0;
    }

    public static createEmpty(result?: ClipVector): ClipVector {
        if (result) {
            result._clips.length = 0;
            return result;
        }
        return new ClipVector();
    }

    public static createCapture(clips: ClipPrimitive[], result?: ClipVector): ClipVector {
        if (result) {
            result._clips = clips;
            return result;
        }
        return new ClipVector(clips);
    }

    public static create(clips: ClipPrimitive[], result?: ClipVector): ClipVector {
        const clipClones: ClipPrimitive[] = [];
        for (const clip of clips) clipClones.push(clip.clone());
        return ClipVector.createCapture(clipClones, result);
    }

    public clone(result?: ClipVector): ClipVector {
        const retVal = result ? result : new ClipVector();
        retVal._clips.length = 0;
        for (const clip of this._clips) {
            retVal._clips.push(clip.clone());
        }
        retVal.boundingRange.setFrom(this.boundingRange);
        return retVal;
    }

    public toJSON(): ClipVectorProps {
        if (!this.isValid) return [];

        return this.clips.map(clip => clip.toJSON());
    }

    public static fromJSON(json: ClipVectorProps | undefined, result?: ClipVector): ClipVector {
        result = result ? result : new ClipVector();
        result.clear();
        if (!Array.isArray(json)) return result;
        try {
            for (const clip of json) {
                const clipPrim = ClipPrimitive.fromJSON(clip);
                if (clipPrim) result._clips.push(clipPrim);
            }
        } catch (e) {
            result.clear();
        }
        return result;
    }

    public clear() {
        this._clips.length = 0;
    }

    public appendClone(clip: ClipPrimitive) {
        this._clips.push(clip.clone());
    }

    public appendReference(clip: ClipPrimitive) {
        this._clips.push(clip);
    }

    public appendShape(
        shape: Point3d[],
        zLow?: number,
        zHigh?: number,
        transform?: Transform,
        isMask: boolean = false,
        invisible: boolean = false
    ): boolean {
        const clip = ClipShape.createShape(shape, zLow, zHigh, transform, isMask, invisible);
        if (!clip) return false;
        this._clips.push(clip);
        return true;
    }

    public pointInside(
        point: Point3d,
        onTolerance: number = Geometry.smallMetricDistanceSquared
    ): boolean {
        return this.isPointOnOrInside(point, onTolerance);
    }

    public isPointOnOrInside(
        point: Point3d,
        onTolerance: number = Geometry.smallMetricDistanceSquared
    ): boolean {
        if (!this.boundingRange.isNull && !this.boundingRange.containsPoint(point)) return false;

        for (const clip of this._clips) {
            if (!clip.pointInside(point, onTolerance)) return false;
        }
        return true;
    }

    private _clipNodeProxy?: BooleanClipNodeIntersection;
    private ensureProxyClipNode(): boolean {
        if (this._clipNodeProxy) return true;
        this._clipNodeProxy = new BooleanClipNodeIntersection(true);
        let numChildren = 0;
        for (const child of this._clips) {
            const q = child.fetchClipPlanesRef();
            if (q) {
                numChildren++;
                this._clipNodeProxy.captureChild(q);
            }
        }
        return numChildren > 0;
    }

    public announceClippedSegmentIntervals(
        f0: number,
        f1: number,
        pointA: Point3d,
        pointB: Point3d,
        announce?: AnnounceNumberNumber
    ): boolean {
        this.ensureProxyClipNode();
        if (this._clipNodeProxy) {
            return this._clipNodeProxy.announceClippedSegmentIntervals(
                f0,
                f1,
                pointA,
                pointB,
                announce
            );
        }
        return false;
    }

    public announceClippedArcIntervals(
        arc: Arc3d,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        this.ensureProxyClipNode();
        if (this._clipNodeProxy) {
            return this._clipNodeProxy.announceClippedArcIntervals(arc, announce);
        }
        return false;
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ) {
        this.ensureProxyClipNode();
        if (this._clipNodeProxy) {
            this._clipNodeProxy.appendPolygonClip(
                xyz,
                insideFragments,
                outsideFragments,
                arrayCache
            );
        }
    }

    public transformInPlace(transform: Transform): boolean {
        for (const clip of this._clips) {
            if (clip.transformInPlace(transform) === false) return false;
        }

        if (!this.boundingRange.isNull) {
            transform.multiplyRange(this.boundingRange, this.boundingRange);
        }

        return true;
    }

    public extractBoundaryLoops(loopPoints: Point3d[][], transform?: Transform): number[] {
        let clipM = ClipMaskXYZRangePlanes.None;
        let zBack = -Number.MAX_VALUE;
        let zFront = Number.MAX_VALUE;
        const retVal: number[] = [];
        let nLoops = 0;

        if (this._clips.length === 0) return retVal;
        let firstClipShape: ClipShape | undefined;
        const deltaTrans = Transform.createIdentity();

        for (const clip of this._clips) {
            if (clip instanceof ClipShape) {
                if (firstClipShape !== undefined && clip !== firstClipShape) {
                    let fwdTrans = Transform.createIdentity();
                    let invTrans = Transform.createIdentity();

                    if (firstClipShape.transformValid && clip.transformValid) {
                        fwdTrans = clip.transformFromClip!.clone();
                        invTrans = firstClipShape.transformToClip!.clone();
                    }
                    deltaTrans.setFrom(invTrans.multiplyTransformTransform(fwdTrans));
                }
                if (!firstClipShape) firstClipShape = clip;
                loopPoints[nLoops] = [];

                if (clip.polygon !== undefined) {
                    clipM = ClipMaskXYZRangePlanes.XAndY;

                    if (clip.zHighValid) {
                        clipM = clipM | ClipMaskXYZRangePlanes.ZHigh;
                        zFront = clip.zHigh!;
                    }
                    if (clip.zLowValid) {
                        clipM = clipM | ClipMaskXYZRangePlanes.ZLow;
                        zBack = clip.zLow!;
                    }

                    for (const point of clip.polygon) loopPoints[nLoops].push(point.clone());
                    deltaTrans.multiplyPoint3dArray(loopPoints[nLoops], loopPoints[nLoops]);
                    nLoops++;
                }
            }
        }
        retVal.push(clipM);
        retVal.push(zBack);
        retVal.push(zFront);
        if (transform && firstClipShape) transform.setFrom(firstClipShape.transformFromClip!);
        return retVal;
    }

    public setInvisible(invisible: boolean) {
        for (const clip of this._clips) clip.setInvisible(invisible);
    }

    public parseClipPlanes() {
        for (const clip of this._clips) clip.fetchClipPlanesRef();
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
        for (const clip of this._clips) clip.multiplyPlanesByMatrix4d(matrix, false, transpose);
        return true;
    }

    public classifyPointContainment(
        points: Point3d[],
        ignoreMasks: boolean = false
    ): ClipPlaneContainment {
        let currentContainment = ClipPlaneContainment.Ambiguous;

        for (const primitive of this._clips) {
            const thisContainment = primitive.classifyPointContainment(points, ignoreMasks);

            if (ClipPlaneContainment.Ambiguous === thisContainment) {
                return ClipPlaneContainment.Ambiguous;
            }

            if (ClipPlaneContainment.Ambiguous === currentContainment) {
                currentContainment = thisContainment;
            } else if (currentContainment !== thisContainment) {
                return ClipPlaneContainment.Ambiguous;
            }
        }
        return currentContainment;
    }

    public classifyRangeContainment(range: Range3d, ignoreMasks: boolean): ClipPlaneContainment {
        const corners: Point3d[] = range.corners();
        return this.classifyPointContainment(corners, ignoreMasks);
    }

    public isAnyLineStringPointInside(points: Point3d[]): boolean {
        for (const clip of this._clips) {
            const clipPlaneSet = clip.fetchClipPlanesRef();
            if (clipPlaneSet !== undefined) {
                for (let i = 0; i + 1 < points.length; i++) {
                    const segment = LineSegment3d.create(points[i], points[i + 1]);
                    if (clipPlaneSet.isAnyPointInOrOnFromSegment(segment)) return true;
                }
            }
        }
        return false;
    }

    public sumSizes(intervals: Segment1d[], begin: number, end: number): number {
        let s = 0.0;
        for (let i = begin; i < end; i++) s += intervals[i].x1 - intervals[i].x0;
        return s;
    }

    private static readonly _TARGET_FRACTION_SUM = 0.99999999;

    public isLineStringCompletelyContained(points: Point3d[]): boolean {
        const clipIntervals: Segment1d[] = [];

        for (let i = 0; i + 1 < points.length; i++) {
            const segment = LineSegment3d.create(points[i], points[i + 1]);
            let fractionSum = 0.0;
            let index0 = 0;

            for (const clip of this._clips) {
                const clipPlaneSet = clip.fetchClipPlanesRef();
                if (clipPlaneSet !== undefined) {
                    clipPlaneSet.appendIntervalsFromSegment(segment, clipIntervals);
                    const index1 = clipIntervals.length;
                    fractionSum += this.sumSizes(clipIntervals, index0, index1);
                    index0 = index1;
                    if (fractionSum >= ClipVector._TARGET_FRACTION_SUM) break;
                }
            }
            if (fractionSum < ClipVector._TARGET_FRACTION_SUM) return false;
        }
        return true;
    }

    public toCompactString(): string {
        function formatNumber(num: number) {
            return `${num.toString()}_`;
        }
        function formatVector3d(vec: Vector3d) {
            return `${formatNumber(vec.x)}${formatNumber(vec.y)}${formatNumber(vec.z)}`;
        }
        function formatFlags(flags: number) {
            const f = flags.toString();
            assert(f.length === 1);
            return f;
        }
        function formatPlane(plane: ClipPlane) {
            let flags = plane.invisible ? 1 : 0;
            flags |= plane.interior ? 2 : 0;
            return `${formatFlags(flags)}${formatVector3d(plane.inwardNormalRef)}${formatNumber(
                plane.distance
            )}`;
        }
        function formatPlaneSet(set: ConvexClipPlaneSet) {
            let planes = "";
            for (const plane of set.planes) planes = `${planes}${formatPlane(plane)}`;

            return `${planes}_`;
        }
        function formatPrimitive(prim: ClipPrimitive) {
            const flags = prim.invisible ? 1 : 0;
            let str = flags.toString();
            assert(str.length === 1);

            const union = prim.fetchClipPlanesRef();
            if (union) {
                for (const s of union.convexSets) str = `${str}${formatPlaneSet(s)}`;
            }
            return `${str}_`;
        }
        let result = "";
        for (const primitive of this.clips) result = `${result}${formatPrimitive(primitive)}`;
        return `${result}_`;
    }
}

export type StringifiedClipVector = ClipVector & { readonly clipString: string };

// eslint-disable-next-line @typescript-eslint/no-redeclare
export namespace StringifiedClipVector {
    // eslint-disable-line @typescript-eslint/no-redeclare
    export function fromClipVector(clip?: ClipVector): StringifiedClipVector | undefined {
        if (!clip || !clip.isValid) return undefined;

        const ret = clip as any;
        if (undefined === ret.clipString) ret.clipString = clip.toCompactString();

        const stringified = ret as StringifiedClipVector;
        assert(undefined !== stringified.clipString);
        return stringified;
    }
}
