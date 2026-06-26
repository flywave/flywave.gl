/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBoxArray, type GeoBoxJSON, GeoBox } from "@flywave/flywave-geoutils";

export type HeightMapSourceData =
    | { type: "image"; image: ImageData | HTMLImageElement | HTMLCanvasElement | ImageBitmap }
    | { type: "url"; url: string }
    | { type: "data"; data: Float32Array | Uint8Array; width: number; height: number };

export type HeightOperation = "add" | "replace";

export interface HeightMapModifier {
    id: string;
    source: HeightMapSourceData;
    geoBox: GeoBox;
    enabled: boolean;
    heightOperation?: HeightOperation;
    minHeight?: number;
    maxHeight?: number;
}

export interface SerializedHeightMapModifier {
    id: string;
    source: {
        type: string;
        url?: string;
        data?: number[];
        buffer?: ArrayBuffer;
        imageBitmap?: ImageBitmap;
        width?: number;
        height?: number;
    };
    geoBox: GeoBoxArray;
    enabled: boolean;
}

export interface SerializedHeightMapModifierWithTransfer {
    modifier: SerializedHeightMapModifier;
    transferables: Transferable[];
}

export async function serializeHeightMapModifierWithTransfer(
    modifier: HeightMapModifier
): Promise<SerializedHeightMapModifierWithTransfer> {
    const source: SerializedHeightMapModifier["source"] = {
        type: modifier.source.type
    };
    const transferables: Transferable[] = [];

    if (modifier.source.type === "url") {
        source.url = modifier.source.url;
    } else if (modifier.source.type === "data") {
        const data = modifier.source.data;
        source.buffer = data.buffer;
        source.width = modifier.source.width;
        source.height = modifier.source.height;
        transferables.push(data.buffer);
    } else if (modifier.source.type === "image") {
        let imageBitmap: ImageBitmap;

        if (modifier.source.image instanceof ImageBitmap) {
            imageBitmap = modifier.source.image;
        } else if (modifier.source.image instanceof ImageData) {
            imageBitmap = await createImageBitmap(modifier.source.image);
        } else {
            imageBitmap = await createImageBitmap(modifier.source.image);
        }

        source.imageBitmap = imageBitmap;
        source.width = imageBitmap.width;
        source.height = imageBitmap.height;
        transferables.push(imageBitmap);
    }

    const serializedModifier: SerializedHeightMapModifier = {
        id: modifier.id,
        source,
        geoBox: modifier.geoBox.toArray(),
        enabled: modifier.enabled
    };

    return { modifier: serializedModifier, transferables };
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
        const data = modifier.source.data;
        source.buffer = data.buffer.slice(0);
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

        source.buffer = imageData.data.buffer.slice(0);
        source.width = imageData.width;
        source.height = imageData.height;
    }

    return {
        id: modifier.id,
        source,
        geoBox: modifier.geoBox.toArray(),
        enabled: modifier.enabled
    };
}

export function deserializeHeightMapModifier(
    serialized: SerializedHeightMapModifier
): HeightMapModifier {
    let source: HeightMapSourceData;

    if (serialized.source.type === "url") {
        source = { type: "url", url: serialized.source.url! };
    } else if (serialized.source.type === "data") {
        let data: Float32Array | Uint8Array;
        if (serialized.source.buffer !== undefined) {
            const buffer = serialized.source.buffer;
            const byteLength = buffer.byteLength;
            if (byteLength % 4 === 0) {
                data = new Float32Array(buffer);
            } else {
                data = new Uint8Array(buffer);
            }
        } else if (serialized.source.data) {
            const dataArray = serialized.source.data;
            data = dataArray.every(v => v >= 0 && v <= 255 && Number.isInteger(v))
                ? new Uint8Array(dataArray)
                : new Float32Array(dataArray);
        } else {
            throw new Error("Missing data buffer in serialized modifier");
        }
        source = {
            type: "data",
            data,
            width: serialized.source.width!,
            height: serialized.source.height!
        };
    } else if (serialized.source.type === "image") {
        if (serialized.source.imageBitmap !== undefined) {
            source = { type: "image", image: serialized.source.imageBitmap };
        } else if (serialized.source.buffer !== undefined) {
            const uint8ClampedArray = new Uint8ClampedArray(serialized.source.buffer);
            const width = serialized.source.width!;
            const height = serialized.source.height!;

            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext("2d")!;
            const imageData = ctx.createImageData(width, height);
            imageData.data.set(uint8ClampedArray);

            source = { type: "image", image: imageData };
        } else if (serialized.source.data) {
            const uint8ClampedArray = new Uint8ClampedArray(serialized.source.data);
            const width = serialized.source.width!;
            const height = serialized.source.height!;

            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext("2d")!;
            const imageData = ctx.createImageData(width, height);
            imageData.data.set(uint8ClampedArray);

            source = { type: "image", image: imageData };
        } else {
            throw new Error("Missing image buffer or bitmap in serialized modifier");
        }
    } else {
        throw new Error(`Cannot deserialize source type: ${serialized.source.type}`);
    }

    return {
        id: serialized.id,
        source,
        geoBox: GeoBox.fromArray(serialized.geoBox),
        enabled: serialized.enabled
    };
}
