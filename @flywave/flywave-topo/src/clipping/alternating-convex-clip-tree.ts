/* Copyright (C) 2025 flywave.gl contributors */



import { BSplineCurve3d } from "../bspline/bspline-curve";
import { Arc3d } from "../curve/arc3d";
import { CurveCollection } from "../curve/curve-collection";
import { CurveLocationDetail, CurveLocationDetailPair } from "../curve/curve-location-detail";
import { CurvePrimitive } from "../curve/curve-primitive";
import { LineSegment3d } from "../curve/line-segment3d";
import { LineString3d } from "../curve/line-string3d";
import { Angle } from "../geometry3d/angle";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { Point3dArray } from "../geometry3d/point-helpers";
import { type Point3d, Vector3d } from "../geometry3d/point3d-vector3d";
import { PolygonOps } from "../geometry3d/polygon-ops";
import { Range1d } from "../geometry3d/range";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { Range1dArray } from "../numerics/range1d-array";
import { ClipPlane } from "./clip-plane";
import { type PolygonClipper, ClipUtilities } from "./clip-utils";
import { ConvexClipPlaneSet } from "./convex-clip-plane-set";

export class AlternatingCCTreeNode implements PolygonClipper {
    public points: Point3d[] = [];
    public planes: ConvexClipPlaneSet = ConvexClipPlaneSet.createEmpty();
    public children: AlternatingCCTreeNode[] = [];
    public startIdx: number = -1;
    public numPoints: number = -1;

    private constructor() {}

    public static createWithIndices(
        index0: number,
        numPoints: number,
        result?: AlternatingCCTreeNode
    ): AlternatingCCTreeNode {
        result = result ? result : new AlternatingCCTreeNode();
        result.startIdx = index0;
        result.numPoints = numPoints;
        result.children.length = 0;
        return result;
    }

    public static createTreeForPolygon(
        points: Point3d[],
        result?: AlternatingCCTreeNode
    ): AlternatingCCTreeNode {
        result = result ? result : new AlternatingCCTreeNode();
        result.empty();
        const builder = AlternatingCCTreeBuilder.createPointsRef(points);
        builder.buildHullTree(result);
        return result;
    }

    public static createHullAndInletsForPolygon(
        points: Point3d[],
        result?: AlternatingCCTreeNode
    ): AlternatingCCTreeNode {
        result = result ? result : new AlternatingCCTreeNode();
        result.empty();
        const builder = AlternatingCCTreeBuilder.createPointsRef(points);
        builder.buildHullAndInletsForPolygon(result);
        return result;
    }

    private extractLoopsGo(loops: Point3d[][]) {
        loops.push(Point3dArray.clonePoint3dArray(this.points));
        for (const c of this.children) c.extractLoopsGo(loops);
    }

    public extractLoops(): Point3d[][] {
        const loops: Point3d[][] = [];
        this.extractLoopsGo(loops);
        return loops;
    }

    public empty() {
        this.points.length = 0;
        this.planes.planes.length = 0;
        this.children.length = 0;
        this.startIdx = -1;
        this.numPoints = -1;
    }

    public clone(result?: AlternatingCCTreeNode): AlternatingCCTreeNode {
        result = result ? result : new AlternatingCCTreeNode();
        for (const point of this.points) result.points.push(point.clone());
        result.planes = ConvexClipPlaneSet.createEmpty();
        for (const plane of this.planes.planes) result.planes.planes.push(plane.clone());
        for (const node of this.children) result.children.push(node.clone());
        result.startIdx = this.startIdx;
        result.numPoints = this.numPoints;
        return result;
    }

    public addEmptyChild(index0: number, numPoints: number) {
        const newNode = AlternatingCCTreeNode.createWithIndices(index0, numPoints);
        this.children.push(newNode);
    }

    public addPlane(plane: ClipPlane) {
        this.planes.addPlaneToConvexSet(plane);
    }

    public isPointOnOrInside(point: Point3d): boolean {
        const inRoot = this.planes.isPointOnOrInside(point, 0.0);
        if (!inRoot) return false;
        for (const child of this.children) {
            if (child.isPointOnOrInside(point)) return false;
        }
        return true;
    }

    public captureConvexClipPlaneSetAsVoid(child: AlternatingCCTreeNode) {
        this.children.push(child);
    }

    public appendCurvePrimitiveClipIntervals(
        curve: CurvePrimitive,
        insideIntervals: CurveLocationDetailPair[],
        outsideIntervals: CurveLocationDetailPair[]
    ): void {
        const clipper = new AlternatingCCTreeNodeCurveClipper();
        clipper.appendSingleClipPrimitive(this, curve, insideIntervals, outsideIntervals);
    }

    public appendCurveCollectionClipIntervals(
        curves: CurveCollection,
        insideIntervals: CurveLocationDetailPair[],
        outsideIntervals: CurveLocationDetailPair[]
    ): void {
        const clipper = new AlternatingCCTreeNodeCurveClipper();
        clipper.appendCurveCollectionClip(this, curves, insideIntervals, outsideIntervals);
    }

    public appendPolygonClip(
        xyz: IndexedXYZCollection,
        insideFragments: GrowableXYZArray[],
        outsideFragments: GrowableXYZArray[],
        arrayCache: GrowableXYZArrayCache
    ): void {
        const oldOutsideCount = outsideFragments.length;
        const newInside = this.planes.clipInsidePushOutside(xyz, outsideFragments, arrayCache);
        if (newInside === undefined) {
            ClipUtilities.restoreSingletonInPlaceOfMultipleShards(
                outsideFragments,
                oldOutsideCount,
                xyz,
                arrayCache
            );
        } else {
            let carryForwardA = [newInside];
            let carryForwardB: GrowableXYZArray[] = [];
            let tempAB;
            let shard;
            for (const c of this.children) {
                carryForwardB.length = 0;
                while (undefined !== (shard = carryForwardA.pop())) {
                    c.appendPolygonClip(shard, outsideFragments, carryForwardB, arrayCache);
                    arrayCache.dropToCache(shard);
                }
                tempAB = carryForwardB;
                carryForwardB = carryForwardA;
                carryForwardA = tempAB;
            }
            while (undefined !== (shard = carryForwardA.pop())) {
                insideFragments.push(shard);
            }
        }
    }

    public depth(): number {
        const myDepth = 1;
        let maxChildDepth = 0;
        for (const c of this.children) {
            maxChildDepth = Math.max(maxChildDepth, c.depth());
        }
        return myDepth + maxChildDepth;
    }
}

export class AlternatingCCTreeBuilder {
    private _points: Point3d[] = [];
    private readonly _stack: number[] = [];

    private constructor() {}

    public static createPointsRef(
        points: Point3d[],
        result?: AlternatingCCTreeBuilder
    ): AlternatingCCTreeBuilder {
        result = result ? result : new AlternatingCCTreeBuilder();
        result._points = points;
        if (PolygonOps.areaXY(points) < 0.0) result._points.reverse();
        if (result._points[result._points.length - 1].isAlmostEqualMetric(result._points[0])) {
            result._points.pop();
        }
        return result;
    }

    public get period(): number {
        return this._points.length;
    }

    public indexAfter(i: number) {
        return (i + 1) % this._points.length;
    }

    public indexBefore(i: number) {
        return (i + this._points.length - 1) % this._points.length;
    }

    public pushIndex(primaryPointIndex: number) {
        this._stack.push(primaryPointIndex);
    }

    private static cross(pointA: Point3d, pointB: Point3d, pointC: Point3d): number {
        return pointA.crossProductToPointsXY(pointB, pointC);
    }

    public cyclicStackPoint(cyclicIndex: number): Point3d {
        let stackIndex: number;
        const stack = this._stack;
        if (cyclicIndex > 0) stackIndex = cyclicIndex;
        else stackIndex = cyclicIndex + 10 * stack.length;
        stackIndex = stackIndex % stack.length;
        return this._points[stack[stackIndex]];
    }

    public signFromStackTip(pointIndex: number, sign: number) {
        const pointA = this.cyclicStackPoint(-2);
        const pointB = this.cyclicStackPoint(-1);
        const pointC = this._points[pointIndex];
        return sign * AlternatingCCTreeBuilder.cross(pointA, pointB, pointC) >= 0.0 ? 1 : -1;
    }

    public get indexOfMaxX() {
        let k = 0;
        const points = this._points;
        const nPoints = this._points.length;
        for (let i = 1; i < nPoints; i++) {
            if (points[i].x > points[k].x) k = i;
        }
        return k;
    }

    public extendHullChain(k: number, sign: number, pushAfterPops: boolean) {
        while (this._stack.length > 1 && this.signFromStackTip(k, sign) < 0.0) this._stack.pop();
        if (pushAfterPops) this.pushIndex(k);
    }

    public collectHullChain(kStart: number, numK: number, sign: number) {
        this._stack.length = 0;
        if (numK > 2) {
            let k = kStart;
            for (let i = 0; i < numK; i++) {
                this.extendHullChain(k, sign, true);
                k = this.indexAfter(k);
            }
        }
    }

    public collectHullPointsInArray(
        points: Point3d[],
        kStart: number,
        numK: number,
        _sign: number
    ) {
        points.length = 0;
        if (numK > 2) {
            let k = kStart;
            for (let i = 0; i < numK; i++) {
                points.push(this._points[k]);
                k = this.indexAfter(k);
            }
        }
    }

    private buildHullTreeGo(
        root: AlternatingCCTreeNode,
        isPositiveArea: boolean,
        recurseToChildren: boolean = true
    ): boolean {
        this.collectHullChain(root.startIdx, root.numPoints, isPositiveArea ? 1.0 : -1.0);
        root.points.length = 0;
        const stack = this._stack;
        const points = this._points;
        const stackLen = stack.length;

        for (let i = 0; i < stackLen; i++) {
            const k0 = stack[i];
            root.points.push(points[k0]);
            if (i + 1 < stackLen) {
                let k1 = stack[i + 1];
                if (k1 === this.indexAfter(k0)) {
                    const plane = ClipPlane.createEdgeAndUpVector(
                        points[k0],
                        points[k1],
                        Vector3d.create(0, 0, 1),
                        Angle.createRadians(0)
                    );
                    if (plane !== undefined) {
                        if (isPositiveArea) plane.negateInPlace();
                        root.addPlane(plane);
                    }
                } else {
                    if (k1 < k0) k1 += this.period;
                    root.addEmptyChild(k0, k1 - k0 + 1);
                }
            }
        }
        if (recurseToChildren) {
            for (const child of root.children) this.buildHullTreeGo(child, !isPositiveArea);
        } else {
            for (const child of root.children) {
                this.collectHullPointsInArray(
                    child.points,
                    child.startIdx,
                    child.numPoints,
                    isPositiveArea ? -1.0 : 1.0
                );
            }
        }
        return true;
    }

    public buildHullAndInletsForPolygon(root: AlternatingCCTreeNode): boolean {
        AlternatingCCTreeNode.createWithIndices(this.indexOfMaxX, this.period + 1, root);
        return this.buildHullTreeGo(root, true, false);
    }

    public buildHullTree(root: AlternatingCCTreeNode): boolean {
        AlternatingCCTreeNode.createWithIndices(this.indexOfMaxX, this.period + 1, root);
        return this.buildHullTreeGo(root, true);
    }
}

export class AlternatingCCTreeNodeCurveClipper {
    private _curve: CurvePrimitive | undefined;
    private _intervalStack: Range1d[][];
    private _stackDepth: number;

    public constructor() {
        this._stackDepth = 0;
        this._intervalStack = [];
    }

    private setCurveRef(curve: CurvePrimitive) {
        this._curve = curve;
    }

    private popSegmentFrame() {
        if (this._stackDepth > 0) {
            this._topOfStack.length = 0;
            this._stackDepth -= 1;
        }
    }

    private clearSegmentStack() {
        while (this._stackDepth > 0) this.popSegmentFrame();
    }

    private pushEmptySegmentFrame() {
        this._stackDepth += 1;
        while (this._intervalStack.length < this._stackDepth) this._intervalStack.push([]);
        this._topOfStack.length = 0;
    }

    private get _topOfStack(): Range1d[] {
        return this._intervalStack[this._stackDepth - 1];
    }

    private set _topOfStack(value: Range1d[]) {
        const n = this._stackDepth;
        if (n > 0) this._intervalStack[n - 1] = value;
    }

    private stackEntry(numSkip: number): Range1d[] {
        if (numSkip <= this._stackDepth) return this._intervalStack[this._stackDepth - 1 - numSkip];
        else return [];
    }

    private isTopOfStackEmpty(): boolean {
        return this._topOfStack.length === 0;
    }

    private static readonly _fractionIntervals: number[] = [];
    private appendSingleClipToStack(
        planes: ConvexClipPlaneSet,
        insideSegments: Range1d[]
    ): boolean {
        const fractionIntervals = AlternatingCCTreeNodeCurveClipper._fractionIntervals;

        if (this._curve instanceof LineSegment3d) {
            const segment = this._curve;
            let f0: number;
            let f1: number;
            if (
                segment.announceClipIntervals(
                    planes,
                    (a0: number, a1: number, _cp: CurvePrimitive) => {
                        f0 = a0;
                        f1 = a1;
                    }
                )
            ) {
                insideSegments.push(Range1d.createXX(f0!, f1!));
            }
            return true;
        } else if (this._curve instanceof Arc3d) {
            const arc = this._curve;
            fractionIntervals.length = 0;
            arc.announceClipIntervals(planes, (a0: number, a1: number, _cp: CurvePrimitive) => {
                fractionIntervals.push(a0);
                fractionIntervals.push(a1);
            });
            for (let i = 0; i < fractionIntervals.length; i += 2) {
                insideSegments.push(
                    Range1d.createXX(fractionIntervals[i], fractionIntervals[i + 1])
                );
            }
            return true;
        } else if (this._curve instanceof LineString3d && this._curve.points.length > 1) {
            const linestring = this._curve;
            let f0: number;
            let f1: number;
            const nPoints = linestring.points.length;
            const df = 1.0 / (nPoints - 1);
            for (let i = 0; i < nPoints - 1; i++) {
                const segment = LineSegment3d.create(
                    linestring.points[i],
                    linestring.points[i + 1]
                );
                if (
                    segment.announceClipIntervals(
                        planes,
                        (a0: number, a1: number, _cp: CurvePrimitive) => {
                            f0 = a0;
                            f1 = a1;
                        }
                    )
                ) {
                    insideSegments.push(Range1d.createXX((i + f0!) * df, (i + f1!) * df));
                }
            }
            return true;
        } else if (this._curve instanceof BSplineCurve3d) {
            const bcurve = this._curve;
            fractionIntervals.length = 0;
            bcurve.announceClipIntervals(planes, (a0: number, a1: number, _cp: CurvePrimitive) => {
                fractionIntervals.push(a0);
                fractionIntervals.push(a1);
            });
            for (let i = 0; i < fractionIntervals.length; i += 2) {
                insideSegments.push(
                    Range1d.createXX(fractionIntervals[i], fractionIntervals[i + 1])
                );
            }
            return true;
        }

        return false;
    }

    private recurse(node: AlternatingCCTreeNode) {
        this.pushEmptySegmentFrame();
        this.appendSingleClipToStack(node.planes, this._topOfStack);
        Range1dArray.sort(this._topOfStack);
        if (this.isTopOfStackEmpty()) return;
        for (const child of node.children) {
            this.recurse(child);
            if (!this.isTopOfStackEmpty()) {
                const ranges = Range1dArray.differenceSorted(
                    this.stackEntry(1),
                    this.stackEntry(0)
                );
                this.popSegmentFrame();
                this._topOfStack = ranges;
            } else {
                this.popSegmentFrame();
            }
            if (this.isTopOfStackEmpty()) break;
        }
    }

    public appendSingleClipPrimitive(
        root: AlternatingCCTreeNode,
        curve: CurvePrimitive,
        insideIntervals: CurveLocationDetailPair[],
        _outsideIntervals: CurveLocationDetailPair[]
    ) {
        this.setCurveRef(curve);
        this.clearSegmentStack();
        this.recurse(root);
        if (this._stackDepth !== 1) return;
        const intervals = this._topOfStack;
        for (const interval of intervals) {
            const f0 = interval.low;
            const f1 = interval.high;
            const xyz0 = curve.fractionToPoint(f0);
            const xyz1 = curve.fractionToPoint(f1);
            insideIntervals.push(
                CurveLocationDetailPair.createCapture(
                    CurveLocationDetail.createCurveFractionPoint(curve, f0, xyz0),
                    CurveLocationDetail.createCurveFractionPoint(curve, f1, xyz1)
                )
            );
        }
        this.popSegmentFrame();
    }

    public appendCurveCollectionClip(
        root: AlternatingCCTreeNode,
        curve: CurveCollection,
        insideIntervals: CurveLocationDetailPair[],
        outsideIntervals: CurveLocationDetailPair[]
    ) {
        for (const cp of curve.children) {
            if (cp instanceof CurvePrimitive) {
                this.appendSingleClipPrimitive(root, cp, insideIntervals, outsideIntervals);
            } else if (cp instanceof CurveCollection) {
                this.appendCurveCollectionClip(root, cp, insideIntervals, outsideIntervals);
            }
        }
    }
}
