/* Copyright (C) 2025 flywave.gl contributors */

import { type Object3D } from "three";

export interface PostEffects {
    bloom?: IBloomEffect;
    outline?: IOutlineEffect;
    vignette?: IVignetteEffect;
    sepia?: ISepiaEffect;
    hueSaturation?: IHueSaturationEffect;
    brightnessContrast?: IBrightnessContrastEffect;
    fxaa?: boolean;
    smaa?: boolean;
    ssao?: ISSAOEffect; // Add SSAOEffect definition
    translucentDepth?: ITranslucentDepthEffect; // Add translucent depth effect definition
}

export interface IOutlineEffect {
    enabled: boolean;
    /**
     * Make the extruded polygon disappear.
     */
    ghostExtrudedPolygons: boolean;
    thickness: number;
    color: string;
}

export interface IBloomEffect {
    enabled: boolean;
    strength?: number; // corresponds to intensity in SelectiveBloomEffect
    radius?: number; // corresponds to mipmapBlurPass.radius
    levels?: number; // corresponds to mipmapBlurPass.levels
    ignoreBackground?: boolean;
    luminancePassEnabled?: boolean;
    luminancePassThreshold?: number; // corresponds to luminanceMaterial.threshold
    luminancePassSmoothing?: number; // corresponds to luminanceMaterial.smoothing

    selection?: Set<Object3D>;
}

export interface ISelectionEffect {
    enabled: boolean;
    color: string;
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
 

export interface ISMAAEffect {
    enabled: boolean;
}

// Add ISSAOEffect interface definition
export interface ISSAOEffect {
    enabled: boolean;
    intensity?: number;
    radius?: number;
    distanceThreshold?: number;
    distanceFalloff?: number;
    bias?: number;
    samples?: number;
    rings?: number;
    blurRadius?: number;
    blurStdDev?: number;
    blurDepthCutoff?: number;
}

// Add translucent depth effect interface definition
export interface ITranslucentDepthEffect {
    mixFactor?: number;
    blendMode?: "mix" | "add" | "multiply" | "screen";
}
