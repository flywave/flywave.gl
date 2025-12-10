/* Copyright (C) 2025 flywave.gl contributors */



import { Group, Object3D } from "three";

import { type Gradient, type RenderTexture, GraphicParams } from "../../common";
import { DisplayParams } from "../../common/render/primitives/display-params";
import {
    type Arc3d,
    type CurvePrimitive,
    type IndexedPolyface,
    type Point2d,
    type Polyface,
    type SolidPrimitive,
    LineSegment3d,
    LineString3d,
    Loop,
    Path,
    Point3d,
    Transform
} from "../../core-geometry";
import {
    type CustomGraphicBuilderOptions,
    type ViewportGraphicBuilderOptions,
    GraphicBuilder
} from "../../render/graphic-builder";
import { GeometryOptions } from "../primitives";
import { GeometryAccumulator } from "./geometry-accumulator";
import { type Geometry } from "./geometry-primitives";

function copy2dTo3d(pts2d: Point2d[], depth: number): Point3d[] {
    const pts3d: Point3d[] = [];
    for (const point of pts2d) pts3d.push(Point3d.create(point.x, point.y, depth));
    return pts3d;
}

export abstract class GeometryListBuilder extends GraphicBuilder {
    public accum: GeometryAccumulator;
    public readonly graphicParams: GraphicParams = new GraphicParams();

    public abstract finishGraphic(accum: GeometryAccumulator): Object3D;

    public constructor(
        options: ViewportGraphicBuilderOptions | CustomGraphicBuilderOptions,
        accumulatorTransform = Transform.identity
    ) {
        super(options);
        this.accum = new GeometryAccumulator({
            transform: accumulatorTransform,
            analysisStyleDisplacement: this.analysisStyle?.displacement,
            viewIndependentOrigin: options.viewIndependentOrigin
        });
    }

    public finish(): Object3D {
        const graphic = this.finishGraphic(this.accum);
        this.accum.clear();
        return graphic;
    }

    public activateGraphicParams(graphicParams: GraphicParams): void {
        graphicParams.clone(this.graphicParams);
    }

    public addArc2d(ellipse: Arc3d, isEllipse: boolean, filled: boolean, zDepth: number): void {
        if (zDepth === 0.0) {
            this.addArc(ellipse, isEllipse, filled);
        } else {
            const ell: Arc3d = ellipse;
            ell.center.z = zDepth;
            this.addArc(ell, isEllipse, filled);
        }
    }

    public addArc(ellipse: Arc3d, isEllipse: boolean, filled: boolean): void {
        let curve;
        if (isEllipse || filled) {
            curve = Loop.create(ellipse);
        } else {
            curve = Path.create(ellipse);
        }

        if (filled && !isEllipse && !ellipse.sweep.isFullCircle) {
            const gapSegment: CurvePrimitive = LineSegment3d.create(
                ellipse.startPoint(),
                ellipse.endPoint()
            );
            (gapSegment as any).markerBits = 0x00010000;
            curve.children.push(gapSegment);
        }
        const displayParams = curve.isAnyRegionType
            ? this.getMeshDisplayParams()
            : this.getLinearDisplayParams();
        if (curve instanceof Loop) this.accum.addLoop(curve, displayParams, this.placement, false);
        else this.accum.addPath(curve, displayParams, this.placement, false);
    }

    public addLineString(points: Point3d[]): void {
        if (points.length === 2 && points[0].isAlmostEqual(points[1])) {
            this.accum.addPointString(points, this.getLinearDisplayParams(), this.placement);
        } else this.accum.addLineString(points, this.getLinearDisplayParams(), this.placement);
    }

    public addLineString2d(points: Point2d[], zDepth: number): void {
        const pts3d = copy2dTo3d(points, zDepth);
        this.addLineString(pts3d);
    }

    public addPointString(points: Point3d[]): void {
        this.accum.addPointString(points, this.getLinearDisplayParams(), this.placement);
    }

    public addPointString2d(points: Point2d[], zDepth: number): void {
        const pts3d = copy2dTo3d(points, zDepth);
        this.addPointString(pts3d);
    }

    public addShape(points: Point3d[]): void {
        const loop = Loop.create(LineString3d.create(points));
        this.accum.addLoop(loop, this.getMeshDisplayParams(), this.placement, false);
    }

    public addShape2d(points: Point2d[], zDepth: number): void {
        const pts3d = copy2dTo3d(points, zDepth);
        this.addShape(pts3d);
    }

    public addPath(path: Path): void {
        this.accum.addPath(path, this.getLinearDisplayParams(), this.placement, false);
    }

    public addLoop(loop: Loop): void {
        this.accum.addLoop(loop, this.getMeshDisplayParams(), this.placement, false);
    }

    public addPolyface(meshData: Polyface): void {
        this.accum.addPolyface(
            meshData as IndexedPolyface,
            this.getMeshDisplayParams(),
            this.placement
        );
    }

    public addSolidPrimitive(primitive: SolidPrimitive): void {
        this.accum.addSolidPrimitive(primitive, this.getMeshDisplayParams(), this.placement);
    }

    public getGraphicParams(): GraphicParams {
        return this.graphicParams;
    }

    public getDisplayParams(type: DisplayParams.Type): DisplayParams {
        return DisplayParams.createForType(type, this.graphicParams);
    }

    public getMeshDisplayParams(): DisplayParams {
        return DisplayParams.createForMesh(this.graphicParams, !this.wantNormals, grad =>
            this.resolveGradient(grad)
        );
    }

    public getLinearDisplayParams(): DisplayParams {
        return DisplayParams.createForLinear(this.graphicParams);
    }

    public get textDisplayParams(): DisplayParams {
        return DisplayParams.createForText(this.graphicParams);
    }

    public add(geom: Geometry): void {
        this.accum.addGeometry(geom);
    }

    private resolveGradient(gradient: Gradient.Symb): RenderTexture | undefined {
        return this.accum.getGradientTexture(gradient);
    }
}

export class PrimitiveBuilder extends GeometryListBuilder {
    public primitives: Object3D[] = [];

    private _createGraphicGroup(primitives: Object3D[]): Object3D {
        const group = new Group();
        group.add(...primitives);
        return group;
    }

    public finishGraphic(accum: GeometryAccumulator): Object3D {
        if (!accum.isEmpty) {
            const options = GeometryOptions.createForGraphicBuilder(this);
            const tolerance = this.computeTolerance(accum);
            accum.saveToGraphicList(this.primitives, options, tolerance);
        }

        if (this.primitives.length === 0) {
            return new Object3D();
        }

        const graphic =
            this.primitives.length > 1
                ? this._createGraphicGroup(this.primitives)
                : this.primitives[0];

        this.primitives.length = 0;
        return graphic ?? new Object3D();
    }

    public computeTolerance(accum: GeometryAccumulator): number {
        if (this._computeChordTolerance) {
            return this._computeChordTolerance({
                graphic: this,
                computeRange: () => accum.geometries.computeRange()
            });
        }
        return 0;
    }
}
