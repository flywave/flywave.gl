import { type Arc3d } from "../curve/arc3d";
import { type AnnounceNumberNumber, type AnnounceNumberNumberCurvePrimitive } from "../curve/curve-primitive";
import { Point3d } from "../geometry3d/point3d-vector3d";
import { type Range3d } from "../geometry3d/range";
import { Transform } from "../geometry3d/transform";
import { type TransformProps, type XYZProps } from "../geometry3d/xyz-props";
import { type Matrix4d } from "../geometry4d/matrix4d";
import { type Clipper, ClipPlaneContainment } from "./clip-utils";
import { ConvexClipPlaneSet } from "./convex-clip-plane-set";
import { type UnionOfConvexClipPlaneSetsProps, UnionOfConvexClipPlaneSets } from "./union-of-convex-clip-plane-sets";
export declare enum ClipMaskXYZRangePlanes {
    None = 0,
    XLow = 1,
    XHigh = 2,
    YLow = 4,
    YHigh = 8,
    ZLow = 16,
    ZHigh = 32,
    XAndY = 15,
    All = 63
}
export interface ClipPrimitivePlanesProps {
    planes?: {
        clips?: UnionOfConvexClipPlaneSetsProps;
        invisible?: boolean;
    };
}
export interface ClipPrimitiveShapeProps {
    shape?: {
        points?: XYZProps[];
        trans?: TransformProps;
        zlow?: number;
        zhigh?: number;
        mask?: boolean;
        invisible?: boolean;
    };
}
export type ClipPrimitiveProps = ClipPrimitivePlanesProps | ClipPrimitiveShapeProps;
export declare class ClipPrimitive implements Clipper {
    protected _clipPlanes?: UnionOfConvexClipPlaneSets;
    protected _invisible: boolean;
    fetchClipPlanesRef(): UnionOfConvexClipPlaneSets | undefined;
    get invisible(): boolean;
    protected constructor(planeSet?: UnionOfConvexClipPlaneSets | undefined, isInvisible?: boolean);
    static createCapture(planes: UnionOfConvexClipPlaneSets | ConvexClipPlaneSet | undefined, isInvisible?: boolean): ClipPrimitive;
    toJSON(): ClipPrimitiveProps;
    arePlanesDefined(): boolean;
    clone(): ClipPrimitive;
    ensurePlaneSets(): void;
    pointInside(point: Point3d, onTolerance?: number): boolean;
    isPointOnOrInside(point: Point3d, onTolerance?: number): boolean;
    announceClippedSegmentIntervals(f0: number, f1: number, pointA: Point3d, pointB: Point3d, announce?: AnnounceNumberNumber): boolean;
    announceClippedArcIntervals(arc: Arc3d, announce?: AnnounceNumberNumberCurvePrimitive): boolean;
    multiplyPlanesByMatrix4d(matrix: Matrix4d, invert?: boolean, transpose?: boolean): boolean;
    transformInPlace(transform: Transform): boolean;
    setInvisible(invisible: boolean): void;
    containsZClip(): boolean;
    classifyPointContainment(points: Point3d[], ignoreInvisibleSetting: boolean): ClipPlaneContainment;
    static fromJSON(json: ClipPrimitiveProps | undefined): ClipPrimitive | undefined;
    static fromJSONClipPrimitive(json: ClipPrimitivePlanesProps | undefined): ClipPrimitive | undefined;
}
export declare class ClipShape extends ClipPrimitive {
    protected _polygon: Point3d[];
    protected _zLow?: number;
    protected _zHigh?: number;
    protected _isMask: boolean;
    protected _transformFromClip?: Transform;
    protected _transformToClip?: Transform;
    protected constructor(polygon?: Point3d[], zLow?: number, zHigh?: number, transform?: Transform, isMask?: boolean, invisible?: boolean);
    get invisible(): boolean;
    get transformFromClip(): Transform | undefined;
    get transformToClip(): Transform | undefined;
    get transformValid(): boolean;
    get zLowValid(): boolean;
    get zHighValid(): boolean;
    get transformIsValid(): boolean;
    get zLow(): number | undefined;
    get zHigh(): number | undefined;
    get polygon(): Point3d[];
    get isMask(): boolean;
    setPolygon(polygon: Point3d[]): void;
    ensurePlaneSets(): void;
    initSecondaryProps(isMask: boolean, zLow?: number, zHigh?: number, transform?: Transform): void;
    toJSON(): ClipPrimitiveShapeProps;
    static fromClipShapeJSON(json: ClipPrimitiveShapeProps | undefined, result?: ClipShape): ClipShape | undefined;
    static createFrom(other: ClipShape, result?: ClipShape): ClipShape;
    static createShape(polygon?: Point3d[], zLow?: number, zHigh?: number, transform?: Transform, isMask?: boolean, invisible?: boolean, result?: ClipShape): ClipShape | undefined;
    static createBlock(extremities: Range3d, clipMask: ClipMaskXYZRangePlanes, isMask?: boolean, invisible?: boolean, transform?: Transform, result?: ClipShape): ClipShape;
    static createEmpty(isMask?: boolean, invisible?: boolean, transform?: Transform, result?: ClipShape): ClipShape;
    get isValidPolygon(): boolean;
    clone(result?: ClipShape): ClipShape;
    private parseClipPlanes;
    private parseLinearPlanes;
    private parseConvexPolygonPlanes;
    private parsePolygonPlanes;
    multiplyPlanesByMatrix4d(matrix: Matrix4d, invert?: boolean, transpose?: boolean): boolean;
    transformInPlace(transform: Transform): boolean;
    get isXYPolygon(): boolean;
    performTransformToClip(point: Point3d): void;
    performTransformFromClip(point: Point3d): void;
}
