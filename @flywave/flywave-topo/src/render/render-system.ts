import {
    ColorDef,
    Frustum,
    Gradient,
    ImageBuffer,
    ImageBufferFormat,
    ImageSource,
    ImageSourceFormat,
    RenderFeatureTable,
    RenderMaterial,
    RenderTexture,
    TextureTransparency
} from "../common";
import { MeshParams } from "../common/render/primitives/mesh-params";
import { PointStringParams } from "../common/render/primitives/point-string-params";
import { PolylineParams } from "../common/render/primitives/polyline-params";
import { TextureCacheKey } from "../common/render/texture-params";
import {  Matrix3d, Point3d, Range3d, Transform, XAndY } from "../core-geometry";
import { MeshArgs, PolylineArgs } from "../primitives/mesh/mesh-primitives";
import { PointCloudArgs } from "../primitives/point-cloud-primitive";
import { createPointStringParams } from "../primitives/point-string-params";
import { createPolylineParams } from "../primitives/polyline-params";
import { createMeshParams } from "../primitives/vertex-table-builder";
import { Id64String, IDisposable } from "../utils";
import {
    BatchOptions,
    CustomGraphicBuilderOptions,
    GraphicBuilder,
    ViewportGraphicBuilderOptions
} from "./graphic-builder";
import { RenderGraphic } from "./render-graphic";

export abstract class RenderSystem implements IDisposable {
    public readonly options: RenderSystem.Options;

    protected constructor(options?: RenderSystem.Options) {
        this.options = undefined !== options ? options : {};
        Object.freeze(this.options);
    }

    public abstract get isValid(): boolean;

    public abstract dispose(): void;

    public findMaterial(_key: string): RenderMaterial | undefined {
        return undefined;
    }

    public createMaterial(_params: RenderMaterial.Params): RenderMaterial | undefined {
        return undefined;
    }

    public createRenderMaterial(_args: CreateRenderMaterialArgs): RenderMaterial | undefined {
        return undefined;
    }

    public createTriMesh(
        args: MeshArgs,
        instances?: InstancedGraphicParams
    ): RenderGraphic | undefined;

    public createTriMesh(
        args: MeshArgs,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined; // eslint-disable-line @typescript-eslint/unified-signatures

    public createTriMesh(
        args: MeshArgs,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined {
        const params = createMeshParams(args, this.maxTextureSize);
        return this.createMesh(params, instances);
    }

    public createIndexedPolylines(
        args: PolylineArgs,
        instances?: InstancedGraphicParams
    ): RenderGraphic | undefined;

    public createIndexedPolylines(
        args: PolylineArgs,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined; // eslint-disable-line @typescript-eslint/unified-signatures

    public createIndexedPolylines(
        args: PolylineArgs,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined {
        if (args.flags.isDisjoint) {
            const pointStringParams = createPointStringParams(args);
            return undefined !== pointStringParams
                ? this.createPointString(pointStringParams, instances)
                : undefined;
        } else {
            const polylineParams = createPolylineParams(args);
            return undefined !== polylineParams
                ? this.createPolyline(polylineParams, instances)
                : undefined;
        }
    }

    public abstract createGraphic(
        options: CustomGraphicBuilderOptions | ViewportGraphicBuilderOptions
    ): GraphicBuilder;

    public abstract createGraphicList(primitives: RenderGraphic[]): RenderGraphic;

    public createMeshGeometry(
        _params: MeshParams,
        _viewIndependentOrigin?: Point3d
    ): RenderGeometry | undefined {
        return undefined;
    }

    public createPolylineGeometry(
        _params: PolylineParams,
        _viewIndependentOrigin?: Point3d
    ): RenderGeometry | undefined {
        return undefined;
    }

    public createPointStringGeometry(
        _params: PointStringParams,
        _viewIndependentOrigin?: Point3d
    ): RenderGeometry | undefined {
        return undefined;
    }

    public createAreaPattern(_params: PatternGraphicParams): RenderAreaPattern | undefined {
        return undefined;
    }

    public createMesh(
        params: MeshParams,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined {
        return this.createGraphicFromGeometry(
            viOrigin => this.createMeshGeometry(params, viOrigin),
            instances
        );
    }

    public createPolyline(
        params: PolylineParams,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined {
        return this.createGraphicFromGeometry(
            origin => this.createPolylineGeometry(params, origin),
            instances
        );
    }

    public createPointString(
        params: PointStringParams,
        instances?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined {
        return this.createGraphicFromGeometry(
            origin => this.createPointStringGeometry(params, origin),
            instances
        );
    }

    public abstract createRenderGraphic(
        _geometry: RenderGeometry,
        instances?: InstancedGraphicParams | RenderAreaPattern
    ): RenderGraphic | undefined;

    private createGraphicFromGeometry(
        createGeometry: (viewIndependentOrigin?: Point3d) => RenderGeometry | undefined,
        instancesOrOrigin?: InstancedGraphicParams | RenderAreaPattern | Point3d
    ): RenderGraphic | undefined {
        let viOrigin;
        let instances;
        if (instancesOrOrigin instanceof Point3d) viOrigin = instancesOrOrigin;
        else instances = instancesOrOrigin;

        const geom = createGeometry(viOrigin);
        return geom ? this.createRenderGraphic(geom, instances) : undefined;
    }

    public createBranch(branch: GraphicBranch, transform: Transform): RenderGraphic {
        return this.createGraphicBranch(branch, transform);
    }
    public abstract createGraphicBranch(
        branch: GraphicBranch,
        transform: Transform,
        options?: GraphicBranchOptions
    ): RenderGraphic;

    public createPointCloud(_args: PointCloudArgs): RenderGraphic | undefined {
        return undefined;
    }
    public createPlanarGrid(_frustum: Frustum, _grid: PlanarGridProps): RenderGraphic | undefined {
        return undefined;
    }

    public createGraphicOwner(ownedGraphic: RenderGraphic): RenderGraphicOwner {
        return new GraphicOwner(ownedGraphic);
    }

    public abstract createBatch(
        graphic: RenderGraphic,
        features: RenderFeatureTable,
        range: Range3d,
        options?: BatchOptions
    ): RenderGraphic;

    public findTexture(_key: TextureCacheKey): RenderTexture | undefined {
        return undefined;
    }

    public async loadTexture(
        id: Id64String,
        image?: { image: HTMLImageElement; format: ImageSourceFormat }
    ): Promise<RenderTexture | undefined> {
        let texture = this.findTexture(id.toString());
        if (undefined === texture) {
            if (undefined !== image) {
                texture = this.createTexture({
                    type: RenderTexture.Type.Normal,
                    ownership: { key: id },
                    image: {
                        source: image.image,
                        transparency:
                            ImageSourceFormat.Png === image.format
                                ? TextureTransparency.Mixed
                                : TextureTransparency.Opaque
                    }
                });
            }
        }

        return texture;
    }

    public createTextureFromImageBuffer(
        image: ImageBuffer,
        params: RenderTexture.Params
    ): RenderTexture | undefined {
        const ownership = params.key
            ? { key: params.key }
            : params.isOwned
            ? "external"
            : undefined;
        return this.createTexture({
            type: params.type,
            ownership,
            image: {
                source: image,
                transparency:
                    ImageBufferFormat.Rgba === image.format
                        ? TextureTransparency.Mixed
                        : TextureTransparency.Opaque
            }
        });
    }

    public createTextureFromImage(
        image: HTMLImageElement,
        hasAlpha: boolean | undefined,
        params: RenderTexture.Params
    ): RenderTexture | undefined {
        const ownership = params.isOwned ? "external" : undefined;
        return this.createTexture({
            type: params.type,
            ownership,
            image: {
                source: image,
                transparency: hasAlpha ? TextureTransparency.Mixed : TextureTransparency.Opaque
            }
        });
    }

    public async createTextureFromImageSource(
        source: ImageSource,
        params: RenderTexture.Params
    ): Promise<RenderTexture | undefined> {
        const ownership = params.isOwned ? "external" : undefined;
        return await this.createTextureFromSource({
            type: params.type,
            source,
            ownership,
            transparency:
                source.format === ImageSourceFormat.Jpeg
                    ? TextureTransparency.Opaque
                    : TextureTransparency.Mixed
        });
    }

    public async createTextureFromSource(
        args: CreateTextureFromSourceArgs
    ): Promise<RenderTexture | undefined> {
        try {
            const transparency =
                ImageSourceFormat.Jpeg === args.source.format
                    ? TextureTransparency.Opaque
                    : args.transparency ?? TextureTransparency.Mixed;
            const image = await imageElementFromImageSource(args.source);

            return this.createTexture({
                type: args.type,
                ownership: args.ownership,
                image: {
                    source: image,
                    transparency
                }
            });
        } catch {
            return undefined;
        }
    }

    public createTextureFromElement(
        _id: Id64String,
        _params: RenderTexture.Params,
        _format: ImageSourceFormat
    ): RenderTexture | undefined {
        return undefined;
    }

    public getGradientTexture(_symb: Gradient.Symb): RenderTexture | undefined {
        return undefined;
    }

    public createTexture(_args: CreateTextureArgs): RenderTexture | undefined {
        return undefined;
    }

    public onInitialized(): void {}

    public get supportsLogZBuffer(): boolean {
        return this.options.logarithmicDepthBuffer !== false;
    }
}

export namespace RenderSystem {
    // eslint-disable-line no-redeclare

    export interface Options {
        preserveShaderSourceCode?: boolean;
        displaySolarShadows?: boolean;
        logarithmicDepthBuffer?: boolean;
        dpiAwareViewports?: boolean;
        devicePixelRatioOverride?: number;
        dpiAwareLOD?: boolean;
        useWebGL2?: boolean;
        planProjections?: boolean;
        doIdleWork?: boolean;
        contextAttributes?: WebGLContextAttributes;
        errorOnMissingUniform?: boolean;
        debugShaders?: boolean;
        antialiasSamples?: number;
    }
}
