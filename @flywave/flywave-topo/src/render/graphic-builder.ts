/* Copyright (C) 2025 flywave.gl contributors */



import { type Object3D } from "three";

import {
    type AnalysisStyle,
    type ColorDef,
    type GeometryClass,
    Frustum,
    GraphicParams,
    LinePixels,
    Npc
} from "../common";
import {
    type AnyCurvePrimitive,
    type Arc3d,
    type Loop,
    type Point2d,
    type Point3d,
    type Polyface,
    type Range3d,
    type SolidPrimitive,
    Box,
    Path,
    Transform
} from "../core-geometry";
import { type Id64String } from "../utils";
import { type GraphicPrimitive } from "./graphic-primitive";

export enum GraphicType {
    ViewBackground,
    Scene,
    WorldDecoration,
    WorldOverlay,
    ViewOverlay
}

export interface BatchOptions {
    tileId?: string;
    noFlash?: boolean;
    noHilite?: boolean;
    noEmphasis?: boolean;
    locateOnly?: boolean;
}

export interface PickableGraphicOptions extends BatchOptions {
    id: Id64String;
    subCategoryId?: Id64String;
    geometryClass?: GeometryClass;
    modelId?: Id64String;
}

export interface GraphicBuilderOptions {
    type: GraphicType;
    placement?: Transform;
    pickable?: PickableGraphicOptions;
    preserveOrder?: boolean;
    wantNormals?: boolean;
    generateEdges?: boolean;
    viewIndependentOrigin?: Point3d;
}

export interface ViewportGraphicBuilderOptions extends GraphicBuilderOptions {
    applyAspectRatioSkew?: boolean;
    computeChordTolerance?: never;
}

export interface ComputeChordToleranceArgs {
    readonly graphic: GraphicBuilder;
    readonly computeRange: () => Range3d;
}

export interface CustomGraphicBuilderOptions extends GraphicBuilderOptions {
    computeChordTolerance: (args: ComputeChordToleranceArgs) => number;

    applyAspectRatioSkew?: never;
    viewport?: never;
}

export abstract class GraphicBuilder {
    public readonly placement: Transform;

    public readonly type: GraphicType;

    public readonly pickable?: Readonly<PickableGraphicOptions>;

    public readonly preserveOrder: boolean;

    public readonly wantNormals: boolean;

    public readonly wantEdges: boolean;

    public readonly analysisStyle?: AnalysisStyle;

    protected readonly _computeChordTolerance?: (args: ComputeChordToleranceArgs) => number;
    protected readonly _options: CustomGraphicBuilderOptions | ViewportGraphicBuilderOptions;

    protected constructor(options: ViewportGraphicBuilderOptions | CustomGraphicBuilderOptions) {
        this._options = options;

        this.placement = options.placement ?? Transform.createIdentity();
        this.type = options.type;
        this.pickable = options.pickable;
        this.wantEdges = options.generateEdges ?? this.type === GraphicType.Scene;
        this.wantNormals =
            options.wantNormals ?? (this.wantEdges || this.type === GraphicType.Scene);
        this.preserveOrder = options.preserveOrder ?? (this.isOverlay || this.isViewBackground);
        this._computeChordTolerance = options.computeChordTolerance;
    }

    public get pickId(): Id64String | undefined {
        return this.pickable?.id;
    }

    public get isViewCoordinates(): boolean {
        return this.type === GraphicType.ViewBackground || this.type === GraphicType.ViewOverlay;
    }

    public get isWorldCoordinates(): boolean {
        return !this.isViewCoordinates;
    }

    public get isSceneGraphic(): boolean {
        return this.type === GraphicType.Scene;
    }

    public get isViewBackground(): boolean {
        return this.type === GraphicType.ViewBackground;
    }

    public get isOverlay(): boolean {
        return this.type === GraphicType.ViewOverlay || this.type === GraphicType.WorldOverlay;
    }

    public abstract finish(): Object3D;

    public abstract activateGraphicParams(graphicParams: GraphicParams): void;

    public abstract addLineString(points: Point3d[]): void;

    public abstract addLineString2d(points: Point2d[], zDepth: number): void;

    public abstract addPointString(points: Point3d[]): void;

    public abstract addPointString2d(points: Point2d[], zDepth: number): void;

    public abstract addShape(points: Point3d[]): void;

    public abstract addShape2d(points: Point2d[], zDepth: number): void;

    public abstract addArc(arc: Arc3d, isEllipse: boolean, filled: boolean): void;

    public abstract addArc2d(
        ellipse: Arc3d,
        isEllipse: boolean,
        filled: boolean,
        zDepth: number
    ): void;

    public abstract addPath(path: Path): void;

    public abstract addLoop(loop: Loop): void;

    public addCurvePrimitive(curve: AnyCurvePrimitive): void {
        switch (curve.curvePrimitiveType) {
            case "lineString":
                this.addLineString(curve.points);
                break;
            case "lineSegment":
                this.addLineString([curve.startPoint(), curve.endPoint()]);
                break;
            case "arc":
                this.addArc(curve, false, false);
                break;
            default:
                const path = new Path();
                if (path.tryAddChild(curve)) this.addPath(path);

                break;
        }
    }

    public abstract addPolyface(meshData: Polyface, filled: boolean): void;

    public abstract addSolidPrimitive(solidPrimitive: SolidPrimitive): void;

    public addPrimitive(primitive: GraphicPrimitive): void {
        switch (primitive.type) {
            case "linestring":
                this.addLineString(primitive.points);
                break;
            case "linestring2d":
                this.addLineString2d(primitive.points, primitive.zDepth);
                break;
            case "pointstring":
                this.addPointString(primitive.points);
                break;
            case "pointstring2d":
                this.addPointString2d(primitive.points, primitive.zDepth);
                break;
            case "shape":
                this.addShape(primitive.points);
                break;
            case "shape2d":
                this.addShape2d(primitive.points, primitive.zDepth);
                break;
            case "arc":
                this.addArc(primitive.arc, primitive.isEllipse === true, primitive.filled === true);
                break;
            case "arc2d":
                this.addArc2d(
                    primitive.arc,
                    primitive.isEllipse === true,
                    primitive.filled === true,
                    primitive.zDepth
                );
                break;
            case "path":
                this.addPath(primitive.path);
                break;
            case "loop":
                this.addLoop(primitive.loop);
                break;
            case "polyface":
                this.addPolyface(primitive.polyface, primitive.filled === true);
                break;
            case "solidPrimitive":
                this.addSolidPrimitive(primitive.solidPrimitive);
                break;
        }
    }

    public addRangeBox(range: Range3d, solid = false): void {
        if (!solid) {
            this.addFrustum(Frustum.fromRange(range));
            return;
        }

        const box = Box.createRange(range, true);
        if (box) this.addSolidPrimitive(box);
    }

    public addFrustum(frustum: Frustum) {
        this.addRangeBoxFromCorners(frustum.points);
    }

    public addRangeBoxFromCorners(p: Point3d[]) {
        this.addLineString([
            p[Npc.LeftBottomFront],
            p[Npc.LeftTopFront],
            p[Npc.RightTopFront],
            p[Npc.RightBottomFront],
            p[Npc.RightBottomRear],
            p[Npc.RightTopRear],
            p[Npc.LeftTopRear],
            p[Npc.LeftBottomRear],
            p[Npc.LeftBottomFront].clone(),
            p[Npc.RightBottomFront].clone()
        ]);

        this.addLineString([p[Npc.LeftTopFront].clone(), p[Npc.LeftTopRear].clone()]);
        this.addLineString([p[Npc.RightTopFront].clone(), p[Npc.RightTopRear].clone()]);
        this.addLineString([p[Npc.LeftBottomRear].clone(), p[Npc.RightBottomRear].clone()]);
    }

    public setSymbology(
        lineColor: ColorDef,
        fillColor: ColorDef,
        lineWidth: number,
        linePixels = LinePixels.Solid
    ) {
        this.activateGraphicParams(
            GraphicParams.fromSymbology(lineColor, fillColor, lineWidth, linePixels)
        );
    }

    public setBlankingFill(fillColor: ColorDef) {
        this.activateGraphicParams(GraphicParams.fromBlankingFill(fillColor));
    }
}
