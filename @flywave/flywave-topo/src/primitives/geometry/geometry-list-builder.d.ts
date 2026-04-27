import { Object3D } from "three";
import { GraphicParams } from "../../common";
import { DisplayParams } from "../../common/render/primitives/display-params";
import { type Arc3d, type Point2d, type Polyface, type SolidPrimitive, Loop, Path, Point3d, Transform } from "../../core-geometry";
import { type CustomGraphicBuilderOptions, type ViewportGraphicBuilderOptions, GraphicBuilder } from "../../render/graphic-builder";
import { GeometryAccumulator } from "./geometry-accumulator";
import { type Geometry } from "./geometry-primitives";
export declare abstract class GeometryListBuilder extends GraphicBuilder {
    accum: GeometryAccumulator;
    readonly graphicParams: GraphicParams;
    abstract finishGraphic(accum: GeometryAccumulator): Object3D;
    constructor(options: ViewportGraphicBuilderOptions | CustomGraphicBuilderOptions, accumulatorTransform?: Transform);
    finish(): Object3D;
    activateGraphicParams(graphicParams: GraphicParams): void;
    addArc2d(ellipse: Arc3d, isEllipse: boolean, filled: boolean, zDepth: number): void;
    addArc(ellipse: Arc3d, isEllipse: boolean, filled: boolean): void;
    addLineString(points: Point3d[]): void;
    addLineString2d(points: Point2d[], zDepth: number): void;
    addPointString(points: Point3d[]): void;
    addPointString2d(points: Point2d[], zDepth: number): void;
    addShape(points: Point3d[]): void;
    addShape2d(points: Point2d[], zDepth: number): void;
    addPath(path: Path): void;
    addLoop(loop: Loop): void;
    addPolyface(meshData: Polyface): void;
    addSolidPrimitive(primitive: SolidPrimitive): void;
    getGraphicParams(): GraphicParams;
    getDisplayParams(type: DisplayParams.Type): DisplayParams;
    getMeshDisplayParams(): DisplayParams;
    getLinearDisplayParams(): DisplayParams;
    get textDisplayParams(): DisplayParams;
    add(geom: Geometry): void;
    private resolveGradient;
}
export declare class PrimitiveBuilder extends GeometryListBuilder {
    primitives: Object3D[];
    private _createGraphicGroup;
    finishGraphic(accum: GeometryAccumulator): Object3D;
    computeTolerance(accum: GeometryAccumulator): number;
}
