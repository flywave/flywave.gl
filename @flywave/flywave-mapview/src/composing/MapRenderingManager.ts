/* Copyright (C) 2025 flywave.gl contributors */

import {
    ITranslucentLayerConfig,
    type IBloomEffect,
    type IBrightnessContrastEffect,
    type IHueSaturationEffect,
    type IOutlineEffect,
    type ISepiaEffect,
    type ISSAOEffect,
    type IVignetteEffect
} from "@flywave/flywave-datasource-protocol";
import * as THREE from "three";
import { mrt, uniform } from "three/tsl";
import type { Renderer } from "three/webgpu";

import { type IPassManager } from "./IPassManager";
import { type IViewRenderManager } from "./vrm";
import { TranslucentLayerEffect } from "./vrm/TranslucentLayerEffect";

export enum MSAASampling {
    Level_0 = 0,
    Level_1 = 1,
    Level_2 = 2,
    Level_4 = 4,
    Level_8 = 8
}

export interface IMapAntialiasSettings {
    msaaEnabled: boolean;
    dynamicMsaaSamplingLevel?: MSAASampling;
    staticMsaaSamplingLevel?: MSAASampling;
    fxaaEnabled?: boolean;
    smaaEnabled?: boolean;
}

export interface ICustomEffect {
    id: string;
    enabled: boolean;
    order?: number;
}

export interface IMapRenderingManager extends IPassManager {
    bloom: IBloomEffect;
    outline: IOutlineEffect;
    vignette: IVignetteEffect;
    sepia: ISepiaEffect;
    hueSaturation: IHueSaturationEffect;
    brightnessContrast: IBrightnessContrastEffect;
    fxaaEnabled: boolean;
    smaaEnabled: boolean;
    ssao: ISSAOEffect;
    dynamicMsaaSamplingLevel: MSAASampling;
    msaaEnabled: boolean;
    staticMsaaSamplingLevel: MSAASampling;

    viewRenderManager?: IViewRenderManager;

    render(
        renderer: Renderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean,
        time?: number
    ): void;

    updateOutline(options: {
        thickness: number;
        color: string;
        ghostExtrudedPolygons: boolean;
    }): void;

    lowResPixelRatio?: number;

    addBloomObject(object: THREE.Object3D): void;
    removeBloomObject(object: THREE.Object3D): void;
    addIgnoreBloomObject(object: THREE.Object3D): void;
    removeIgnoreBloomObject(object: THREE.Object3D): void;
    setAntialias(type: "none" | "fxaa" | "smaa"): void;

    addTranslucentObject(object: THREE.Object3D, layer: string): void;
    removeTranslucentObject(object: THREE.Object3D): void;
    addTranslucentLayer(layer: string, layerConfig: ITranslucentLayerConfig): void;
    updateTranslucentLayer(
        layer: string,
        config: {
            mixFactor?: number;
            blendMode?: "mix" | "add" | "multiply" | "screen";
        }
    ): void;
    removeTranslucentLayer(layer: string): void;

    addCustomEffect(customEffect: ICustomEffect): void;
    removeCustomEffect(effectId: string): boolean;
    getCustomEffect(effectId: string): ICustomEffect | undefined;
    setCustomEffectEnabled(effectId: string, enabled: boolean): boolean;
    updateCustomEffect(effectId: string, updater: (effect: unknown) => void): boolean;
    getAllCustomEffects(): ICustomEffect[];

    setDepthPickingStencilRef(stencilRef: number): void;
    setDepthReadingFilter(classificationType: number): void;
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): number | null;

    syncPostEffectsToVRM(): void;

    setTranslucentRenderer(
        renderer: import("three/webgpu").Renderer,
        scene: THREE.Scene,
        camera: THREE.Camera
    ): void;
}

export class MapRenderingManager implements IMapRenderingManager {
    bloom = {
        enabled: false,
        strength: 2.5,
        radius: 0.67,
        levels: 3,
        inverted: false,
        ignoreBackground: true,
        luminancePassThreshold: 0.0,
        luminancePassSmoothing: 0.1
    };

    outline = {
        enabled: false,
        thickness: 0.02,
        color: "#ffffff",
        ghostExtrudedPolygons: false
    };

    vignette = {
        enabled: false,
        offset: 1.0,
        darkness: 1.0
    };

    sepia = {
        enabled: false,
        amount: 0.5
    };

    hueSaturation = {
        enabled: false,
        hue: 0.0,
        saturation: 0.0
    };

    brightnessContrast = {
        enabled: false,
        brightness: 0.0,
        contrast: 0.0
    };

    ssao = {
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
    };

    fxaaEnabled: boolean = false;
    smaaEnabled: boolean = false;

    private m_msaaEnabled: boolean = true;
    private m_width: number = 1;
    private m_height: number = 1;
    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;
    private m_lowResPixelRatio?: number;
    private m_customEffects: Map<string, ICustomEffect> = new Map();
    private m_pendingBloomObjects: THREE.Object3D[] = [];

    viewRenderManager?: IViewRenderManager;

    constructor(
        width: number,
        height: number,
        lowResPixelRatio: number | undefined,
        antialiasSettings: IMapAntialiasSettings | undefined = { msaaEnabled: false }
    ) {
        this.m_dynamicMsaaSamplingLevel =
            antialiasSettings?.dynamicMsaaSamplingLevel ?? MSAASampling.Level_1;
        this.m_staticMsaaSamplingLevel =
            antialiasSettings?.staticMsaaSamplingLevel ?? MSAASampling.Level_4;
        this.msaaEnabled = antialiasSettings?.msaaEnabled ?? false;
        this.fxaaEnabled = antialiasSettings?.fxaaEnabled ?? false;
        this.smaaEnabled = antialiasSettings?.smaaEnabled ?? false;
        this.lowResPixelRatio = lowResPixelRatio;
        this.setSize(width, height);
    }

    private syncConfigToViewRenderManager(): void {
        const vrm = this.viewRenderManager;
        if (vrm == null) return;

        vrm.config.bloom.enabled = this.bloom.enabled;
        vrm.config.bloom.intensity = this.bloom.strength;
        vrm.config.bloom.radius = this.bloom.radius;
        vrm.config.bloom.threshold = this.bloom.luminancePassThreshold;

        vrm.config.outline.enabled = this.outline.enabled;
        vrm.config.outline.thickness = this.outline.thickness;
        vrm.config.outline.color = this.outline.color;

        vrm.config.vignette.enabled = this.vignette.enabled;
        vrm.config.vignette.offset = this.vignette.offset;
        vrm.config.vignette.darkness = this.vignette.darkness;

        vrm.config.brightnessContrast.enabled = this.brightnessContrast.enabled;
        vrm.config.brightnessContrast.brightness = this.brightnessContrast.brightness;
        vrm.config.brightnessContrast.contrast = this.brightnessContrast.contrast;

        vrm.config.hueSaturation.enabled = this.hueSaturation.enabled;
        vrm.config.hueSaturation.hue = this.hueSaturation.hue;
        vrm.config.hueSaturation.saturation = this.hueSaturation.saturation;

        vrm.config.sepia.enabled = this.sepia.enabled;
        vrm.config.sepia.amount = this.sepia.amount;

        vrm.needsUpdate = true;
    }

    syncPostEffectsToVRM(): void {
        this.syncConfigToViewRenderManager();
        const vrm = this.viewRenderManager;
        if (vrm != null) {
            for (const obj of this.m_pendingBloomObjects) {
                vrm.bloomObjects.add(obj);
                this.applyBloomMrtNode(obj, 1);
            }
            this.m_pendingBloomObjects = [];
        }
    }

    render(
        renderer: Renderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean
    ): void {
        if (this.viewRenderManager != null) {
            this.viewRenderManager.render(scene, camera);
        } else {
            renderer.render(scene, camera);
        }
    }

    setSize(width: number, height: number): void {
        this.m_width = width;
        this.m_height = height;
        this.viewRenderManager?.setSize(width, height);
        this.m_translucentLayerEffect?.setSize(width, height);
    }

    setTranslucentRenderer(
        renderer: import("three/webgpu").Renderer,
        scene: THREE.Scene,
        camera: THREE.Camera
    ): void {
        if (this.m_translucentLayerEffect == null) {
            this.m_translucentLayerEffect = new TranslucentLayerEffect(renderer, scene, camera);
            this.viewRenderManager!.translucentLayerEffect = this.m_translucentLayerEffect;
        }
    }

    updateOutline(options: {
        thickness: number;
        color: string;
        ghostExtrudedPolygons: boolean;
    }): void {
        this.outline.thickness = options.thickness;
        this.outline.color = options.color;
        this.outline.ghostExtrudedPolygons = options.ghostExtrudedPolygons;
    }

    setAntialias(type: "none" | "fxaa" | "smaa"): void {
        this.fxaaEnabled = type === "fxaa";
        this.smaaEnabled = type === "smaa";
    }

    addBloomObject(object: THREE.Object3D): void {
        this.m_pendingBloomObjects.push(object);
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        vrm.bloomObjects.add(object);
        vrm.needsUpdate = true;
        this.applyBloomMrtNode(object, 1);
    }
    removeBloomObject(object: THREE.Object3D): void {
        this.m_pendingBloomObjects = this.m_pendingBloomObjects.filter(o => o !== object);
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        vrm.bloomObjects.delete(object);
        vrm.needsUpdate = true;
        this.applyBloomMrtNode(object, 0);
    }
    private applyBloomMrtNode(object: THREE.Object3D, intensity: number): void {
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as THREE.Material & { mrtNode?: unknown };
            if (mat != null) {
                mat.mrtNode = mrt({ bloomIntensity: uniform(intensity) });
                mat.needsUpdate = true;
            }
        });
    }
    addIgnoreBloomObject(object: THREE.Object3D): void {
        this.viewRenderManager?.bloomIgnoreObjects.add(object);
    }
    removeIgnoreBloomObject(object: THREE.Object3D): void {
        this.viewRenderManager?.bloomIgnoreObjects.delete(object);
    }

    private m_translucentLayerEffect?: TranslucentLayerEffect;

    addTranslucentObject(object: THREE.Object3D, layer: string): void {
        this.m_translucentLayerEffect?.addObject(object, layer);
    }
    removeTranslucentObject(object: THREE.Object3D): void {
        this.m_translucentLayerEffect?.removeObject(object);
    }
    addTranslucentLayer(layer: string, layerConfig: ITranslucentLayerConfig): void {
        this.m_translucentLayerEffect?.addLayer(layer, layerConfig);
    }
    updateTranslucentLayer(
        layer: string,
        config: { mixFactor?: number; blendMode?: "mix" | "add" | "multiply" | "screen" }
    ): void {
        this.m_translucentLayerEffect?.updateLayer(layer, config);
    }
    removeTranslucentLayer(layer: string): void {
        this.m_translucentLayerEffect?.removeLayer(layer);
    }

    addCustomEffect(customEffect: ICustomEffect): void {
        this.m_customEffects.set(customEffect.id, customEffect);
    }
    removeCustomEffect(effectId: string): boolean {
        return this.m_customEffects.delete(effectId);
    }
    getCustomEffect(effectId: string): ICustomEffect | undefined {
        return this.m_customEffects.get(effectId);
    }
    setCustomEffectEnabled(effectId: string, enabled: boolean): boolean {
        const e = this.m_customEffects.get(effectId);
        if (e) {
            e.enabled = enabled;
            return true;
        }
        return false;
    }
    updateCustomEffect(effectId: string, updater: (effect: unknown) => void): boolean {
        const e = this.m_customEffects.get(effectId);
        if (e) {
            updater(e);
            return true;
        }
        return false;
    }
    getAllCustomEffects(): ICustomEffect[] {
        return Array.from(this.m_customEffects.values());
    }

    setDepthPickingStencilRef(stencilRef: number): void {}
    setDepthReadingFilter(classificationType: number): void {}
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): number | null {
        return null;
    }

    set dynamicMsaaSamplingLevel(samplingLevel: MSAASampling) {
        this.m_dynamicMsaaSamplingLevel = samplingLevel;
    }
    get dynamicMsaaSamplingLevel(): MSAASampling {
        return this.m_dynamicMsaaSamplingLevel;
    }
    set msaaEnabled(value: boolean) {
        this.m_msaaEnabled = value;
    }
    get msaaEnabled(): boolean {
        return this.m_msaaEnabled;
    }
    set staticMsaaSamplingLevel(samplingLevel: MSAASampling) {
        this.m_staticMsaaSamplingLevel = samplingLevel;
    }
    get staticMsaaSamplingLevel(): MSAASampling {
        return this.m_staticMsaaSamplingLevel;
    }
    get lowResPixelRatio(): number | undefined {
        return this.m_lowResPixelRatio;
    }
    set lowResPixelRatio(pixelRatio: number | undefined) {
        this.m_lowResPixelRatio = pixelRatio;
    }
}
