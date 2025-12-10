/* Copyright (C) 2025 flywave.gl contributors */



import { type Gradient, type ImageBuffer, type TextureTransparency } from "../../common";

export type TextureImageSource = HTMLImageElement | ImageBuffer | ImageBitmap;

export interface TextureImage {
    source: TextureImageSource;
    transparency?: TextureTransparency;
}

export type TextureCacheKey = string | Gradient.Symb;
