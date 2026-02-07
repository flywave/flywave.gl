import { BrushType, BrushSettings } from "../types";

export class BrushEngine {
    private heightData: Float32Array;
    private width: number;
    private height: number;
    private currentBrush: BrushSettings;
    private scaleX: number = 1;
    private scaleY: number = 1;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.heightData = new Float32Array(width * height).fill(0.5);
        this.currentBrush = {
            type: BrushType.RAISE,
            size: 30,
            sizeUnit: "pixels" as const,
            strength: 0.5,
            hardness: 0.5,
            flattenHeight: 0.5
        };
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
        const { type, size, strength, hardness, flattenHeight } = this.currentBrush;
        const radius = Math.floor(size / 2);

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const pixelX = Math.floor(x + dx);
                const pixelY = Math.floor(y + dy);

                if (pixelX < 0 || pixelX >= this.width || pixelY < 0 || pixelY >= this.height) {
                    continue;
                }

                const scaledDx = dx * this.scaleX;
                const scaledDy = dy * this.scaleY;
                const distance = Math.sqrt(scaledDx * scaledDx + scaledDy * scaledDy);
                if (distance > radius) continue;

                const normalizedDistance = distance / radius;
                const weight = this.calculateBrushWeight(normalizedDistance, hardness);

                const idx = pixelY * this.width + pixelX;
                const currentHeight = this.heightData[idx];
                let newHeight = currentHeight;

                switch (type) {
                    case BrushType.RAISE:
                        newHeight = currentHeight + weight * strength;
                        break;
                    case BrushType.LOWER:
                        newHeight = currentHeight - weight * strength;
                        break;
                    case BrushType.SMOOTH:
                        newHeight = this.applySmoothAt(pixelX, pixelY, strength);
                        break;
                    case BrushType.FLATTEN:
                        const targetHeight = flattenHeight ?? 0.5;
                        newHeight =
                            currentHeight * (1 - weight * strength) +
                            targetHeight * weight * strength;
                        break;
                    case BrushType.NOISE:
                        const noiseValue = this.generateNoise(pixelX, pixelY);
                        newHeight = currentHeight + weight * strength * (noiseValue - 0.5) * 0.5;
                        break;
                }

                this.heightData[idx] = Math.max(0, Math.min(1, newHeight));
            }
        }
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

        return currentHeight * (1 - strength * 0.3) + averageHeight * strength * 0.3;
    }

    private generateNoise(x: number, y: number): number {
        const value = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5 + 0.5;
        return value;
    }

    renderToCanvas(canvas: HTMLCanvasElement): void {
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const imageData = ctx.createImageData(this.width, this.height);
        const data = imageData.data;

        for (let i = 0; i < this.heightData.length; i++) {
            const height = this.heightData[i];
            const grayValue = Math.floor(height * 255);

            data[i * 4] = grayValue;
            data[i * 4 + 1] = grayValue;
            data[i * 4 + 2] = grayValue;
            data[i * 4 + 3] = 255;
        }

        ctx.putImageData(imageData, 0, 0);
    }

    getHeightData(): Float32Array {
        return this.heightData;
    }

    setHeightData(data: Float32Array): void {
        if (data.length === this.heightData.length) {
            this.heightData.set(data);
        }
    }

    clear(): void {
        this.heightData.fill(0.5);
    }

    resize(width: number, height: number): void {
        const newData = new Float32Array(width * height).fill(0.5);

        const minX = Math.min(this.width, width);
        const minY = Math.min(this.height, height);

        for (let y = 0; y < minY; y++) {
            for (let x = 0; x < minX; x++) {
                newData[y * width + x] = this.heightData[y * this.width + x];
            }
        }

        this.width = width;
        this.height = height;
        this.heightData = newData;
    }

    getDimensions(): { width: number; height: number } {
        return { width: this.width, height: this.height };
    }
}
