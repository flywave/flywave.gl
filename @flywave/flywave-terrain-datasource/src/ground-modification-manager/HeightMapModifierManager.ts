/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";
import { DataTexture, EventDispatcher, LinearFilter, RGBAFormat } from "three";

import {
    type HeightOperation,
    type HeightMapSourceData,
    type HeightMapModifier,
    type HeightMapModificationEventParams
} from "./HeightMapModifierTypes";

interface InternalModifier extends HeightMapModifier {
    texture: DataTexture | null;
}

interface HeightMapModificationEvents {
    change: HeightMapModificationEventParams;
}

function geoBoxesIntersect(a: GeoBox, b: GeoBox): boolean {
    return !(
        a.northEast.longitude < b.southWest.longitude ||
        a.southWest.longitude > b.northEast.longitude ||
        a.northEast.latitude < b.southWest.latitude ||
        a.southWest.latitude > b.northEast.latitude
    );
}

async function createTextureFromSource(source: HeightMapSourceData): Promise<DataTexture> {
    let width: number;
    let height: number;
    let data: Uint8Array;

    if (source.type === "data") {
        width = source.width;
        height = source.height;
        data =
            source.data instanceof Float32Array
                ? new Uint8Array(source.data.buffer)
                : (source.data as Uint8Array);
    } else if (source.type === "image") {
        const img = source.image;
        if (img instanceof ImageData) {
            width = img.width;
            height = img.height;
            data = new Uint8Array(img.data.buffer);
        } else {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img as CanvasImageSource, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            width = canvas.width;
            height = canvas.height;
            data = new Uint8Array(imgData.data.buffer);
        }
    } else {
        throw new Error(`URL source not supported for direct texture creation`);
    }

    const texture = new DataTexture(data, width, height, RGBAFormat);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    return texture;
}

export class HeightMapModifierManager extends EventDispatcher<HeightMapModificationEvents> {
    private readonly modifiers = new Map<string, InternalModifier>();
    private _version = 0;

    get version(): number {
        return this._version;
    }

    addModifier(
        id: string,
        source: HeightMapSourceData,
        geoBox: GeoBox,
        heightOperation: HeightOperation = "add"
    ): string {
        const internal: InternalModifier = {
            id,
            source,
            geoBox: geoBox.clone(),
            enabled: true,
            heightOperation,
            texture: null
        };
        this.modifiers.set(id, internal);
        this.createTextureAsync(id);
        this._version++;
        this.dispatchChangeEvent("add", [id]);
        return id;
    }

    updateModifierData(id: string, source: HeightMapSourceData, geoBox?: GeoBox): boolean {
        const mod = this.modifiers.get(id);
        if (!mod) return false;

        mod.source = source;
        if (geoBox) mod.geoBox = geoBox.clone();
        mod.texture = null;
        this.createTextureAsync(id);
        this._version++;
        this.dispatchChangeEvent("update", [id]);
        return true;
    }

    updateModifierTexture(id: string, texture: DataTexture): boolean {
        const mod = this.modifiers.get(id);
        if (!mod) return false;

        const wasNull = mod.texture === null;
        mod.texture = texture;
        if (wasNull) {
            this._version++;
            this.dispatchChangeEvent("update", [id]);
        }
        return true;
    }

    updateModifierHeightRange(id: string, minHeight: number, maxHeight: number): boolean {
        const mod = this.modifiers.get(id);
        if (!mod) return false;

        mod.minHeight = minHeight;
        mod.maxHeight = maxHeight;
        return true;
    }

    removeModifier(id: string): boolean {
        const mod = this.modifiers.get(id);
        if (!mod) return false;

        this.modifiers.delete(id);
        this._version++;
        this.dispatchChangeEvent("remove", [id]);
        return true;
    }

    updateModifier(id: string, changes: Partial<Pick<HeightMapModifier, "enabled">>): boolean {
        const mod = this.modifiers.get(id);
        if (!mod) return false;

        if (changes.enabled !== undefined) {
            mod.enabled = changes.enabled;
        }
        this._version++;
        this.dispatchChangeEvent("update", [id]);
        return true;
    }

    clear(): void {
        const ids = Array.from(this.modifiers.keys());
        this.modifiers.clear();
        if (ids.length > 0) {
            this._version++;
            this.dispatchChangeEvent("clear", ids);
        }
    }

    hasModifier(id: string): boolean {
        return this.modifiers.has(id);
    }

    getModifier(id: string): HeightMapModifier | undefined {
        const mod = this.modifiers.get(id);
        return mod ? { ...mod, geoBox: mod.geoBox.clone() } : undefined;
    }

    getAllModifiers(): HeightMapModifier[] {
        return Array.from(this.modifiers.values()).map(m => ({ ...m, geoBox: m.geoBox.clone() }));
    }

    getEnabledModifiers(): HeightMapModifier[] {
        return this.getAllModifiers().filter(m => m.enabled);
    }

    findIntersectingModifiers(tileGeoBox: GeoBox): InternalModifier[] {
        const result: InternalModifier[] = [];
        for (const mod of this.modifiers.values()) {
            if (mod.enabled && mod.texture && geoBoxesIntersect(mod.geoBox, tileGeoBox)) {
                result.push(mod);
            }
        }
        return result;
    }

    findModifiersInBoundingBox(bbox: GeoBox): HeightMapModifier[] {
        return this.findIntersectingModifiers(bbox).map(m => ({ ...m, geoBox: m.geoBox.clone() }));
    }

    getModifierHeightRange(tileGeoBox: GeoBox): { minDelta: number; maxDelta: number } | null {
        const mods = this.findIntersectingModifiers(tileGeoBox);
        if (mods.length === 0) return null;

        let minDelta = 0;
        let maxDelta = 0;

        for (const mod of mods) {
            const modMin = mod.minHeight ?? 0;
            const modMax = mod.maxHeight ?? 0;
            minDelta = Math.min(minDelta, modMin);
            maxDelta = Math.max(maxDelta, modMax);
        }

        if (minDelta === 0 && maxDelta === 0) return null;
        return { minDelta, maxDelta };
    }

    getModifierCount(): number {
        return this.modifiers.size;
    }

    getModifiedElevation(baseHeight: number, lon: number, lat: number): number {
        let result = baseHeight;
        for (const mod of this.modifiers.values()) {
            if (!mod.enabled || !mod.texture) continue;
            if (!mod.geoBox.contains(new GeoCoordinates(lat, lon))) continue;

            const u =
                (lon - mod.geoBox.southWest.longitude) /
                (mod.geoBox.northEast.longitude - mod.geoBox.southWest.longitude);
            const v =
                (lat - mod.geoBox.southWest.latitude) /
                (mod.geoBox.northEast.latitude - mod.geoBox.southWest.latitude);

            const px = Math.floor(u * (mod.texture.image.width - 1));
            const py = Math.floor((1 - v) * (mod.texture.image.height - 1));
            const idx = (py * mod.texture.image.width + px) * 4;
            const data = mod.texture.image.data as Uint8Array;

            const alpha = data[idx + 3] / 255;
            if (alpha < 0.01) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const modH = (r * 65536 + g * 256 + b) / 10 - 10000;

            if (mod.heightOperation === "replace") {
                result = result * (1 - alpha) + modH * alpha;
            } else {
                result += modH * alpha;
            }
        }
        return result;
    }

    private async createTextureAsync(id: string): Promise<void> {
        const mod = this.modifiers.get(id);
        if (!mod) return;
        try {
            const texture = await createTextureFromSource(mod.source);
            if (mod.texture !== null) return;
            mod.texture = texture;
            const range = this.calculateTextureHeightRange(texture);
            mod.minHeight = range.min;
            mod.maxHeight = range.max;
            this._version++;
            this.dispatchChangeEvent("update", [id]);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error(`Failed to create texture for modifier ${id}:`, e);
        }
    }

    private calculateTextureHeightRange(texture: DataTexture): { min: number; max: number } {
        const image = texture.image as { data: Uint8Array; width: number; height: number };
        const data = image.data;
        const pixelCount = image.width * image.height;
        let min = 0;
        let max = 0;
        for (let i = 0; i < pixelCount; i++) {
            const idx = i * 4;
            const alpha = data[idx + 3] / 255;
            if (alpha < 0.01) continue;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const modH = (r * 65536 + g * 256 + b) / 10 - 10000;
            const effective = modH * alpha;
            if (effective < min) min = effective;
            if (effective > max) max = effective;
        }
        return { min, max };
    }

    private dispatchChangeEvent(
        changeType: "add" | "remove" | "update" | "clear",
        affectedIds: string[] = []
    ) {
        let affectedBounds: GeoBox | null = null;
        if (affectedIds.length > 0) {
            const boxes = affectedIds
                .map(id => this.modifiers.get(id)?.geoBox)
                .filter((b): b is GeoBox => b !== undefined);
            if (boxes.length > 0) {
                affectedBounds = this.calculateBoundingBox(boxes);
            }
        }

        this.dispatchEvent({
            type: "change",
            changeType,
            affectedIds,
            globalBounds: null,
            affectedBounds
        });
    }

    private calculateBoundingBox(boxes: GeoBox[]): GeoBox {
        const sw = boxes[0].southWest.clone();
        const ne = boxes[0].northEast.clone();
        for (const box of boxes) {
            sw.latitude = Math.min(sw.latitude, box.southWest.latitude);
            sw.longitude = Math.min(sw.longitude, box.southWest.longitude);
            ne.latitude = Math.max(ne.latitude, box.northEast.latitude);
            ne.longitude = Math.max(ne.longitude, box.northEast.longitude);
        }
        return new GeoBox(sw, ne);
    }
}
