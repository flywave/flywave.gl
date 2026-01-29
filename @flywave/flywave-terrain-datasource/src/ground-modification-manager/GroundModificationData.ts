/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBoxArray,
    type GeoBoxJSON,
    type GeoPointLike,
    GeoBox,
    GeoCoordinates
} from "@flywave/flywave-geoutils";

import { BrushType, type BrushOperation, type BrushSettings } from "./BrushTypes";

export interface SerializedGroundModificationData {
    id: string;
    operations: SerializedBrushOperation[];
    boundingBox: GeoBoxArray;
}

export interface SerializedBrushOperation {
    position: GeoPointLike;
    settings: {
        type: string;
        radius: number;
        hardness: number;
        texture?: string;
        heightDelta?: number;
        strength?: number;
        targetAltitude?: number;
        scale?: number;
        persistence?: number;
    };
}

export interface GroundModificationData {
    id: string;
    operations: BrushOperation[];
    boundingBox: GeoBox;
}

function serializeBrushSettings(settings: BrushSettings): SerializedBrushOperation["settings"] {
    const base: SerializedBrushOperation["settings"] = {
        type: settings.type,
        radius: settings.radius,
        hardness: settings.hardness,
        texture: settings.texture
    };

    if (settings.type === BrushType.RAISE || settings.type === BrushType.LOWER) {
        return { ...base, heightDelta: settings.heightDelta };
    } else if (settings.type === BrushType.SMOOTH) {
        return { ...base, strength: settings.strength };
    } else if (settings.type === BrushType.FLATTEN) {
        return { ...base, targetAltitude: settings.targetAltitude };
    } else if (settings.type === BrushType.NOISE) {
        return {
            ...base,
            strength: settings.strength,
            scale: settings.scale,
            persistence: settings.persistence
        };
    } else if (settings.type === BrushType.ERODE) {
        return { ...base, strength: settings.strength };
    }

    return base;
}

function deserializeBrushSettings(serialized: SerializedBrushOperation["settings"]): BrushSettings {
    const base = {
        radius: serialized.radius,
        hardness: serialized.hardness,
        texture: serialized.texture as any
    };

    if (serialized.type === "raise") {
        return { ...base, type: BrushType.RAISE, heightDelta: serialized.heightDelta! };
    } else if (serialized.type === "lower") {
        return { ...base, type: BrushType.LOWER, heightDelta: serialized.heightDelta! };
    } else if (serialized.type === "smooth") {
        return { ...base, type: BrushType.SMOOTH, strength: serialized.strength! };
    } else if (serialized.type === "flatten") {
        return { ...base, type: BrushType.FLATTEN, targetAltitude: serialized.targetAltitude! };
    } else if (serialized.type === "noise") {
        return {
            ...base,
            type: BrushType.NOISE,
            strength: serialized.strength!,
            scale: serialized.scale!,
            persistence: serialized.persistence
        };
    } else if (serialized.type === "erode") {
        return { ...base, type: BrushType.ERODE, strength: serialized.strength! };
    }

    throw new Error(`Unknown brush type: ${serialized.type}`);
}

export function serializeBrushOperation(op: BrushOperation): SerializedBrushOperation {
    return {
        position: op.position.toGeoPoint(),
        settings: serializeBrushSettings(op.settings)
    };
}

export function deserializeBrushOperation(serialized: SerializedBrushOperation): BrushOperation {
    return {
        position: GeoCoordinates.fromGeoPoint(serialized.position),
        settings: deserializeBrushSettings(serialized.settings)
    };
}

export function serializeGroundModificationData(
    data: GroundModificationData
): SerializedGroundModificationData {
    return {
        id: data.id,
        operations: data.operations.map(serializeBrushOperation),
        boundingBox: data.boundingBox.toArray()
    };
}

export function brushOperationsToSerializedModifications(
    operations: BrushOperation[],
    operationIds: string[],
    boundingBoxes: GeoBox[]
): SerializedGroundModificationData[] {
    return operations.map((op, index) => ({
        id: operationIds[index],
        operations: [serializeBrushOperation(op)],
        boundingBox: boundingBoxes[index].toArray()
    }));
}

export function deserializeGroundModificationData(
    serialized: SerializedGroundModificationData
): GroundModificationData {
    return {
        id: serialized.id,
        operations: serialized.operations.map(op => ({
            position: GeoCoordinates.fromGeoPoint(op.position),
            settings: deserializeBrushSettings(op.settings)
        })),
        boundingBox: GeoBox.fromArray(serialized.boundingBox)
    };
}
