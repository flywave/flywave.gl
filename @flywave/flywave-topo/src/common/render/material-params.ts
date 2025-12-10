/* Copyright (C) 2025 flywave.gl contributors */



import {
    type ColorDef,
    type NormalMapParams,
    type RenderTexture,
    type TextureMapping
} from "../../common";

export interface MaterialDiffuseProps {
    color?: ColorDef;
    weight?: number;
}

export interface MaterialSpecularProps {
    color?: ColorDef;
    weight?: number;
    exponent?: number;
}

export interface MaterialTextureMappingProps {
    texture: RenderTexture;
    normalMapParams?: NormalMapParams;
    mode?: TextureMapping.Mode;
    transform?: TextureMapping.Trans2x3;
    weight?: number;
    worldMapping?: boolean;
    useConstantLod?: boolean;
    constantLodProps?: TextureMapping.ConstantLodParamProps;
}

export interface MaterialParams {
    alpha?: number;
    diffuse?: MaterialDiffuseProps;
    specular?: MaterialSpecularProps;
    textureMapping?: MaterialTextureMappingProps;
}
