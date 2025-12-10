/* Copyright (C) 2025 flywave.gl contributors */



import { type ImageSource, type RenderTexture, type TextureTransparency } from "../common";
import { type TextureCacheKey, type TextureImage } from "../common/render/texture-params";

export interface TextureCacheOwnership {
    key: TextureCacheKey;
}

export type TextureOwnership = TextureCacheOwnership | "external";

export interface CreateTextureArgs {
    type?: RenderTexture.Type;
    image: TextureImage;
    ownership?: TextureOwnership;
}

export interface CreateTextureFromSourceArgs {
    type?: RenderTexture.Type;
    source: ImageSource;
    transparency?: TextureTransparency;
    ownership?: (TextureCacheOwnership & { key: string }) | "external";
}
