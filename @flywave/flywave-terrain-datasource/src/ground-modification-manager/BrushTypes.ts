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

export interface BrushSettings {
    type: BrushType;
    size: number;
    strength: number;
    hardness: number;
    texture?: BrushTexture;
    flattenTargetHeight?: number;
    noiseScale?: number;
    noisePersistence?: number;
}

export interface BrushOperation {
    position: GeoCoordinates;
    settings: BrushSettings;
}
