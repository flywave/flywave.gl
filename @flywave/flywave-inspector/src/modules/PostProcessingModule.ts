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

    constructor(mapView: MapView) {
        this.mapView = mapView;
    }

    getDefaultData(): PostProcessingData {
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
        const pe = this.mapView.getThemeSync()?.postEffects;
        if (pe?.bloom) Object.assign(data.bloom, pe.bloom);
        if (pe?.vignette) Object.assign(data.vignette, pe.vignette);
        if (pe?.sepia) Object.assign(data.sepia, pe.sepia);
        if (pe?.hueSaturation) Object.assign(data.hueSaturation, pe.hueSaturation);
        if (pe?.brightnessContrast) Object.assign(data.brightnessContrast, pe.brightnessContrast);
        if (pe?.antialiasing) data.taaEnabled = pe.antialiasing === "taa";
        else if (pe?.taa !== undefined) data.taaEnabled = pe.taa;
        const rm = this.mapView.mapRenderingManager;
        if (rm) {
            data.dynamicMsaaSamplingLevel = rm.dynamicMsaaSamplingLevel;
            data.msaaEnabled = rm.msaaEnabled;
            data.staticMsaaSamplingLevel = rm.staticMsaaSamplingLevel;
        }
    }

    updateData(data: PostProcessingData): void {
        this.mapView.patchTheme({
            postEffects: {
                bloom: { ...data.bloom },
                vignette: { ...data.vignette },
                sepia: { ...data.sepia },
                hueSaturation: { ...data.hueSaturation },
                brightnessContrast: { ...data.brightnessContrast },
                antialiasing: data.taaEnabled ? "taa" : "none"
            }
        });
        const rm = this.mapView.mapRenderingManager as IMapRenderingManager | undefined;
        if (rm) {
            rm.dynamicMsaaSamplingLevel = data.dynamicMsaaSamplingLevel;
            rm.msaaEnabled = data.msaaEnabled;
            rm.staticMsaaSamplingLevel = data.staticMsaaSamplingLevel;
        }
    }
}
