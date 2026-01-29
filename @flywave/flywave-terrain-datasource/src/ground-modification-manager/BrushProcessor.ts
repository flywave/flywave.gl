/* Copyright (C) 2025 flywave.gl contributors */

import type { GeoBox } from "@flywave/flywave-geoutils";
import type { BrushOperation, BrushSettings } from "./BrushTypes";
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
        const { type, radius, hardness } = settings;

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
                const distance = Math.sqrt(
                    normalizedDx * normalizedDx + normalizedDy * normalizedDy
                );

                if (distance > 1.0) continue;

                const weight = this.calculateBrushWeight(distance, hardness);

                const index = pixelY * width + pixelX;
                let heightDelta = 0;

                if (type === "raise") {
                    heightDelta = weight * settings.heightDelta;
                } else if (type === "lower") {
                    heightDelta = -weight * settings.heightDelta;
                } else if (type === "smooth") {
                    heightDelta = weight * settings.strength;
                } else if (type === "flatten") {
                    heightDelta = weight * settings.targetAltitude;
                } else if (type === "noise") {
                    heightDelta = weight * settings.strength;
                } else if (type === "erode") {
                    heightDelta = weight * settings.strength;
                }

                data[index] = heightDelta;
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
