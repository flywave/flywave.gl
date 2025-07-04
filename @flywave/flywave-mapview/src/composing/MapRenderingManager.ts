/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    IBloomEffect,
    IOutlineEffect,
    ISepiaEffect,
    IVignetteEffect
} from "@flywave/flywave-datasource-protocol";
import {
    BlendFunction,
    EdgeDetectionMode,
    EffectComposer,
    EffectPass,
    OutlineEffect as PPOutlineEffect,
    PredicationMode,
    RenderPass,
    SMAAEffect,
    SMAAPreset,
    SelectiveBloomEffect,
    SepiaEffect,
    VignetteEffect
} from "postprocessing";
import * as THREE from "three";

import { IPassManager } from "./IPassManager";
import { LowResEffect } from "./LowResRenderPass";
import { SunGodRaysEffect } from "./SunGodRaysEffect";

// 保持原有的 MSAASampling 枚举兼容性
enum MSAASampling {
    Level_0 = 0,
    Level_1 = 1,
    Level_2 = 2,
    Level_4 = 4,
    Level_8 = 8
}
// 定义默认的MSAA采样级别
const DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_1;
const DEFAULT_STATIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_4;

export interface IMapAntialiasSettings {
    msaaEnabled: boolean;
    dynamicMsaaSamplingLevel?: MSAASampling;
    staticMsaaSamplingLevel?: MSAASampling;
}

interface ILensFlareEffect {
    enabled: boolean;
}

export interface IMapRenderingManager extends IPassManager {
    bloom: IBloomEffect;
    outline: IOutlineEffect;
    vignette: IVignetteEffect;
    sepia: ISepiaEffect;
    sunGodRaysEffect?: SunGodRaysEffect;
    lensFlare: ILensFlareEffect;
    dynamicMsaaSamplingLevel: MSAASampling;
    msaaEnabled: boolean;
    staticMsaaSamplingLevel: MSAASampling;

    render(
        renderer: THREE.WebGLRenderer,
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

    updateSunPosition(position: THREE.Vector3): void;

    lowResPixelRatio?: number;
}

export class MapRenderingManager implements IMapRenderingManager {
    bloom = {
        enabled: false,
        strength: 4.5, // default intensity
        radius: 0.7, // default mipmapBlurPass.radius
        threshold: 0.85, // default luminanceMaterial.threshold
        levels: 5, // typical default for mipmapBlurPass.levels
        smoothing: 0.1, // typical default for luminanceMaterial.smoothing
        luminancePassEnabled: false, // as set in MapRenderingManager (luminancePass.enabled = false)
        luminancePassThreshold: 0.0, // as set in MapRenderingManager (luminanceMaterial.threshold = 0.0)
        luminancePassSmoothing: 0.1 // as set in MapRenderingManager (luminanceMaterial.smoothing = 0.1)
    };

    lensFlare = {
        enabled: false
    };

    outline = {
        enabled: false,
        thickness: 0.005,
        color: "#000000",
        ghostExtrudedPolygons: false,
        needsUpdate: false
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

    sunGodRays = {
        enabled: false,
        samples: 60,
        density: 0.96,
        decay: 0.9,
        weight: 0.4,
        exposure: 0.6,
        clampMax: 1.0,
        blur: true,
        resolutionScale: 0.5
    };

    private m_msaaEnabled: boolean = true;

    private m_width: number = 1;
    private m_height: number = 1;
    private m_renderer?: THREE.WebGLRenderer;
    private m_scene?: THREE.Scene;
    private m_camera?: THREE.PerspectiveCamera | THREE.OrthographicCamera;

    private m_composer?: EffectComposer;
    private m_mainRenderPass?: RenderPass;
    private m_effectPass?: EffectPass;
    private m_bloomEffect?: SelectiveBloomEffect;
    private m_outlineEffect?: PPOutlineEffect;
    private m_vignetteEffect?: VignetteEffect;
    private m_sepiaEffect?: SepiaEffect;
    private m_antialiasEffect?: SMAAEffect;
    private m_sunGodRaysEffect?: SunGodRaysEffect;

    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;
    private m_lensSunPosition: THREE.Vector3 = new THREE.Vector3();

    private m_lowResPixelRatio?: number;

    private m_lowResEffect?: LowResEffect;

    constructor(
        width: number,
        height: number,
        lowResPixelRatio: number | undefined,
        antialiasSettings: IMapAntialiasSettings | undefined = { msaaEnabled: false }
    ) {
        this.m_dynamicMsaaSamplingLevel =
            antialiasSettings?.dynamicMsaaSamplingLevel ?? DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL;
        this.m_staticMsaaSamplingLevel =
            antialiasSettings?.staticMsaaSamplingLevel ?? DEFAULT_STATIC_MSAA_SAMPLING_LEVEL;
        this.msaaEnabled = antialiasSettings?.msaaEnabled ?? false;
        this.lowResPixelRatio = lowResPixelRatio;
        this.setSize(width, height);
    }

    updateOutline(options: { thickness: number; color: string; ghostExtrudedPolygons: boolean }) {
        this.outline.color = options.color;
        this.outline.thickness = options.thickness;
        this.outline.ghostExtrudedPolygons = options.ghostExtrudedPolygons;
        this.outline.needsUpdate = true;
    }

    updateSunPosition(position: THREE.Vector3): void {
        this.m_lensSunPosition.copy(position);
    }

    private setupEffects(
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean = false
    ) {
        if (!this.m_renderer || !this.m_scene || !this.m_camera) return;

        this.m_composer?.dispose();
        this.m_composer = new EffectComposer(this.m_renderer, {
            stencilBuffer: true
        });

        // Create effects
        const effects = [];

        // Main render pass
        this.m_mainRenderPass = new RenderPass(this.m_scene, this.m_camera);
        this.m_composer.addPass(this.m_mainRenderPass);

        // Bloom effect (参数已更新为6.37.5版本)
        if (this.bloom.enabled) {
            this.m_bloomEffect = new SelectiveBloomEffect(scene, camera, {
                blendFunction: BlendFunction.ADD,
                intensity: this.bloom.strength,
                radius: this.bloom.radius,
                luminanceThreshold: this.bloom.threshold,
                luminanceSmoothing: this.bloom.smoothing
            });

            this.m_bloomEffect.luminancePass.enabled = this.bloom.luminancePassEnabled;
            this.m_bloomEffect.ignoreBackground = true;
            this.m_bloomEffect.inverted = true;

            effects.push(this.m_bloomEffect);
        }

        // Outline effect (参数已更新为6.37.5版本)
        if (this.outline.enabled) {
            this.m_outlineEffect = new PPOutlineEffect(this.m_scene, this.m_camera, {
                edgeStrength: this.outline.thickness * 100,
                pulseSpeed: 0.0,
                visibleEdgeColor: new THREE.Color(this.outline.color).getHex(),
                hiddenEdgeColor: new THREE.Color(0x000000).getHex(),
                blur: false,
                xRay: this.outline.ghostExtrudedPolygons
            });
            effects.push(this.m_outlineEffect);
        }

        // Vignette effect
        if (this.vignette.enabled) {
            this.m_vignetteEffect = new VignetteEffect({
                darkness: this.vignette.darkness,
                offset: this.vignette.offset
            });
            effects.push(this.m_vignetteEffect);
        }

        // Sepia effect
        if (this.sepia.enabled) {
            this.m_sepiaEffect = new SepiaEffect({
                intensity: this.sepia.amount
            });
            effects.push(this.m_sepiaEffect);
        }

        if (this.m_msaaEnabled) {
            this.m_antialiasEffect = new SMAAEffect({
                preset: this.getSMAAPreset(
                    isStaticFrame ? this.staticMsaaSamplingLevel : this.dynamicMsaaSamplingLevel
                ),
                edgeDetectionMode: EdgeDetectionMode.COLOR,
                predicationMode: PredicationMode.DEPTH
            });
            const edgeDetectionMaterial = this.m_antialiasEffect.edgeDetectionMaterial;
            edgeDetectionMaterial.edgeDetectionThreshold = 0.02;
            edgeDetectionMaterial.predicationThreshold = 0.002;
            edgeDetectionMaterial.predicationScale = 1;
            effects.push(this.m_antialiasEffect);
        }

        // Sun God Rays Effect
        if (this.sunGodRays.enabled) {
            if (!this.m_sunGodRaysEffect)
                this.m_sunGodRaysEffect = new SunGodRaysEffect(this.m_camera, this.sunGodRays);
            effects.push(this.m_sunGodRaysEffect);
        }

        // 设置低分辨率效果
        if (this.m_lowResPixelRatio !== undefined) {
            this.m_lowResEffect = new LowResEffect(this.m_lowResPixelRatio);
            effects.push(this.m_lowResEffect);
        }

        if (effects.length > 0) {
            this.m_effectPass = new EffectPass(this.m_camera, ...effects);
            this.m_composer.addPass(this.m_effectPass);
        }

        this.m_composer.setSize(this.m_width, this.m_height);
    }

    // Add a method to update bloom settings
    setBloomOptions(settings: Partial<IBloomEffect>): void {
        Object.assign(this.bloom, settings);

        if (this.m_bloomEffect) {
            this.m_bloomEffect.intensity = this.bloom.strength;
            this.m_bloomEffect.mipmapBlurPass.radius = this.bloom.radius;
            this.m_bloomEffect.mipmapBlurPass.levels = this.bloom.levels ?? 5;
            this.m_bloomEffect.luminancePass.enabled = this.bloom.luminancePassEnabled;
            this.m_bloomEffect.luminanceMaterial.threshold = this.bloom.luminancePassThreshold;
            this.m_bloomEffect.luminanceMaterial.smoothing = this.bloom.luminancePassSmoothing;
        }

        // Recreate effects if bloom was toggled
        if (settings.enabled !== undefined && this.m_scene && this.m_camera) {
            this.setupEffects(this.m_scene, this.m_camera);
        }
    }

    private getSMAAPreset(samplingLevel: MSAASampling): SMAAPreset {
        // SMAA预设映射
        switch (samplingLevel) {
            case MSAASampling.Level_1:
                return SMAAPreset.LOW;
            case MSAASampling.Level_2:
                return SMAAPreset.MEDIUM;
            case MSAASampling.Level_4:
                return SMAAPreset.HIGH;
            case MSAASampling.Level_8:
                return SMAAPreset.ULTRA;
            default:
                return SMAAPreset.LOW;
        }
    }

    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean
    ) {
        this.m_renderer = renderer;
        this.m_scene = scene;
        this.m_camera = camera;

        if (!this.m_composer || this.outline.needsUpdate) {
            this.setupEffects(scene, camera, isStaticFrame);
            this.outline.needsUpdate = false;
        }

        if (this.m_composer) {
            this.m_composer.render();
        } else {
            renderer.render(scene, camera);
        }
    }

    setSize(width: number, height: number) {
        this.m_width = width;
        this.m_height = height;

        this.m_composer?.setSize(width, height);
    }

    get sunGodRaysEffect(): SunGodRaysEffect | undefined {
        return this.m_sunGodRaysEffect;
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
        if (this.m_lowResPixelRatio !== pixelRatio) {
            this.m_lowResPixelRatio = pixelRatio;
            if (this.m_lowResEffect) {
                this.m_lowResEffect.pixelRatio = pixelRatio;
            }
            if (this.m_width && this.m_height) {
            }
        }
    }
}
