/* Copyright (C) 2025 flywave.gl contributors */

import type { GeoCoordinates } from "@flywave/flywave-geoutils";

export enum BrushType {
    RAISE = "raise",
    LOWER = "lower",
    SMOOTH = "smooth",
    FLATTEN = "flatten",
    NOISE = "noise",
    ERODE = "erode"
}

export type BrushTexture = "circle" | "square" | "diamond" | "soft" | "custom";

export interface BaseBrushSettings {
    radius: number;
    hardness: number;
    texture?: BrushTexture;
}

export interface RaiseLowerSettings extends BaseBrushSettings {
    type: BrushType.RAISE | BrushType.LOWER;
    heightDelta: number;
}

export interface SmoothSettings extends BaseBrushSettings {
    type: BrushType.SMOOTH;
    strength: number;
}

export interface FlattenSettings extends BaseBrushSettings {
    type: BrushType.FLATTEN;
    targetAltitude: number;
}

export interface NoiseSettings extends BaseBrushSettings {
    type: BrushType.NOISE;
    strength: number;
    scale: number;
    persistence?: number;
}

export interface ErodeSettings extends BaseBrushSettings {
    type: BrushType.ERODE;
    strength: number;
}

export type BrushSettings =
    | RaiseLowerSettings
    | SmoothSettings
    | FlattenSettings
    | NoiseSettings
    | ErodeSettings;

export interface BrushOperation {
    position: GeoCoordinates;
    settings: BrushSettings;
}
