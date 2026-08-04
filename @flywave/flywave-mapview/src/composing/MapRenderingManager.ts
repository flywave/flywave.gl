/* Copyright (C) 2025 flywave.gl contributors */

import {
    ITranslucentLayerConfig,
    type IBloomEffect,
    type IBrightnessContrastEffect,
    type IHueSaturationEffect,
    type IOutlineEffect,
    type ISepiaEffect,
    type IVignetteEffect
} from "@flywave/flywave-datasource-protocol";
import * as THREE from "three/webgpu";
import { mrt, diffuseColor } from "three/tsl";
import type { Renderer } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";

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
    taaEnabled: boolean;
    dynamicMsaaSamplingLevel: MSAASampling;
    msaaEnabled: boolean;
    staticMsaaSamplingLevel: MSAASampling;

    viewRenderManager?: IViewRenderManager;
    gpuPicking: boolean;

    render(
        renderer: Renderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean,
        time?: number
    ): void;

    updateOutline(options: { thickness: number; color: string }): void;

    lowResPixelRatio?: number;

    addBloomObject(object: THREE.Object3D): void;
    removeBloomObject(object: THREE.Object3D): void;
    addIgnoreBloomObject(object: THREE.Object3D): void;
    removeIgnoreBloomObject(object: THREE.Object3D): void;

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
        luminancePassThreshold: 0.0
    };

    outline = {
        enabled: false,
        thickness: 0.02,
        color: "#ffffff"
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

    taaEnabled: boolean = false;

    private m_msaaEnabled: boolean = true;
    private m_width: number = 1;
    private m_height: number = 1;
    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;
    private m_lowResPixelRatio?: number;
    private m_customEffects: Map<string, ICustomEffect> = new Map();
    private m_pendingBloomObjects: THREE.Object3D[] = [];
    private m_gpuPicking: boolean = false;

    private _viewRenderManager?: IViewRenderManager;
    get viewRenderManager(): IViewRenderManager | undefined {
        return this._viewRenderManager;
    }
    set viewRenderManager(vrm: IViewRenderManager | undefined) {
        this._viewRenderManager = vrm;
        if (vrm) vrm.gpuPicking = this.m_gpuPicking;
    }

    set gpuPicking(value: boolean) {
        this.m_gpuPicking = value;
        if (this._viewRenderManager) {
            this._viewRenderManager.gpuPicking = value;
            this._viewRenderManager.needsUpdate = true;
        }
    }
    get gpuPicking(): boolean {
        return this.m_gpuPicking;
    }

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

        vrm.config.taa.enabled = this.taaEnabled;

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
        _renderer: import("three/webgpu").Renderer,
        _scene: THREE.Scene,
        _camera: THREE.Camera
    ): void {
        if (this.m_translucentLayerEffect == null) {
            this.m_translucentLayerEffect = new TranslucentLayerEffect();
            this.viewRenderManager!.translucentLayerEffect = this.m_translucentLayerEffect;
        }
    }

    updateOutline(options: { thickness: number; color: string }): void {
        this.outline.thickness = options.thickness;
        this.outline.color = options.color;
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
        if (!vrm.bloomObjects.has(object)) return;
        vrm.bloomObjects.delete(object);
        vrm.needsUpdate = true;
        this.applyBloomMrtNode(object, 0);
    }
    private applyBloomMrtNode(object: THREE.Object3D, intensity: number): void {
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as THREE.Material & {
                mrtNode?: unknown;
                userData?: Record<string, unknown>;
            };
            if (mat != null) {
                mat.userData = mat.userData ?? {};
                mat.userData.__bloomIntensity = intensity;
                this.rebuildMrtNode(mat);
            }
        });
    }
    addIgnoreBloomObject(object: THREE.Object3D): void {
        this.viewRenderManager?.bloomIgnoreObjects.add(object);
    }

    private rebuildMrtNode(
        mat: THREE.Material & { mrtNode?: unknown; userData?: Record<string, unknown> }
    ): void {
        const entries: Record<string, any> = {};
        const bloomIntensity = mat.userData?.__bloomIntensity;
        if (bloomIntensity != null) {
            entries.bloomIntensity = uniform(bloomIntensity);
        }
        const layerId = mat.userData?.__translucentLayerId;
        if (layerId != null) {
            entries.translucentLayerId = uniform(layerId);
            entries.translucentColor = diffuseColor.rgb;
        }
        mat.mrtNode = Object.keys(entries).length > 0 ? mrt(entries) : null;
        mat.needsUpdate = true;
    }
    removeIgnoreBloomObject(object: THREE.Object3D): void {
        this.viewRenderManager?.bloomIgnoreObjects.delete(object);
    }

    private m_translucentLayerEffect?: TranslucentLayerEffect;

    addTranslucentObject(object: THREE.Object3D, layer: string): void {
        this.m_translucentLayerEffect?.addObject(object, layer);
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as any;
            if (mat && !mat.userData?.__translucentLayerId) {
                mat.userData = mat.userData || {};
                mat.userData.__translucentLayerId = layer;
                this.rebuildMrtNode(mat);
            }
        });
    }
    removeTranslucentObject(object: THREE.Object3D): void {
        this.m_translucentLayerEffect?.removeObject(object);
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as any;
            if (mat?.userData?.__translucentLayerId) {
                delete mat.userData.__translucentLayerId;
                this.rebuildMrtNode(mat);
            }
        });
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
        return this.viewRenderManager?.readDepth(ndc) ?? null;
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
