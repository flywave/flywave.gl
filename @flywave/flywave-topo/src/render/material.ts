/* Copyright (C) 2025 flywave.gl contributors */



import { ColorDef, RenderMaterial } from "../common";
import {
    type SurfaceMaterial,
    type SurfaceMaterialAtlas
} from "../common/render/primitives/surface-params";
import { FloatRgb } from "./float-rgba";

export class Material extends RenderMaterial {
    public static readonly default: Material = new Material(RenderMaterial.Params.defaults);

    public readonly isAtlas = false as const;
    public readonly fragUniforms = new Float32Array(4);
    public readonly rgba = new Float32Array(4);

    public get overridesRgb() {
        return this.rgba[0] >= 0;
    }

    public get overridesAlpha() {
        return this.rgba[3] >= 0;
    }

    public get hasTranslucency() {
        return this.overridesAlpha && this.rgba[3] < 1;
    }

    public constructor(params: RenderMaterial.Params) {
        super(params);

        if (undefined !== params.diffuseColor) {
            const rgb = FloatRgb.fromColorDef(params.diffuseColor);
            this.rgba[0] = rgb.red;
            this.rgba[1] = rgb.green;
            this.rgba[2] = rgb.blue;
        } else {
            this.rgba[0] = this.rgba[1] = this.rgba[2] = -1;
        }

        const alpha = undefined !== params.alpha ? params.alpha : -1;
        this.rgba[3] = alpha;

        const scale = (value: number) => Math.floor(value * 255 + 0.5);
        this.setInteger(scale(params.diffuse), scale(params.specular), 0);

        const textureWeight =
            undefined !== this.textureMapping ? this.textureMapping.params.weight : 1.0;
        const specularRgb =
            undefined !== params.specularColor ? params.specularColor : ColorDef.white;
        const specularColors = specularRgb.colors;
        this.setInteger(scale(textureWeight), specularColors.r, 1);
        this.setInteger(specularColors.g, specularColors.b, 2);

        this.fragUniforms[3] = params.specularExponent;
    }

    private setInteger(loByte: number, hiByte: number, index: number): void {
        const clamp = (x: number) => Math.floor(Math.min(255, Math.max(x, 0)));

        loByte = clamp(loByte);
        hiByte = clamp(hiByte);

        this.fragUniforms[index] = loByte + hiByte * 256;
    }
}

Object.freeze(Material.default);

export type MaterialInfo = Material | SurfaceMaterialAtlas;

export function createMaterialInfo(source: SurfaceMaterial | undefined): MaterialInfo | undefined {
    if (undefined === source) return undefined;
    else if (source.isAtlas) return source;
}
