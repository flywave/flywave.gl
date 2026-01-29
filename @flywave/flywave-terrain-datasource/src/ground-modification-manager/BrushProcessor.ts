/* Copyright (C) 2025 flywave.gl contributors */

import type { GeoBox } from "@flywave/flywave-geoutils";
import type { BrushOperation, BrushSettings } from "./BrushTypes";
import { CoordinateUtils } from "../terrain-processor/utils/coordinate-utils";

export class BrushProcessor {
    public applyBrushOperations(
        operations: BrushOperation[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): Float32Array {
        const data = new Float32Array(width * height);
        data.fill(0.0);

        for (const op of operations) {
            const pixelPos = CoordinateUtils.geoToTileSpace(op.position, tileGeoBox, width, height);
            this.applyBrush(
                data,
                width,
                height,
                Math.floor(pixelPos.x),
                Math.floor(pixelPos.y),
                op.settings
            );
        }

        return data;
    }

    private applyBrush(
        data: Float32Array,
        width: number,
        height: number,
        centerX: number,
        centerY: number,
        settings: BrushSettings
    ): void {
        const { type, size, strength, hardness } = settings;
        const radius = Math.floor(size / 2);

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const pixelX = centerX + dx;
                const pixelY = centerY + dy;

                if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
                    continue;
                }

                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > radius) continue;

                const normalizedDistance = distance / radius;
                const weight = this.calculateBrushWeight(normalizedDistance, hardness);

                const index = pixelY * width + pixelX;

                if (type === "raise") {
                    data[index] = Math.max(data[index], weight * strength);
                } else if (type === "lower") {
                    data[index] = Math.max(data[index], weight * strength);
                } else if (type === "smooth") {
                    data[index] = Math.max(data[index], weight * strength);
                } else if (type === "flatten") {
                    data[index] = Math.max(data[index], weight * strength);
                } else if (type === "noise") {
                    data[index] = Math.max(data[index], weight * strength);
                } else if (type === "erode") {
                    data[index] = Math.max(data[index], weight * strength);
                }
            }
        }
    }

    private calculateBrushWeight(normalizedDistance: number, hardness: number): number {
        if (normalizedDistance >= 1) return 0;
        const hardnessFactor = 1 - hardness;
        const softness = 0.2 + hardnessFactor * 0.8;
        let weight = 1 - normalizedDistance / softness;
        weight = Math.max(0, Math.min(1, weight));
        weight = weight * weight * (3 - 2 * weight);
        return weight;
    }

    public dispose(): void {}
}
