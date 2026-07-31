import { BrushType, BrushSettings } from "../types";
import { DataTexture, RGBAFormat, LinearFilter } from "three/webgpu";

export class BrushEngine {
    private rgbaBuffer: Uint8Array;
    private heightData: Float32Array;
    private width: number;
    private height: number;
    private currentBrush: BrushSettings;
    private scaleX: number = 1;
    private scaleY: number = 1;
    private texture: DataTexture;
    private dirty: boolean = false;
    private lastDrawX: number = -1;
    private lastDrawY: number = -1;
    private minHeight: number = 0;
    private maxHeight: number = 0;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.heightData = new Float32Array(width * height).fill(0);
        this.rgbaBuffer = new Uint8Array(width * height * 4).fill(0);
        this.currentBrush = {
            type: BrushType.RAISE,
            size: 30,
            sizeUnit: "pixels" as const,
            targetHeight: 50,
            hardness: 0.5,
            flattenHeight: 100
        };

        this.texture = new DataTexture(this.rgbaBuffer, width, height, RGBAFormat);
        this.texture.minFilter = LinearFilter;
        this.texture.magFilter = LinearFilter;
    }

    getTexture(): DataTexture {
        if (this.dirty) {
            this.texture.needsUpdate = true;
            this.dirty = false;
        }
        return this.texture;
    }

    getHeightRange(): { min: number; max: number } {
        return { min: this.minHeight, max: this.maxHeight };
    }

    updateBrushSettings(settings: Partial<BrushSettings>): void {
        this.currentBrush = { ...this.currentBrush, ...settings };
    }

    setScale(x: number, y: number): void {
        this.scaleX = x;
        this.scaleY = y;
    }

    getBrushSettings(): BrushSettings {
        return { ...this.currentBrush };
    }

    drawAt(x: number, y: number): void {
        if (this.lastDrawX >= 0 && this.lastDrawY >= 0) {
            this.drawLine(this.lastDrawX, this.lastDrawY, x, y);
        } else {
            this.stampAt(x, y);
        }
        this.lastDrawX = x;
        this.lastDrawY = y;
    }

    private drawLine(x0: number, y0: number, x1: number, y1: number): void {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = Math.max(1, Math.floor(this.currentBrush.size / 2));
        const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            this.stampAt(x0 + dx * t, y0 + dy * t);
        }
    }

    private stampAt(x: number, y: number): void {
        const { type, size, targetHeight, hardness, flattenHeight } = this.currentBrush;
        const radius = Math.max(1, Math.floor(size / 2));

        const startX = Math.max(0, Math.floor(x - radius));
        const endX = Math.min(this.width - 1, Math.ceil(x + radius));
        const startY = Math.max(0, Math.floor(y - radius));
        const endY = Math.min(this.height - 1, Math.ceil(y + radius));

        for (let py = startY; py <= endY; py++) {
            for (let px = startX; px <= endX; px++) {
                const dx = px - x;
                const dy = py - y;
                const scaledDx = dx * this.scaleX;
                const scaledDy = dy * this.scaleY;
                const distance = Math.sqrt(scaledDx * scaledDx + scaledDy * scaledDy);
                if (distance > radius) continue;

                const normalizedDistance = distance / radius;
                const weight = this.calculateBrushWeight(normalizedDistance, hardness);

                const idx = py * this.width + px;
                const currentHeight = this.heightData[idx];
                let newHeight = currentHeight;

                switch (type) {
                    case BrushType.RAISE:
                        newHeight = currentHeight + weight * (targetHeight - currentHeight) * 0.3;
                        break;
                    case BrushType.LOWER:
                        newHeight = currentHeight - weight * (targetHeight - currentHeight) * 0.3;
                        break;
                    case BrushType.SMOOTH:
                        newHeight = this.applySmoothAt(px, py, weight * 0.3);
                        break;
                    case BrushType.FLATTEN:
                        newHeight =
                            currentHeight * (1 - weight * 0.5) +
                            (flattenHeight ?? 0) * weight * 0.5;
                        break;
                    case BrushType.NOISE:
                        const noise = this.generateNoise(px, py);
                        newHeight = currentHeight + weight * 20 * (noise - 0.5);
                        break;
                }

                this.heightData[idx] = newHeight;
                this.encodePixel(idx, newHeight, weight);
            }
        }

        this.dirty = true;
    }

    private encodePixel(idx: number, height: number, weight: number): void {
        const vector = [6553.6, 25.6, 0.1, 10000.0];
        let v = Math.floor((height + vector[3]) / vector[2]);
        const b = v % 256;
        v = Math.floor(v / 256);
        const g = v % 256;
        v = Math.floor(v / 256);
        const r = v;

        const pixelIdx = idx * 4;
        this.rgbaBuffer[pixelIdx] = r;
        this.rgbaBuffer[pixelIdx + 1] = g;
        this.rgbaBuffer[pixelIdx + 2] = b;
        this.rgbaBuffer[pixelIdx + 3] = Math.max(
            this.rgbaBuffer[pixelIdx + 3],
            Math.round(weight * 255)
        );

        this.minHeight = Math.min(this.minHeight, height);
        this.maxHeight = Math.max(this.maxHeight, height);
    }

    private calculateBrushWeight(normalizedDistance: number, hardness: number): number {
        const hardnessFactor = 1 - hardness;
        const softness = 0.2 + hardnessFactor * 0.8;

        if (normalizedDistance >= 1) return 0;

        let weight = 1 - normalizedDistance / softness;
        weight = Math.max(0, Math.min(1, weight));
        weight = weight * weight * (3 - 2 * weight);

        return weight;
    }

    private applySmoothAt(x: number, y: number, strength: number): number {
        let sum = 0;
        let count = 0;
        const radius = 1;

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;

                if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
                    const idx = ny * this.width + nx;
                    sum += this.heightData[idx];
                    count++;
                }
            }
        }

        if (count === 0) return this.heightData[y * this.width + x];

        const averageHeight = sum / count;
        const currentHeight = this.heightData[y * this.width + x];

        return currentHeight * (1 - strength) + averageHeight * strength;
    }

    private generateNoise(x: number, y: number): number {
        const value = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5 + 0.5;
        return value;
    }

    renderToCanvas(canvas: HTMLCanvasElement): void {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imageData = ctx.createImageData(this.width, this.height);
        imageData.data.set(this.rgbaBuffer);
        ctx.putImageData(imageData, 0, 0);
    }

    getHeightData(): Float32Array {
        return this.heightData;
    }

    setHeightData(data: Float32Array): void {
        if (data.length === this.heightData.length) {
            this.heightData.set(data);
            this.rebuildRgba();
            this.dirty = true;
        }
    }

    private rebuildRgba(): void {
        this.rgbaBuffer.fill(0);
        for (let i = 0; i < this.heightData.length; i++) {
            const h = this.heightData[i];
            if (Math.abs(h) < 0.01) continue;
            this.encodePixel(i, h, 1.0);
        }
    }

    clear(): void {
        this.heightData.fill(0);
        this.rgbaBuffer.fill(0);
        this.dirty = true;
        this.lastDrawX = -1;
        this.lastDrawY = -1;
    }

    resize(width: number, height: number): void {
        const newHeightData = new Float32Array(width * height).fill(0);
        const newRgba = new Uint8Array(width * height * 4).fill(0);

        const minX = Math.min(this.width, width);
        const minY = Math.min(this.height, height);

        for (let y = 0; y < minY; y++) {
            for (let x = 0; x < minX; x++) {
                const oldIdx = y * this.width + x;
                const newIdx = y * width + x;
                newHeightData[newIdx] = this.heightData[oldIdx];
                const oldPixel = oldIdx * 4;
                const newPixel = newIdx * 4;
                newRgba[newPixel] = this.rgbaBuffer[oldPixel];
                newRgba[newPixel + 1] = this.rgbaBuffer[oldPixel + 1];
                newRgba[newPixel + 2] = this.rgbaBuffer[oldPixel + 2];
                newRgba[newPixel + 3] = this.rgbaBuffer[oldPixel + 3];
            }
        }

        this.width = width;
        this.height = height;
        this.heightData = newHeightData;
        this.rgbaBuffer = newRgba;

        this.texture = new DataTexture(this.rgbaBuffer, width, height, RGBAFormat);
        this.texture.minFilter = LinearFilter;
        this.texture.magFilter = LinearFilter;
        this.dirty = true;
    }

    resetStroke(): void {
        this.lastDrawX = -1;
        this.lastDrawY = -1;
    }

    getDimensions(): { width: number; height: number } {
        return { width: this.width, height: this.height };
    }
}
