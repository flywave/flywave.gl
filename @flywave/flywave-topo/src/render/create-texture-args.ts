import { ImageSource, RenderTexture, TextureTransparency } from "../common";
import { TextureCacheKey, TextureImage } from "../common/render/texture-params";

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
