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
    colorGradingLUT?: IColorGradingLUTEffect;
    fogLight?: IFogLightEffect;
    /** Screen-space reflections; reflective surfaces are tagged per object. */
    ssr?: ISSREffect;
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
    /** Stroke width in pixels (mask dilation radius). */
    thickness: number;
    /** Ring color for the visible part of the silhouette. */
    color: string;
    /**
     * X-ray mode: also outline the parts of the object hidden behind other
     * geometry. Defaults to `true`.
     */
    xray?: boolean;
    /**
     * Ring color for the occluded (hidden) part of the silhouette in X-ray
     * mode. Defaults to `color`. Set e.g. to a dimmer tone for the classic
     * "bright visible / dim hidden" look.
     */
    hiddenColor?: string;
    /**
     * Keep the outline mask pass in the node graph while nothing is selected
     * (default `true`): toggling selections stays a draw-time layer-bit
     * toggle — no pipeline rebuild, no flicker. The empty mask reads as "no
     * silhouette", so the idle effect is a visual no-op that only costs the
     * background redraw of the mask pass. Set `false` to tear the pass down
     * when the last outlined object is removed: idle scenes then pay nothing,
     * but every 0↔1 selection change recompiles the whole post-processing
     * chain — only worth it for rarely used, battery-sensitive highlights.
     */
    keepPassAlive?: boolean;
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

/**
 * 3D LUT color grading applied to the final tone-mapped image (after all
 * analytic grading effects like brightnessContrast/sepia). The LUT file is
 * loaded asynchronously; until it resolves a neutral LUT keeps the image
 * unchanged.
 */
export interface IColorGradingLUTEffect {
    enabled: boolean;
    /**
     * LUT file URL. Relative paths resolve through the MapView `uriResolver`
     * (built-in presets live under `resources/lut/`). Supported formats:
     * `.cube`, `.3dl`, and 2D strip images `.png` / `.jpg` / `.jpeg`.
     */
    url: string;
    /** Blend factor between the original and the graded color, 0-1. */
    opacity?: number;
}

/**
 * Volumetric light halos (lamp glow through haze) around point lights
 * registered at runtime via `mapView.addFogLight` / `removeFogLight`.
 * Deliberately NOT an environmental fog: scene haze stays owned by the
 * existing atmosphere / FogExp2 stack. The switch rebuilds the pipeline
 * once; adding/removing/moving lights only updates uniform slots.
 */
export interface IFogLightEffect {
    enabled: boolean;
    /** Global intensity multiplier on top of each light's own intensity. */
    intensity?: number;
    /**
     * Halo reach along the view ray (1/m). Higher = shorter, denser glow;
     * 0.002 ≈ glow saturating within a few hundred meters.
     */
    density?: number;
}

/**
 * Screen-space reflections (SSR). A single shared post-effect pass: any mesh
 * tagged reflective (via `mapRenderingManager.addReflectiveObject`) writes a
 * reflectivity mask into the scene pass MRT and the SSR pass reflects the
 * already-rendered frame onto those pixels — no second scene render.
 *
 * Reflective surfaces only pay for the pixels they cover on screen; the
 * screen-space method cannot reflect geometry that is off-screen (misses fade
 * the reflection out rather than producing artifacts).
 */
export interface ISSREffect {
    /** Toggling rebuilds the render pipeline once. */
    enabled: boolean;
    /**
     * Reflection pass resolution scale relative to the drawing buffer
     * (0.25–1). Lower is cheaper and blurrier. Defaults to 0.5.
     */
    resolutionScale?: number;
    /** Maximum ray march distance in meters. Defaults to 5000. */
    maxRayDistance?: number;
    /**
     * Binary-search refinement steps after the coarse march finds a crossing.
     * Defaults to 4.
     */
    binarySearchIterations?: number;
    /**
     * View-space thickness (meters) of the surface a ray may "pass through"
     * before a crossing counts as a hit — suppresses self-intersection on the
     * reflector itself. Defaults to 2.
     */
    thickness?: number;
    /**
     * Screen-space UV margin where reflections start fading out toward the
     * screen border (rays leaving the screen have no scene to reflect).
     * Defaults to 0.9.
     */
    edgeFade?: number;
    /**
     * Roughness beyond which reflections fade to zero. Reflective surfaces
     * tagged with roughness above this render without reflections. Defaults
     * to 0.6.
     */
    maxRoughness?: number;
    /**
     * Global reflection strength multiplier on top of each surface's own
     * reflectivity. Defaults to 1.
     */
    intensity?: number;
    /**
     * Debug visualization for the raymarch stage (0 = off):
     * 1 — R/G encode the sampled screen UV of the hit, B the hit weight;
     *     masked-but-missed pixels render dim green. Black = not tagged.
     * 2 — the unpacked view-space surface normal, remapped to RGB.
     */
    debug?: number;
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
