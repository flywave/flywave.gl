/* Copyright (C) 2025 flywave.gl contributors */

import { BrushType, type BrushSettings } from "@flywave/flywave-terrain-datasource";

import type { BrushConfig } from "../types";

export class BrushManager {
    private currentType: BrushType = BrushType.RAISE;
    private radius: number = 50;
    private hardness: number = 0.5;
    private heightDelta: number = 10;
    private strength: number = 0.5;
    private targetAltitude: number = 100;
    private scale: number = 8;
    private persistence: number = 0.6;

    private dragEnabled: boolean = false;
    private dragSpacing: number = 10;

    constructor(defaultBrush?: Partial<BrushConfig>) {
        if (defaultBrush) {
            this.setConfig(defaultBrush);
        }
    }

    setConfig(config: Partial<BrushConfig>): void {
        if (config.type !== undefined) {
            this.currentType = config.type as BrushType;
        }
        if (config.radius !== undefined) {
            this.radius = Math.max(1, Math.min(1000, config.radius));
        }
        if (config.hardness !== undefined) {
            this.hardness = Math.max(0, Math.min(1, config.hardness));
        }
        if (config.heightDelta !== undefined) {
            this.heightDelta = config.heightDelta;
        }
        if (config.strength !== undefined) {
            this.strength = Math.max(0, Math.min(1, config.strength));
        }
        if (config.targetAltitude !== undefined) {
            this.targetAltitude = config.targetAltitude;
        }
        if (config.scale !== undefined) {
            this.scale = Math.max(0.1, Math.min(100, config.scale));
        }
        if (config.persistence !== undefined) {
            this.persistence = Math.max(0, Math.min(1, config.persistence));
        }
        if (config.dragEnabled !== undefined) {
            this.dragEnabled = config.dragEnabled;
        }
        if (config.dragSpacing !== undefined) {
            this.dragSpacing = Math.max(1, Math.min(100, config.dragSpacing));
        }
    }

    getConfig(): Partial<BrushConfig> {
        return {
            type: this.currentType,
            radius: this.radius,
            hardness: this.hardness,
            heightDelta: this.heightDelta,
            strength: this.strength,
            targetAltitude: this.targetAltitude,
            scale: this.scale,
            persistence: this.persistence,
            dragEnabled: this.dragEnabled,
            dragSpacing: this.dragSpacing
        };
    }

    toBrushSettings(): BrushSettings {
        const base = {
            radius: this.radius,
            hardness: this.hardness
        };

        switch (this.currentType) {
            case BrushType.RAISE:
                return {
                    ...base,
                    type: BrushType.RAISE,
                    heightDelta: this.heightDelta
                } as any;
            case BrushType.LOWER:
                return {
                    ...base,
                    type: BrushType.LOWER,
                    heightDelta: this.heightDelta
                } as any;
            case BrushType.SMOOTH:
                return {
                    ...base,
                    type: BrushType.SMOOTH,
                    strength: this.strength
                } as any;
            case BrushType.FLATTEN:
                return {
                    ...base,
                    type: BrushType.FLATTEN,
                    targetAltitude: this.targetAltitude
                } as any;
            case BrushType.NOISE:
                return {
                    ...base,
                    type: BrushType.NOISE,
                    strength: this.strength,
                    scale: this.scale,
                    persistence: this.persistence
                } as any;
            case BrushType.ERODE:
                return {
                    ...base,
                    type: BrushType.ERODE,
                    strength: this.strength
                } as any;
        }
    }

    setDragEnabled(enabled: boolean): void {
        this.dragEnabled = enabled;
    }

    getDragEnabled(): boolean {
        return this.dragEnabled;
    }

    setDragSpacing(spacing: number): void {
        this.dragSpacing = Math.max(1, Math.min(100, spacing));
    }

    getDragSpacing(): number {
        return this.dragSpacing;
    }
}
