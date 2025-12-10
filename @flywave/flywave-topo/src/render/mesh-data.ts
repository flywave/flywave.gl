/* Copyright (C) 2025 flywave.gl contributors */



import { type FillFlags, LinePixels } from "../common";
import { type MeshParams } from "../common/render/primitives/mesh-params";
import { type SurfaceType } from "../common/render/primitives/surface-params";
import { type Point3d } from "../core-geometry";
import { type IDisposable, dispose } from "../utils";
import { LineCode } from "./line-code";
import { type MaterialInfo, createMaterialInfo } from "./material";
import { type Texture } from "./texture";
import { VertexLUT } from "./vertex-lut";

export class MeshData implements IDisposable {
    public readonly edgeWidth: number;
    public readonly hasFeatures: boolean;
    public readonly uniformFeatureId?: number;
    public readonly texture?: Texture;
    public readonly normalMap?: Texture;
    public readonly constantLodVParams?: Float32Array;
    public readonly constantLodFParams?: Float32Array;
    public readonly textureUsesConstantLod?: boolean;
    public readonly normalMapUsesConstantLod?: boolean;
    public readonly materialInfo?: MaterialInfo;
    public readonly type: SurfaceType;
    public readonly fillFlags: FillFlags;
    public readonly edgeLineCode: number;
    public readonly isPlanar: boolean;
    public readonly hasBakedLighting: boolean;
    public readonly lut: VertexLUT;
    public readonly viewIndependentOrigin?: Point3d;
    private readonly _textureAlwaysDisplayed: boolean;

    private constructor(lut: VertexLUT, params: MeshParams, viOrigin: Point3d | undefined) {
        this.lut = lut;
        this.viewIndependentOrigin = viOrigin;

        this.textureUsesConstantLod = false;
        this.normalMapUsesConstantLod = false;
        if (undefined !== params.surface.textureMapping) {
            this.texture = params.surface.textureMapping.texture as Texture;
            this._textureAlwaysDisplayed = params.surface.textureMapping.alwaysDisplayed;
        } else {
            this.texture = undefined;
            this._textureAlwaysDisplayed = false;
        }

        this.materialInfo = createMaterialInfo(params.surface.material);

        this.type = params.surface.type;
        this.fillFlags = params.surface.fillFlags;
        this.isPlanar = params.isPlanar;
        this.hasBakedLighting = params.surface.hasBakedLighting;
        const edges = params.edges;
        this.edgeWidth = undefined !== edges ? edges.weight : 1;
        this.edgeLineCode = LineCode.valueFromLinePixels(
            undefined !== edges ? edges.linePixels : LinePixels.Solid
        );
    }

    public static create(params: MeshParams, viOrigin: Point3d | undefined): MeshData | undefined {
        const lut = VertexLUT.createFromVertexTable(params.vertices, params.auxChannels);
        return undefined !== lut ? new MeshData(lut, params, viOrigin) : undefined;
    }

    public dispose() {
        dispose(this.lut);
        if (this._ownsTexture) this.texture!.dispose();
    }

    public get isGlyph() {
        return undefined !== this.texture && this.texture.isGlyph;
    }

    public get isTextureAlwaysDisplayed() {
        return this.isGlyph || this._textureAlwaysDisplayed;
    }

    private get _ownsTexture(): boolean {
        return undefined !== this.texture && !this.texture?.hasOwner;
    }
}
