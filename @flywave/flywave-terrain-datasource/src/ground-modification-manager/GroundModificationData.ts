/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBoxArray,
    type GeoBoxJSON,
    type GeoPointLike,
    GeoBox,
    GeoCoordinates
} from "@flywave/flywave-geoutils";

import type { BrushOperation } from "./BrushTypes";

export type HeightOperationType = "replace" | "add" | "subtract" | "max" | "min";

export interface GroundModificationType {
    heightOperation: HeightOperationType;
}

export interface SerializedGroundModificationData {
    id: string;
    type: GroundModificationType;
    operations: SerializedBrushOperation[];
    boundingBox: GeoBoxArray;
}

export interface SerializedBrushOperation {
    position: GeoPointLike;
    settings: {
        type: string;
        size: number;
        strength: number;
        hardness: number;
        texture?: string;
        flattenTargetHeight?: number;
        noiseScale?: number;
        noisePersistence?: number;
    };
}

export interface GroundModificationData {
    id: string;
    type: GroundModificationType;
    operations: BrushOperation[];
    boundingBox: GeoBox;
}

export function serializeGroundModificationData(
    data: GroundModificationData
): SerializedGroundModificationData {
    return {
        id: data.id,
        type: data.type,
        operations: data.operations.map(op => ({
            position: op.position.toGeoPoint(),
            settings: {
                type: op.settings.type,
                size: op.settings.size,
                strength: op.settings.strength,
                hardness: op.settings.hardness,
                texture: op.settings.texture,
                flattenTargetHeight: op.settings.flattenTargetHeight,
                noiseScale: op.settings.noiseScale,
                noisePersistence: op.settings.noisePersistence
            }
        })),
        boundingBox: data.boundingBox.toArray()
    };
}

export function deserializeGroundModificationData(
    serialized: SerializedGroundModificationData
): GroundModificationData {
    return {
        id: serialized.id,
        type: serialized.type,
        operations: serialized.operations.map(op => ({
            position: GeoCoordinates.fromGeoPoint(op.position),
            settings: {
                type: op.settings.type as any,
                size: op.settings.size,
                strength: op.settings.strength,
                hardness: op.settings.hardness,
                texture: op.settings.texture as any,
                flattenTargetHeight: op.settings.flattenTargetHeight,
                noiseScale: op.settings.noiseScale,
                noisePersistence: op.settings.noisePersistence
            }
        })),
        boundingBox: GeoBox.fromArray(serialized.boundingBox)
    };
}
