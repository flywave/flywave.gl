/* Copyright (C) 2025 flywave.gl contributors */

import type { GeoBox } from "@flywave/flywave-geoutils";
import { BrushOperation, BrushSettings, BrushType } from "./BrushTypes";
import { CoordinateUtils } from "../terrain-processor/utils/coordinate-utils";
import { GeoDistanceUtils } from "./GeoDistanceUtils";

export class BrushProcessor {
    public applyBrushOperations(
        operations: BrushOperation[],
        tileGeoBox: GeoBox,
        width: number,
        height: number
    ): Float32Array {
        const data = new Float32Array(width * height);
        data.fill(0.0);

        const pixelScaling = GeoDistanceUtils.metersToPixels(1, tileGeoBox, width, height);

        for (const op of operations) {
            const pixelPos = CoordinateUtils.geoToTileSpace(op.position, tileGeoBox, width, height);
            this.applyBrush(
                data,
                width,
                height,
                Math.floor(pixelPos.x),
                Math.floor(pixelPos.y),
                op.settings,
                pixelScaling
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
        settings: BrushSettings,
        pixelScaling: { xPixels: number; yPixels: number }
    ): void {
        const { type, radius, hardness, shape } = settings;

        const radiusXPixels = radius * pixelScaling.xPixels;
        const radiusYPixels = radius * pixelScaling.yPixels;

        const radiusXInt = Math.ceil(radiusXPixels);
        const radiusYInt = Math.ceil(radiusYPixels);

        for (let dy = -radiusYInt; dy <= radiusYInt; dy++) {
            for (let dx = -radiusXInt; dx <= radiusXInt; dx++) {
                const pixelX = centerX + dx;
                const pixelY = centerY + dy;

                if (pixelX < 0 || pixelX >= width || pixelY < 0 || pixelY >= height) {
                    continue;
                }

                const normalizedDx = dx / radiusXPixels;
                const normalizedDy = dy / radiusYPixels;
                const distance = this.calculateDistance(
                    normalizedDx,
                    normalizedDy,
                    shape || "circle"
                );

                if (distance > 1.0) continue;

                const weight = this.calculateBrushWeight(distance, hardness, shape || "circle");
                const index = pixelY * width + pixelX;
                let heightDelta = 0;

                if (type === BrushType.RAISE) {
                    heightDelta = weight * (settings as any).heightDelta;
                } else if (type === BrushType.LOWER) {
                    heightDelta = -weight * (settings as any).heightDelta;
                } else if (type === BrushType.SMOOTH) {
                    heightDelta = weight * (settings as any).strength;
                } else if (type === BrushType.FLATTEN) {
                    heightDelta = weight * (settings as any).targetAltitude;
                } else if (type === BrushType.NOISE) {
                    heightDelta = weight * (settings as any).strength;
                } else if (type === BrushType.ERODE) {
                    heightDelta = weight * (settings as any).strength;
                }

                data[index] = heightDelta;
            }
        }
    }

    private calculateDistance(normalizedDx: number, normalizedDy: number, shape: string): number {
        switch (shape) {
            case "square":
                return Math.max(Math.abs(normalizedDx), Math.abs(normalizedDy));
            case "diamond":
                return Math.abs(normalizedDx) + Math.abs(normalizedDy);
            case "soft":
                const dist = Math.sqrt(normalizedDx * normalizedDx + normalizedDy * normalizedDy);
                return Math.pow(dist, 0.5);
            case "circle":
            default:
                return Math.sqrt(normalizedDx * normalizedDx + normalizedDy * normalizedDy);
        }
    }

    private calculateBrushWeight(
        normalizedDistance: number,
        hardness: number,
        shape: string
    ): number {
        if (normalizedDistance >= 1) return 0;

        const hardnessFactor = 1 - hardness;
        const softness = 0.2 + hardnessFactor * 0.8;
        let weight = 1 - normalizedDistance / softness;
        weight = Math.max(0, Math.min(1, weight));

        switch (shape) {
            case "soft":
                weight = weight * weight;
                break;
            case "diamond":
                weight = 1 - weight * 0.5;
                break;
            case "square":
                break;
            case "circle":
            default:
                weight = weight * weight * (3 - 2 * weight);
                break;
        }

        return weight;
    }

    public dispose(): void {}
}
