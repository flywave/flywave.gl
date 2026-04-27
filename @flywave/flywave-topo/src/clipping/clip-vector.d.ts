import { type Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumber, type AnnounceNumberNumberCurvePrimitive } from "../curve/curve-primitive";
import { type GrowableXYZArray } from "../geometry3d/growable-xyz-array";
import { type IndexedXYZCollection } from "../geometry3d/indexed-xyz-collection";
import { type Point3d } from "../geometry3d/point3d-vector3d";
import { Range3d } from "../geometry3d/range";
import { type GrowableXYZArrayCache } from "../geometry3d/reusable-object-cache";
import { type Segment1d } from "../geometry3d/segment1d";
import { Transform } from "../geometry3d/transform";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { type ClipPrimitiveProps, ClipPrimitive } from "./clip-primitive";
import { type Clipper, ClipPlaneContainment } from "./clip-utils";
export type ClipVectorProps = ClipPrimitiveProps[];
export declare class ClipVector implements Clipper {
    private _clips;
    boundingRange: Range3d;
    get clips(): ClipPrimitive[];
    private constructor();
    get isValid(): boolean;
    static createEmpty(result?: ClipVector): ClipVector;
    static createCapture(clips: ClipPrimitive[], result?: ClipVector): ClipVector;
    static create(clips: ClipPrimitive[], result?: ClipVector): ClipVector;
    clone(result?: ClipVector): ClipVector;
    toJSON(): ClipVectorProps;
    static fromJSON(json: ClipVectorProps | undefined, result?: ClipVector): ClipVector;
    clear(): void;
    appendClone(clip: ClipPrimitive): void;
    appendReference(clip: ClipPrimitive): void;
    appendShape(shape: Point3d[], zLow?: number, zHigh?: number, transform?: Transform, isMask?: boolean, invisible?: boolean): boolean;
    pointInside(point: Point3d, onTolerance?: number): boolean;
    isPointOnOrInside(point: Point3d, onTolerance?: number): boolean;
    private _clipNodeProxy?;
    private ensureProxyClipNode;
    announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: AnnounceNumberNumber): boolean;
    announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    appendPolygonClip(xyz: IndexedXYZCollection, insideFragments: GrowableXYZArray[], outsideFragments: GrowableXYZArray[], arrayCache: GrowableXYZArrayCache): void;
    transformInPlace(transform: Transform): boolean;
    extractBoundaryLoops(loopPoints: Point3d[][], transform?: Transform): number[];
    setInvisible(invisible: boolean): void;
    parseClipPlanes(): void;
    multiplyPlanesByMatrix4d(matrix: Matrix4d, invert?: boolean, transpose?: boolean): boolean;
    classifyPointContainment(points: Point3d[], ignoreMasks?: boolean): ClipPlaneContainment;
    classifyRangeContainment(range: Range3d, ignoreMasks: boolean): ClipPlaneContainment;
    isAnyLineStringPointInside(points: Point3d[]): boolean;
    sumSizes(intervals: Segment1d[], begin: number, end: number): number;
    private static readonly _TARGET_FRACTION_SUM;
    isLineStringCompletelyContained(points: Point3d[]): boolean;
    toCompactString(): string;
}
export type StringifiedClipVector = ClipVector & {
    readonly clipString: string;
};
export declare namespace StringifiedClipVector {
    function fromClipVector(clip?: ClipVector): StringifiedClipVector | undefined;
}
