/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Anti-aliasing mode. A single field selects the active AA strategy (they are
 * mutually exclusive): `"none"` disables AA, `"taa"` uses temporal AA,
 * `"smaa"` uses subpixel morphological AA.
 */
export type AntialiasingMode = "none" | "taa" | "smaa";

export interface PostEffects {
    bloom?: IBloomEffect;
    outline?: IOutlineEffect;
    vignette?: IVignetteEffect;
    sepia?: ISepiaEffect;
    hueSaturation?: IHueSaturationEffect;
    brightnessContrast?: IBrightnessContrastEffect;
    /**
     * Anti-aliasing strategy selector (mutually exclusive). Replaces the
     * legacy `taa?: boolean` field; `taa: true` is still accepted as a
     * deprecated alias for `antialiasing: "taa"`.
     */
    antialiasing?: AntialiasingMode;
    /** @deprecated Use `antialiasing: "taa"` instead. */
    taa?: boolean;
}

export interface IOutlineEffect {
    /**
     * @deprecated The selective outline is enabled at runtime via
     * `mapRenderingManager.addOutlineObject` / `removeOutlineObject`
     * (one outlined object is enough to turn it on). This field is ignored.
     */
    enabled: boolean;
    /** Stroke width in pixels (selection mask dilation radius). */
    thickness: number;
    color: string;
}

export interface IBloomEffect {
    enabled: boolean;
    strength?: number;
    radius?: number;
    luminancePassThreshold?: number;
}

export interface IVignetteEffect {
    enabled: boolean;
    offset: number;
    darkness: number;
}

export interface ISepiaEffect {
    enabled: boolean;
    amount: number;
}

export interface IHueSaturationEffect {
    enabled: boolean;
    hue: number;
    saturation: number;
}

export interface IBrightnessContrastEffect {
    enabled: boolean;
    brightness: number;
    contrast: number;
}

export interface ITranslucentLayerConfig {
    /** Blend factor (0-1) */
    mixFactor?: number;
    /** Blend mode */
    blendMode?: "mix" | "add" | "multiply" | "screen";
    /** Highlight color */
    color?: string;
    /** Occlusion distance threshold (in meters), effect is not displayed beyond this distance, default is 1.0 */
    occlusionDistance?: number;
    /** Whether to use original object color blending, default is true */
    useObjectColor?: boolean;
    /** Original color blending intensity (0-1), default is 0.5 */
    objectColorMix?: number;

    mode?: "normal" | "background";
}
