/* Copyright (C) 2025 flywave.gl contributors */



import { type Arc3d } from "../curve/arc3d";
import {
    type AnnounceNumberNumber,
    type AnnounceNumberNumberCurvePrimitive,
    type CurvePrimitive
} from "../curve/curve-primitive";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { Range1d } from "../geometry3d/range";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { Range1dArray } from "../numerics/range1d-array";
import { type Clipper, type PolygonClipper, ClipStepAction, ClipUtilities } from "./clip-utils";

export abstract class BooleanClipNode implements Clipper {
    protected _clippers: Clipper[];
    protected _intervalsA: Range1d[];
    protected _intervalsB: Range1d[];
    protected _keepInside: boolean;

    public constructor(keepInside: boolean) {
        this._keepInside = keepInside;
        this._clippers = [];
        this._intervalsA = [];
        this._intervalsB = [];
    }
    protected abstract isPointOnOrInsideChildren(point: Point3d): boolean;
    protected abstract combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[];
    public abstract get operationName(): string;

    public toJSON(): any {
        const data = [];
        for (const c of this._clippers) {
            const c1 = c as any;
            if (c1.toJSON) data.push(c1.toJSON());
        }
        const s = this.operationName;
        const json: Record<string, any[]> = {};
        json[s] = data;
        return json;
    }

    public captureChild(child: Clipper | Clipper[]) {
        if (Array.isArray(child)) {
            for (const c of child) this.captureChild(c);
        } else {
            this._clippers.push(child);
        }
    }

    public toggleResult(): boolean {
        return this.selectResult(!this._keepInside);
    }

    public selectResult(keepInside: boolean): boolean {
        const s = this._keepInside;
        this._keepInside = keepInside;
        return s;
    }

    protected testedAnnounceNN(a0: number, a1: number, announce?: AnnounceNumberNumber): number {
        if (a0 < a1) {
            if (announce) announce(a0, a1);
            return 1;
        }
        return 0;
    }

    protected testedAnnounceNNC(
        a0: number,
        a1: number,
        cp: CurvePrimitive,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): number {
        if (a0 < a1) {
            if (announce) announce(a0, a1, cp);
            return 1;
        }
        return 0;
    }

    protected swapAB(): void {
        const q = this._intervalsA;
        this._intervalsA = this._intervalsB;
        this._intervalsB = q;
    }

    protected announcePartsNN(
        keepInside: boolean,
        intervals: Range1d[],
        f0: number,
        f1: number,
        announce?: AnnounceNumberNumber
    ): boolean {
        let numAnnounce = 0;
        if (!keepInside) {
            let lowFraction = f0;
            for (const interval of intervals) {
                numAnnounce += this.testedAnnounceNN(lowFraction, interval.low, announce);
                lowFraction = interval.high;
            }
            numAnnounce += this.testedAnnounceNN(lowFraction, f1, announce);
        } else {
            for (const interval of intervals) {
                numAnnounce += this.testedAnnounceNN(interval.low, interval.high, announce);
            }
        }
        return numAnnounce > 0;
    }

    protected announcePartsNNC(
        keepInside: boolean,
        intervals: Range1d[],
        f0: number,
        f1: number,
        cp: CurvePrimitive,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        let numAnnounce = 0;
        if (!keepInside) {
            let lowFraction = f0;
            for (const interval of intervals) {
                numAnnounce += this.testedAnnounceNNC(lowFraction, interval.low, cp, announce);
                lowFraction = interval.high;
            }
            numAnnounce += this.testedAnnounceNNC(lowFraction, f1, cp, announce);
        } else {
            for (const interval of intervals) {
                numAnnounce += this.testedAnnounceNNC(interval.low, interval.high, cp, announce);
            }
        }
        return numAnnounce > 0;
    }

    public isPointOnOrInside(point: Point3d): boolean {
        const q = this.isPointOnOrInsideChildren(point);
        return this._keepInside ? q : !q;
    }

    public announceClippedSegmentIntervals(
        f0: number,
        f1: number,
        pointA: Point3d,
        pointB: Point3d,
        announce?: AnnounceNumberNumber
    ): boolean {
        this._intervalsA.length = 0;
        const announceIntervalB = (a0: number, a1: number) => {
            this._intervalsB.push(Range1d.createXX(a0, a1));
        };

        let i = 0;
        for (const c of this._clippers) {
            this._intervalsB.length = 0;
            c.announceClippedSegmentIntervals(f0, f1, pointA, pointB, announceIntervalB);
            Range1dArray.simplifySortUnion(this._intervalsB);
            if (i === 0) {
                this.swapAB();
            } else {
                this._intervalsA = this.combineIntervals(this._intervalsA, this._intervalsB);
            }
            i++;
        }
        return this.announcePartsNN(this._keepInside, this._intervalsA, f0, f1, announce);
    }

    public announceClippedArcIntervals(
        arc: Arc3d,
        announce?: AnnounceNumberNumberCurvePrimitive
    ): boolean {
        this._intervalsA.length = 0;
        const announceIntervalB = (a0: number, a1: number) => {
            this._intervalsB.push(Range1d.createXX(a0, a1));
        };
        let i = 0;
        for (const c of this._clippers) {
            this._intervalsB.length = 0;
            c.announceClippedArcIntervals(arc, announceIntervalB);
            Range1dArray.simplifySortUnion(this._intervalsB);
            if (i === 0) {
                this.swapAB();
            } else {
                this._intervalsA = this.combineIntervals(this._intervalsA, this._intervalsB);
            }
            i++;
        }
        return this.announcePartsNNC(this._keepInside, this._intervalsA, 0, 1, arc, announce);
    }
}

export class BooleanClipNodeUnion extends BooleanClipNode {
    public get operationName(): string {
        return this._keepInside ? "OR" : "NOR";
    }

    public constructor(keepInside: boolean) {
        super(keepInside);
    }

    public isPointOnOrInsideChildren(point: Point3d): boolean {
        for (const clipper of this._clippers) {
            if (clipper.isPointOnOrInside(point)) return true;
        }
        return false;
    }

    public combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[] {
        return Range1dArray.unionSorted(operandA, operandB);
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ) {
        ClipUtilities.doPolygonClipSequence(
            xyz,
            this._clippers,
            this._keepInside ? insideFragments : outsideFragments,
            this._keepInside ? outsideFragments : insideFragments,
            undefined,
            ClipStepAction.acceptIn,
            ClipStepAction.passToNextStep,
            ClipStepAction.acceptOut,
            arrayCache
        );
    }
}

export class BooleanClipNodeParity extends BooleanClipNode {
    public get operationName(): string {
        return this._keepInside ? "XOR" : "NXOR";
    }

    public constructor(keepInside: boolean) {
        super(keepInside);
    }

    public isPointOnOrInsideChildren(point: Point3d): boolean {
        let q = false;
        for (const clipper of this._clippers) {
            if (clipper.isPointOnOrInside(point)) q = !q;
        }
        return q;
    }

    public combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[] {
        return Range1dArray.paritySorted(operandA, operandB);
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ) {
        ClipUtilities.doPolygonClipParitySequence(
            xyz,
            this._clippers,
            this._keepInside ? insideFragments : outsideFragments,
            this._keepInside ? outsideFragments : insideFragments,
            arrayCache
        );
    }
}

export class BooleanClipNodeIntersection extends BooleanClipNode implements PolygonClipper {
    public get operationName(): string {
        return this._keepInside ? "AND" : "NAND";
    }

    public constructor(keepInside: boolean) {
        super(keepInside);
    }

    public isPointOnOrInsideChildren(point: Point3d): boolean {
        for (const clipper of this._clippers) {
            if (!clipper.isPointOnOrInside(point)) return false;
        }
        return true;
    }

    public combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[] {
        return Range1dArray.intersectSorted(operandA, operandB);
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ) {
        ClipUtilities.doPolygonClipSequence(
            xyz,
            this._clippers,
            this._keepInside ? insideFragments : outsideFragments,
            this._keepInside ? outsideFragments : insideFragments,
            undefined,
            ClipStepAction.passToNextStep,
            ClipStepAction.acceptOut,
            ClipStepAction.acceptIn,
            arrayCache
        );
    }
}
