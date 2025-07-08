import * as THREE from "three";

import {
    ColorDef,
    Frustum,
    RenderFeatureTable,
    RenderMaterial,
    RgbColorProps,
    TextureMapping
} from "../../common";
import { MeshParams } from "../../common/render/primitives/mesh-params";
import { PointStringParams } from "../../common/render/primitives/point-string-params";
import { PolylineParams } from "../../common/render/primitives/polyline-params";
import { ClipVector, Point3d, Range3d, Transform } from "../../core-geometry";
import { PrimitiveBuilder } from "../../primitives/geometry/geometry-list-builder";
import { PointCloudArgs } from "../../primitives/point-cloud-primitive";
import { assert, dispose, IDisposable } from "../../utils";
import { CreateRenderMaterialArgs } from "../create-render-material-args";
import { GraphicBranch, GraphicBranchOptions } from "../graphic-branch";
import {
    BatchOptions,
    CustomGraphicBuilderOptions,
    GraphicBuilder,
    ViewportGraphicBuilderOptions
} from "../graphic-builder";
import { InstancedGraphicParams, PatternGraphicParams } from "../instanced-graphic-params";
import { RenderClipVolume } from "../render-clip-volume";
import { RenderGraphic } from "../render-graphic";
import { PlanarGridProps, RenderAreaPattern, RenderGeometry, RenderSystem } from "../render-system";
import { ClipVolume } from "./clip-volume";
import { Batch, Branch, GraphicsArray } from "./graphic";
import { isInstancedGraphicParams, PatternBuffers } from "./instanced-geometry";
import { LineCode } from "./line-code";
import { Material } from "./material";
import { MeshGraphic, MeshRenderGeometry } from "./mesh";
import { PlanarGridGeometry } from "./planar-grid";
import { PointCloudGeometry } from "./point-cloud";
import { PointStringGeometry } from "./point-string";
import { PolylineGeometry } from "./polyline";
import { Primitive } from "./primitive";

/* eslint-disable no-restricted-syntax */

export const enum ContextState {
    Uninitialized,
    Success,
    Error
}

export type TextureBinding = WebGLTexture | undefined;

function getMaterialColor(color: ColorDef | RgbColorProps | undefined): ColorDef | undefined {
    if (color instanceof ColorDef) return color;

    return color ? ColorDef.from(color.r, color.g, color.b) : undefined;
}

export class System extends RenderSystem implements IDisposable {
    private _lineCodeTexture?: THREE.Texture;
    private _noiseTexture?: THREE.Texture;

    public get isValid(): boolean {
        return true;
    }

    public get lineCodeTexture() {
        return this._lineCodeTexture;
    }

    public get noiseTexture() {
        return this._noiseTexture;
    }

    public static create(optionsIn?: RenderSystem.Options): System {
        return new this(optionsIn!);
    }

    public dispose() {
        this._lineCodeTexture = dispose(this._lineCodeTexture);
        this._noiseTexture = dispose(this._noiseTexture);
    }

    public override onInitialized(): void {
        const noiseDim = 4;
        const noiseArr = new Uint8Array([
            152, 235, 94, 173, 219, 215, 115, 176, 73, 205, 43, 201, 10, 81, 205, 198
        ]);

        this._noiseTexture = new THREE.DataTexture(noiseArr, noiseDim, noiseDim);
        assert(undefined !== this._noiseTexture, "System.noiseTexture not created.");

        this._lineCodeTexture = new THREE.DataTexture(
            new Uint8Array(LineCode.lineCodeData),
            LineCode.size,
            LineCode.count
        );
        assert(undefined !== this._lineCodeTexture, "System.lineCodeTexture not created.");
    }

    public override createRenderGraphic(
        geometry: RenderGeometry,
        instances?: InstancedGraphicParams | RenderAreaPattern
    ): RenderGraphic | undefined {
        if (!(geometry instanceof MeshRenderGeometry)) {
            if (geometry instanceof PolylineGeometry || geometry instanceof PointStringGeometry) {
                return Primitive.create(geometry, instances);
            }

            assert(false, "Invalid RenderGeometry for System.createRenderGraphic");
            return undefined;
        }

        assert(
            !instances || instances instanceof PatternBuffers || isInstancedGraphicParams(instances)
        );
        return MeshGraphic.create(geometry);
    }

    public createBatch(
        graphic: RenderGraphic,
        features: RenderFeatureTable,
        range: Range3d,
        options?: BatchOptions
    ): RenderGraphic {
        return new Batch(graphic, features, range, options);
    }

    public createGraphicList(primitives: RenderGraphic[]): RenderGraphic {
        return new GraphicsArray(primitives);
    }

    public createGraphic(
        options: CustomGraphicBuilderOptions | ViewportGraphicBuilderOptions
    ): GraphicBuilder {
        return new PrimitiveBuilder(this, options);
    }

    public override createMeshGeometry(
        params: MeshParams,
        viOrigin?: Point3d
    ): MeshRenderGeometry | undefined {
        return MeshRenderGeometry.create(params, viOrigin);
    }

    public override createPolylineGeometry(
        params: PolylineParams,
        viOrigin?: Point3d
    ): PolylineGeometry | undefined {
        return PolylineGeometry.create(params, viOrigin);
    }

    public override createPlanarGrid(
        frustum: Frustum,
        grid: PlanarGridProps
    ): RenderGraphic | undefined {
        return PlanarGridGeometry.create(frustum, grid, this);
    }

    public override createPointStringGeometry(
        params: PointStringParams,
        viOrigin?: Point3d
    ): PointStringGeometry | undefined {
        return PointStringGeometry.create(params, viOrigin);
    }

    public override createPointCloud(args: PointCloudArgs): RenderGraphic | undefined {
        return Primitive.create(new PointCloudGeometry(args));
    }

    public createGraphicBranch(
        branch: GraphicBranch,
        transform: Transform,
        options?: GraphicBranchOptions
    ): RenderGraphic {
        return new Branch(branch, transform, undefined, options);
    }

    public override createAreaPattern(params: PatternGraphicParams): PatternBuffers | undefined {
        return PatternBuffers.create(params);
    }

    public override createRenderMaterial(
        args: CreateRenderMaterialArgs
    ): RenderMaterial | undefined {
        if (args.source) {
            const cached = this.findMaterial(args.source.id);
            if (cached) return cached;
        }

        const params = new RenderMaterial.Params();
        params.alpha = args.alpha;
        if (undefined !== args.diffuse?.weight) params.diffuse = args.diffuse.weight;

        params.diffuseColor = getMaterialColor(args.diffuse?.color);

        if (args.specular) {
            params.specularColor = getMaterialColor(args.specular?.color);
            if (undefined !== args.specular.weight) params.specular = args.specular.weight;

            if (undefined !== args.specular.exponent) {
                params.specularExponent = args.specular.exponent;
            }
        }

        if (args.textureMapping) {
            params.textureMapping = new TextureMapping(
                args.textureMapping.texture,
                new TextureMapping.Params({
                    textureMat2x3: args.textureMapping.transform,
                    mapMode: args.textureMapping.mode,
                    textureWeight: args.textureMapping.weight,
                    worldMapping: args.textureMapping.worldMapping,
                    useConstantLod: args.textureMapping.useConstantLod,
                    constantLodProps: args.textureMapping.constantLodProps
                })
            );
            params.textureMapping.normalMapParams = args.textureMapping.normalMapParams;
        }

        return new Material(params);
    }

    public override createClipVolume(clipVector: ClipVector): RenderClipVolume | undefined {
        return ClipVolume.create(clipVector);
    }

    protected constructor(options: RenderSystem.Options) {
        super(options);
    }
}
