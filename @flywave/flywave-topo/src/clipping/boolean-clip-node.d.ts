import { type Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumber, type AnnounceNumberNumberCurvePrimitive, type CurvePrimitive } from "../curve/curve-primitive";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { Range1d } from "../geometry3d/range";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { type Clipper, type PolygonClipper } from "./clip-utils";
export declare abstract class BooleanClipNode implements Clipper {
    protected _clippers: Clipper[];
    protected _intervalsA: Range1d[];
    protected _intervalsB: Range1d[];
    protected _keepInside: boolean;
    constructor(keepInside: boolean);
    protected abstract isPointOnOrInsideChildren(point: Point3d): boolean;
    protected abstract combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[];
    abstract get operationName(): string;
    toJSON(): any;
    captureChild(child: Clipper | Clipper[]): void;
    toggleResult(): boolean;
    selectResult(keepInside: boolean): boolean;
    protected testedAnnounceNN(a0: number, a1: number, announce?: AnnounceNumberNumber): number;
    protected testedAnnounceNNC(a0: number, a1: number, cp: CurvePrimitive, announce?: AnnounceNumberNumberCurvePrimitive): number;
    protected swapAB(): void;
    protected announcePartsNN(keepInside: boolean, intervals: Range1d[], f0: number, f1: number, announce?: AnnounceNumberNumber): boolean;
    protected announcePartsNNC(keepInside: boolean, intervals: Range1d[], f0: number, f1: number, cp: CurvePrimitive, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    isPointOnOrInside(point: Point3d): boolean;
    announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: AnnounceNumberNumber): boolean;
    announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
}
export declare class BooleanClipNodeUnion extends BooleanClipNode {
    get operationName(): string;
    constructor(keepInside: boolean);
    isPointOnOrInsideChildren(point: Point3d): boolean;
    combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[];
    appendPolygonClip(xyz: IndexedXYZCollection, insideFragments: GrowableXYZArray[], outsideFragments: GrowableXYZArray[], arrayCache: GrowableXYZArrayCache): void;
}
export declare class BooleanClipNodeParity extends BooleanClipNode {
    get operationName(): string;
    constructor(keepInside: boolean);
    isPointOnOrInsideChildren(point: Point3d): boolean;
    combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[];
    appendPolygonClip(xyz: IndexedXYZCollection, insideFragments: GrowableXYZArray[], outsideFragments: GrowableXYZArray[], arrayCache: GrowableXYZArrayCache): void;
}
export declare class BooleanClipNodeIntersection extends BooleanClipNode implements PolygonClipper {
    get operationName(): string;
    constructor(keepInside: boolean);
    isPointOnOrInsideChildren(point: Point3d): boolean;
    combineIntervals(operandA: Range1d[], operandB: Range1d[]): Range1d[];
    appendPolygonClip(xyz: IndexedXYZCollection, insideFragments: GrowableXYZArray[], outsideFragments: GrowableXYZArray[], arrayCache: GrowableXYZArrayCache): void;
}
