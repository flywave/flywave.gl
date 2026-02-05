/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBoxArray, type GeoBoxJSON, GeoBox } from "@flywave/flywave-geoutils";

export enum HeightMapBlendMode {
    ADD = "add",
    SUBTRACT = "subtract",
    MULTIPLY = "multiply",
    DIVIDE = "divide",
    MIN = "min",
    MAX = "max",
    REPLACE = "replace",
    AVERAGE = "average",
    DIFFERENCE = "difference",
    SCREEN = "screen",
    OVERLAY = "overlay"
}

export type HeightMapSourceData =
    | { type: "image"; image: ImageData | HTMLImageElement | HTMLCanvasElement }
    | { type: "url"; url: string }
    | { type: "data"; data: Float32Array | Uint8Array; width: number; height: number };

export interface HeightMapScale {
    min: number;
    max: number;
}

export interface HeightMapModifier {
    id: string;
    source: HeightMapSourceData;
    geoBox: GeoBox;
    blendMode: HeightMapBlendMode;
    opacity: number;
    enabled: boolean;
    heightScale?: HeightMapScale;
}

export interface SerializedHeightMapModifier {
    id: string;
    source: {
        type: string;
        url?: string;
        data?: number[];
        width?: number;
        height?: number;
    };
    geoBox: GeoBoxArray;
    blendMode: string;
    opacity: number;
    enabled: boolean;
    heightScale?: HeightMapScale;
}

export interface HeightMapModificationEventParams {
    changeType: "add" | "remove" | "update" | "clear" | "bounds";
    affectedIds: string[];
    globalBounds: GeoBox | null;
    affectedBounds: GeoBox | null;
    previousBounds?: GeoBox | null;
}

export interface HeightMapModificationData {
    modifiers: HeightMapModifier[];
    boundingBox: GeoBox;
}

export function serializeHeightMapModifier(
    modifier: HeightMapModifier
): SerializedHeightMapModifier {
    const source: SerializedHeightMapModifier["source"] = {
        type: modifier.source.type
    };

    if (modifier.source.type === "url") {
        source.url = modifier.source.url;
    } else if (modifier.source.type === "data") {
        source.data = Array.from(modifier.source.data);
        source.width = modifier.source.width;
        source.height = modifier.source.height;
    } else if (modifier.source.type === "image") {
        let imageData: ImageData;

        if (modifier.source.image instanceof ImageData) {
            imageData = modifier.source.image;
        } else {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d")!;
            canvas.width = modifier.source.image.width;
            canvas.height = modifier.source.image.height;
            ctx.drawImage(modifier.source.image, 0, 0);
            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        }

        source.data = Array.from(imageData.data);
        source.width = imageData.width;
        source.height = imageData.height;
    }

    return {
        id: modifier.id,
        source,
        geoBox: modifier.geoBox.toArray(),
        blendMode: modifier.blendMode,
        opacity: modifier.opacity,
        enabled: modifier.enabled,
        heightScale: modifier.heightScale
    };
}

export function deserializeHeightMapModifier(
    serialized: SerializedHeightMapModifier
): HeightMapModifier {
    let source: HeightMapSourceData;

    if (serialized.source.type === "url") {
        source = { type: "url", url: serialized.source.url! };
    } else if (serialized.source.type === "data") {
        const dataArray = serialized.source.data!;
        const data = dataArray.every(v => v >= 0 && v <= 255 && Number.isInteger(v))
            ? new Uint8Array(dataArray)
            : new Float32Array(dataArray);
        source = {
            type: "data",
            data,
            width: serialized.source.width!,
            height: serialized.source.height!
        };
    } else if (serialized.source.type === "image") {
        const dataArray = serialized.source.data!;
        const width = serialized.source.width!;
        const height = serialized.source.height!;
        const uint8ClampedArray = new Uint8ClampedArray(dataArray);

        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d")!;
        const imageData = ctx.createImageData(width, height);
        imageData.data.set(uint8ClampedArray);

        source = { type: "image", image: imageData };
    } else {
        throw new Error(`Cannot deserialize source type: ${serialized.source.type}`);
    }

    return {
        id: serialized.id,
        source,
        geoBox: GeoBox.fromArray(serialized.geoBox),
        blendMode: serialized.blendMode as HeightMapBlendMode,
        opacity: serialized.opacity,
        enabled: serialized.enabled,
        heightScale: serialized.heightScale
    };
}
