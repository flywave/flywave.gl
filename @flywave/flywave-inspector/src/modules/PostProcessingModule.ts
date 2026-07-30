/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import { type IMapRenderingManager } from "@flywave/flywave-mapview/composing/MapRenderingManager";

export interface PostProcessingData {
    bloom: {
        enabled: boolean;
        strength: number;
        radius: number;
        luminancePassThreshold: number;
    };
    vignette: {
        enabled: boolean;
        offset: number;
        darkness: number;
    };
    sepia: {
        enabled: boolean;
        amount: number;
    };
    hueSaturation: {
        enabled: boolean;
        hue: number;
        saturation: number;
    };
    brightnessContrast: {
        enabled: boolean;
        brightness: number;
        contrast: number;
    };
    taaEnabled: boolean;
    dynamicMsaaSamplingLevel: number;
    msaaEnabled: boolean;
    staticMsaaSamplingLevel: number;
}

export class PostProcessingModule {
    private readonly mapView: MapView;
    private readonly mapRenderingManager: IMapRenderingManager | undefined;

    constructor(mapView: MapView) {
        this.mapView = mapView;
        this.mapRenderingManager = mapView.mapRenderingManager;
    }

    getDefaultData(): PostProcessingData {
        if (this.mapRenderingManager) {
            return {
                bloom: {
                    enabled: this.mapRenderingManager.bloom.enabled,
                    strength: this.mapRenderingManager.bloom.strength || 0,
                    radius: this.mapRenderingManager.bloom.radius || 0,
                    luminancePassThreshold:
                        this.mapRenderingManager.bloom.luminancePassThreshold || 0
                },
                vignette: { ...this.mapRenderingManager.vignette },
                sepia: { ...this.mapRenderingManager.sepia },
                hueSaturation: { ...this.mapRenderingManager.hueSaturation },
                brightnessContrast: { ...this.mapRenderingManager.brightnessContrast },
                taaEnabled: this.mapRenderingManager.taaEnabled,
                dynamicMsaaSamplingLevel: this.mapRenderingManager.dynamicMsaaSamplingLevel,
                msaaEnabled: this.mapRenderingManager.msaaEnabled,
                staticMsaaSamplingLevel: this.mapRenderingManager.staticMsaaSamplingLevel
            };
        }

        return {
            bloom: { enabled: false, strength: 2.5, radius: 0.7, luminancePassThreshold: 0.0 },
            vignette: { enabled: false, offset: 1.0, darkness: 1.0 },
            sepia: { enabled: false, amount: 0.5 },
            hueSaturation: { enabled: false, hue: 0.0, saturation: 0.0 },
            brightnessContrast: { enabled: false, brightness: 0.0, contrast: 0.0 },
            taaEnabled: false,
            dynamicMsaaSamplingLevel: 1,
            msaaEnabled: false,
            staticMsaaSamplingLevel: 4
        };
    }

    syncWithMap(data: PostProcessingData): void {
        if (!this.mapRenderingManager) return;
        Object.assign(data.bloom, this.mapRenderingManager.bloom);
        Object.assign(data.vignette, this.mapRenderingManager.vignette);
        Object.assign(data.sepia, this.mapRenderingManager.sepia);
        Object.assign(data.hueSaturation, this.mapRenderingManager.hueSaturation);
        Object.assign(data.brightnessContrast, this.mapRenderingManager.brightnessContrast);
        data.taaEnabled = this.mapRenderingManager.taaEnabled;
        data.dynamicMsaaSamplingLevel = this.mapRenderingManager.dynamicMsaaSamplingLevel;
        data.msaaEnabled = this.mapRenderingManager.msaaEnabled;
        data.staticMsaaSamplingLevel = this.mapRenderingManager.staticMsaaSamplingLevel;
    }

    updateData(data: PostProcessingData): void {
        if (!this.mapRenderingManager) return;
        Object.assign(this.mapRenderingManager.bloom, data.bloom);
        Object.assign(this.mapRenderingManager.vignette, data.vignette);
        Object.assign(this.mapRenderingManager.sepia, data.sepia);
        Object.assign(this.mapRenderingManager.hueSaturation, data.hueSaturation);
        Object.assign(this.mapRenderingManager.brightnessContrast, data.brightnessContrast);
        this.mapRenderingManager.taaEnabled = data.taaEnabled;
        this.mapRenderingManager.dynamicMsaaSamplingLevel = data.dynamicMsaaSamplingLevel;
        this.mapRenderingManager.msaaEnabled = data.msaaEnabled;
        this.mapRenderingManager.staticMsaaSamplingLevel = data.staticMsaaSamplingLevel;
        this.mapRenderingManager.syncPostEffectsToVRM();
    }
}
