/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PostEffects {
    bloom?: IBloomEffect;
    outline?: IOutlineEffect;
    vignette?: IVignetteEffect;
    sepia?: ISepiaEffect;
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
    threshold?: number; // corresponds to luminanceMaterial.threshold
    levels?: number; // corresponds to mipmapBlurPass.levels
    smoothing?: number; // corresponds to luminanceMaterial.smoothing
    luminancePassEnabled?: boolean;
    luminancePassThreshold?: number; // corresponds to luminanceMaterial.threshold
    luminancePassSmoothing?: number; // corresponds to luminanceMaterial.smoothing
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

export interface IGodRaysEffect {
    enabled: boolean;
    samples?: number;
    density?: number;
    decay?: number;
    weight?: number;
    exposure?: number;
    clampMax?: number;
    blur?: boolean;
    resolutionScale?: number;
}
