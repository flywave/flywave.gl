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
    fxaaEnabled: boolean;
    smaaEnabled: boolean;
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
    translucentDepth: {
        mixFactor?: number;
        blendMode?: "mix" | "add" | "multiply" | "screen";
    };
    dynamicMsaaSamplingLevel: number;
    msaaEnabled: boolean;
    staticMsaaSamplingLevel: number;
}
export declare class PostProcessingModule {
    private readonly monitor;
    private readonly mapView;
    private readonly mapRenderingManager;
    constructor(monitor: MapViewMonitor);
    getName(): string;
    getData(): PostProcessingData;
    getDefaultData(): PostProcessingData;
    syncWithMap(data: PostProcessingData): void;
    updateData(data: PostProcessingData): void;
}
