import { type Object3D } from "three";
import { type AnalysisStyle, type ColorDef, type GeometryClass, Frustum, GraphicParams, LinePixels } from "../common";
import { type AnyCurvePrimitive, type Arc3d, type Loop, type Point2d, type Point3d, type Polyface, type Range3d, type SolidPrimitive, Path, Transform } from "../core-geometry";
import { type Id64String } from "../utils";
import { type GraphicPrimitive } from "./graphic-primitive";
export declare enum GraphicType {
    ViewBackground = 0,
    Scene = 1,
    WorldDecoration = 2,
    WorldOverlay = 3,
    ViewOverlay = 4
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
export declare abstract class GraphicBuilder {
    readonly placement: Transform;
    readonly type: GraphicType;
    readonly pickable?: Readonly<PickableGraphicOptions>;
    readonly preserveOrder: boolean;
    readonly wantNormals: boolean;
    readonly wantEdges: boolean;
    readonly analysisStyle?: AnalysisStyle;
    protected readonly _computeChordTolerance?: (args: ComputeChordToleranceArgs) => number;
    protected readonly _options: CustomGraphicBuilderOptions | ViewportGraphicBuilderOptions;
    protected constructor(options: ViewportGraphicBuilderOptions | CustomGraphicBuilderOptions);
    get pickId(): Id64String | undefined;
    get isViewCoordinates(): boolean;
    get isWorldCoordinates(): boolean;
    get isSceneGraphic(): boolean;
    get isViewBackground(): boolean;
    get isOverlay(): boolean;
    abstract finish(): Object3D;
    abstract activateGraphicParams(graphicParams: GraphicParams): void;
    abstract addLineString(points: Point3d[]): void;
    abstract addLineString2d(points: Point2d[], zDepth: number): void;
    abstract addPointString(points: Point3d[]): void;
    abstract addPointString2d(points: Point2d[], zDepth: number): void;
    abstract addShape(points: Point3d[]): void;
    abstract addShape2d(points: Point2d[], zDepth: number): void;
    abstract addArc(arc: Arc3d, isEllipse: boolean, filled: boolean): void;
    abstract addArc2d(ellipse: Arc3d, isEllipse: boolean, filled: boolean, zDepth: number): void;
    abstract addPath(path: Path): void;
    abstract addLoop(loop: Loop): void;
    addCurvePrimitive(curve: AnyCurvePrimitive): void;
    abstract addPolyface(meshData: Polyface, filled: boolean): void;
    abstract addSolidPrimitive(solidPrimitive: SolidPrimitive): void;
    addPrimitive(primitive: GraphicPrimitive): void;
    addRangeBox(range: Range3d, solid?: boolean): void;
    addFrustum(frustum: Frustum): void;
    addRangeBoxFromCorners(p: Point3d[]): void;
    setSymbology(lineColor: ColorDef, fillColor: ColorDef, lineWidth: number, linePixels?: LinePixels): void;
    setBlankingFill(fillColor: ColorDef): void;
}
