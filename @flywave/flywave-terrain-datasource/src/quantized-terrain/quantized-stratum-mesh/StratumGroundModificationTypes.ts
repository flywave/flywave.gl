/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBoxArray,
    type GeoBoxJSON,
    type GeoPointLike,
    GeoBox,
    GeoCoordinates
} from "@flywave/flywave-geoutils";

export enum StratumBrushType {
    RAISE = "raise",
    LOWER = "lower",
    SMOOTH = "smooth",
    FLATTEN = "flatten",
    NOISE = "noise",
    ERODE = "erode"
}

export type StratumBrushShape = "circle" | "square" | "diamond" | "soft";

export interface BaseStratumBrushSettings {
    radius: number;
    hardness: number;
    shape?: StratumBrushShape;
}

export interface StratumRaiseSettings extends BaseStratumBrushSettings {
    type: StratumBrushType.RAISE;
    heightDelta: number;
}

export interface StratumLowerSettings extends BaseStratumBrushSettings {
    type: StratumBrushType.LOWER;
    heightDelta: number;
}

export interface StratumSmoothSettings extends BaseStratumBrushSettings {
    type: StratumBrushType.SMOOTH;
    strength: number;
}

export interface StratumFlattenSettings extends BaseStratumBrushSettings {
    type: StratumBrushType.FLATTEN;
    targetAltitude: number;
}

export interface StratumNoiseSettings extends BaseStratumBrushSettings {
    type: StratumBrushType.NOISE;
    strength: number;
    scale: number;
    persistence?: number;
}

export interface StratumErodeSettings extends BaseStratumBrushSettings {
    type: StratumBrushType.ERODE;
    strength: number;
}

export type StratumBrushSettings =
    | StratumRaiseSettings
    | StratumLowerSettings
    | StratumSmoothSettings
    | StratumFlattenSettings
    | StratumNoiseSettings
    | StratumErodeSettings;

export interface StratumBrushOperation {
    position: GeoCoordinates;
    settings: StratumBrushSettings;
}

export interface StratumGroundModificationData {
    id: string;
    operations: StratumBrushOperation[];
    boundingBox: GeoBox;
}

export interface SerializedStratumBrushOperation {
    position: GeoPointLike;
    settings: {
        type: string;
        radius: number;
        hardness: number;
        shape?: string;
        heightDelta?: number;
        strength?: number;
        targetAltitude?: number;
        scale?: number;
        persistence?: number;
    };
}

export interface SerializedStratumGroundModificationData {
    id: string;
    operations: SerializedStratumBrushOperation[];
    boundingBox: GeoBoxArray;
}

export function serializeStratumBrushOperation(
    op: StratumBrushOperation
): SerializedStratumBrushOperation {
    return {
        position: op.position.toGeoPoint(),
        settings: { ...(op.settings as any) }
    };
}

export function deserializeStratumBrushOperation(
    serialized: SerializedStratumBrushOperation
): StratumBrushOperation {
    return {
        position: GeoCoordinates.fromGeoPoint(serialized.position),
        settings: serialized.settings as StratumBrushSettings
    };
}

export function serializeStratumGroundModificationData(
    data: StratumGroundModificationData
): SerializedStratumGroundModificationData {
    return {
        id: data.id,
        operations: data.operations.map(serializeStratumBrushOperation),
        boundingBox: data.boundingBox.toArray()
    };
}

export function deserializeStratumGroundModificationData(
    serialized: SerializedStratumGroundModificationData
): StratumGroundModificationData {
    return {
        id: serialized.id,
        operations: serialized.operations.map(deserializeStratumBrushOperation),
        boundingBox: GeoBox.fromArray(serialized.boundingBox)
    };
}
