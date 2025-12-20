/* Copyright (C) 2025 flywave.gl contributors */

import { type MapView } from "@flywave/flywave-mapview";
import {
    type IMapRenderingManager
} from "@flywave/flywave-mapview/composing/MapRenderingManager";

import { type MapViewMonitor } from "../monitor/MapViewMonitor";

export interface PostProcessingData {
    bloom: {
        enabled: boolean;
        strength: number;
        radius: number;
        levels: number;
        inverted: boolean;
        ignoreBackground: boolean;
        luminancePassEnabled: boolean;
        luminancePassThreshold: number;
        luminancePassSmoothing: number;
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
    // 添加 FXAA 和 SMAA 的配置
    fxaaEnabled: boolean;
    smaaEnabled: boolean;
    // 添加SSAO配置
    ssao: {
        enabled: boolean;
        intensity?: number;
        radius?: number;
        distanceThreshold?: number;
        distanceFalloff?: number;
        bias?: number;
        samples?: number;
        rings?: number;
        blurRadius?: number;
        blurStdDev?: number;
        blurDepthCutoff?: number;
    };
    // 添加半透明深度配置
    dynamicMsaaSamplingLevel: number;
    msaaEnabled: boolean;
    staticMsaaSamplingLevel: number;
}

export class PostProcessingModule {
    private readonly monitor: MapViewMonitor;
    private readonly mapView: MapView;
    private readonly mapRenderingManager: IMapRenderingManager | undefined;

    constructor(monitor: MapViewMonitor) {
        this.monitor = monitor;
        // 通过正确的类型获取 mapView
        this.mapView = (monitor as any).mapView;
        this.mapRenderingManager = this.mapView.mapRenderingManager;
    }

    getName(): string {
        return "PostProcessing";
    }

    getData(): PostProcessingData {
        if (!this.mapRenderingManager) {
            return this.getDefaultData();
        }

        return {
            bloom: {
                enabled: this.mapRenderingManager.bloom.enabled,
                strength: this.mapRenderingManager.bloom.strength || 0,
                radius: this.mapRenderingManager.bloom.radius || 0,
                levels: this.mapRenderingManager.bloom.levels || 0,
                inverted: (this.mapRenderingManager.bloom as any).inverted || false,
                ignoreBackground: this.mapRenderingManager.bloom.ignoreBackground || false,
                luminancePassEnabled: this.mapRenderingManager.bloom.luminancePassEnabled || false,
                luminancePassThreshold: this.mapRenderingManager.bloom.luminancePassThreshold || 0,
                luminancePassSmoothing: this.mapRenderingManager.bloom.luminancePassSmoothing || 0
            },
            vignette: { ...this.mapRenderingManager.vignette },
            sepia: { ...this.mapRenderingManager.sepia },
            hueSaturation: { ...this.mapRenderingManager.hueSaturation },
            brightnessContrast: { ...this.mapRenderingManager.brightnessContrast },
            // 添加 FXAA 和 SMAA 的配置
            fxaaEnabled: this.mapRenderingManager.fxaaEnabled,
            smaaEnabled: this.mapRenderingManager.smaaEnabled,
            // 添加SSAO配置
            ssao: { ...this.mapRenderingManager.ssao },
            // 添加半透明深度配置
            dynamicMsaaSamplingLevel: this.mapRenderingManager.dynamicMsaaSamplingLevel,
            msaaEnabled: this.mapRenderingManager.msaaEnabled,
            staticMsaaSamplingLevel: this.mapRenderingManager.staticMsaaSamplingLevel
        };
    }

    getDefaultData(): PostProcessingData {
        if (this.mapRenderingManager) {
            return {
                bloom: {
                    enabled: this.mapRenderingManager.bloom.enabled,
                    strength: this.mapRenderingManager.bloom.strength || 0,
                    radius: this.mapRenderingManager.bloom.radius || 0,
                    levels: this.mapRenderingManager.bloom.levels || 0,
                    inverted: (this.mapRenderingManager.bloom as any).inverted || false,
                    ignoreBackground: this.mapRenderingManager.bloom.ignoreBackground || false,
                    luminancePassEnabled:
                        this.mapRenderingManager.bloom.luminancePassEnabled || false,
                    luminancePassThreshold:
                        this.mapRenderingManager.bloom.luminancePassThreshold || 0,
                    luminancePassSmoothing:
                        this.mapRenderingManager.bloom.luminancePassSmoothing || 0
                },
                vignette: { ...this.mapRenderingManager.vignette },
                sepia: { ...this.mapRenderingManager.sepia },
                hueSaturation: { ...this.mapRenderingManager.hueSaturation },
                brightnessContrast: { ...this.mapRenderingManager.brightnessContrast },
                // 添加 FXAA 和 SMAA 的默认值
                fxaaEnabled: this.mapRenderingManager.fxaaEnabled,
                smaaEnabled: this.mapRenderingManager.smaaEnabled,
                // 添加SSAO默认值
                ssao: { ...this.mapRenderingManager.ssao },
                // 添加半透明深度默认值
                dynamicMsaaSamplingLevel: this.mapRenderingManager.dynamicMsaaSamplingLevel,
                msaaEnabled: this.mapRenderingManager.msaaEnabled,
                staticMsaaSamplingLevel: this.mapRenderingManager.staticMsaaSamplingLevel
            };
        }

        // Fallback to hardcoded defaults if mapRenderingManager is not available
        return {
            bloom: {
                enabled: false,
                strength: 2.5,
                radius: 0.7,
                levels: 5,
                inverted: false,
                ignoreBackground: true,
                luminancePassEnabled: false,
                luminancePassThreshold: 0.0,
                luminancePassSmoothing: 0.1
            },
            vignette: {
                enabled: false,
                offset: 1.0,
                darkness: 1.0
            },
            sepia: {
                enabled: false,
                amount: 0.5
            },
            hueSaturation: {
                enabled: false,
                hue: 0.0,
                saturation: 0.0
            },
            brightnessContrast: {
                enabled: false,
                brightness: 0.0,
                contrast: 0.0
            },
            // 添加 FXAA 和 SMAA 的默认值
            fxaaEnabled: false,
            smaaEnabled: false,
            // 添加SSAO默认值
            ssao: {
                enabled: false,
                intensity: 1.0,
                radius: 0.05,
                distanceThreshold: 0.1,
                distanceFalloff: 0.1,
                bias: 0.1,
                samples: 16,
                rings: 7,
                blurRadius: 8,
                blurStdDev: 4,
                blurDepthCutoff: 0.01
            },
            dynamicMsaaSamplingLevel: 1,
            msaaEnabled: false,
            staticMsaaSamplingLevel: 4
        };
    }

    syncWithMap(data: PostProcessingData): void {
        if (!this.mapRenderingManager) {
            return;
        }

        // Sync all post-processing effects from map to data object
        Object.assign(data.bloom, this.mapRenderingManager.bloom);
        Object.assign(data.vignette, this.mapRenderingManager.vignette);
        Object.assign(data.sepia, this.mapRenderingManager.sepia);
        Object.assign(data.hueSaturation, this.mapRenderingManager.hueSaturation);
        Object.assign(data.brightnessContrast, this.mapRenderingManager.brightnessContrast);
        // 同步 FXAA 和 SMAA 的状态
        data.fxaaEnabled = this.mapRenderingManager.fxaaEnabled;
        data.smaaEnabled = this.mapRenderingManager.smaaEnabled;
        // 同步SSAO状态
        Object.assign(data.ssao, this.mapRenderingManager.ssao);
        // 同步半透明深度状态
        data.dynamicMsaaSamplingLevel = this.mapRenderingManager.dynamicMsaaSamplingLevel;
        data.msaaEnabled = this.mapRenderingManager.msaaEnabled;
        data.staticMsaaSamplingLevel = this.mapRenderingManager.staticMsaaSamplingLevel;
    }

    updateData(data: PostProcessingData): void {
        if (!this.mapRenderingManager) {
            return;
        }

        // Update all post-processing effects from data object to map
        Object.assign(this.mapRenderingManager.bloom, data.bloom);
        Object.assign(this.mapRenderingManager.vignette, data.vignette);
        Object.assign(this.mapRenderingManager.sepia, data.sepia);
        Object.assign(this.mapRenderingManager.hueSaturation, data.hueSaturation);
        Object.assign(this.mapRenderingManager.brightnessContrast, data.brightnessContrast);
        // 更新 FXAA 和 SMAA 的状态
        this.mapRenderingManager.fxaaEnabled = data.fxaaEnabled;
        this.mapRenderingManager.smaaEnabled = data.smaaEnabled;
        // 更新SSAO状态
        Object.assign(this.mapRenderingManager.ssao, data.ssao);
        // 更新半透明深度状态
        this.mapRenderingManager.dynamicMsaaSamplingLevel = data.dynamicMsaaSamplingLevel;
        this.mapRenderingManager.msaaEnabled = data.msaaEnabled;
        this.mapRenderingManager.staticMsaaSamplingLevel = data.staticMsaaSamplingLevel;
    }
}
