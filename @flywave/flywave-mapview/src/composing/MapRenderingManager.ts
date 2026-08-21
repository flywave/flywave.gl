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
    EffectComposer,
    EffectPass,
    OutlineEffect as PPOutlineEffect,
    RenderPass,
    SelectiveBloomEffect,
    SepiaEffect,
    Effect,
    VignetteEffect
} from "postprocessing";
import * as THREE from "three";

import { IPassManager } from "./IPassManager";
import { LowResEffect } from "./LowResRenderPass";
import { SunGodRaysEffect } from "./SunGodRaysEffect";

interface IEnabledEffect extends Effect {
    enabled?: boolean;
}

class FilterEffectPass extends EffectPass {
    private rootEffects: IEnabledEffect[];
    private currentEffects: IEnabledEffect[];

    constructor(camera?: THREE.Camera, ...effects: IEnabledEffect[]) {
        super(camera, ...effects);
        this.rootEffects = effects;
        this.currentEffects = effects;
    }
    render(
        renderer: THREE.WebGLRenderer,
        inputBuffer: THREE.WebGLRenderTarget | null,
        outputBuffer: THREE.WebGLRenderTarget | null,
        deltaTime?: number,
        stencilTest?: boolean
    ): void {
        let effects = this.rootEffects.filter(effect => effect.enabled);
        if (effects.length != this.currentEffects.length) {
            this.currentEffects = effects;
            this.setEffects(effects);
            this.updateMaterial();
        }
        super.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest);
    }
}

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
        strength: 2.5,
        radius: 0.7,
        threshold: 0.15,
        levels: 5,
        smoothing: 0.1,
        luminancePassEnabled: false,
        luminancePassThreshold: 0.0,
        luminancePassSmoothing: 0.1
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
    private m_bloomEffect?: SelectiveBloomEffect & IEnabledEffect;
    private m_outlineEffect?: PPOutlineEffect & IEnabledEffect;
    private m_vignetteEffect?: VignetteEffect & IEnabledEffect;
    private m_sepiaEffect?: SepiaEffect & IEnabledEffect;
    private m_sunGodRaysEffect?: SunGodRaysEffect;

    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;
    private m_lensSunPosition: THREE.Vector3 = new THREE.Vector3();

    private m_lowResPixelRatio?: number;
    private m_anyEffectEnabled = false;
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

    private initializeEffects() {
        if (!this.m_renderer || !this.m_scene || !this.m_camera) {
            return;
        }

        // Initialize composer and main render pass
        this.m_composer = new EffectComposer(this.m_renderer, {
            multisampling: this.m_dynamicMsaaSamplingLevel,
            stencilBuffer: true
        });
        this.m_mainRenderPass = new RenderPass(this.m_scene, this.m_camera);
        this.m_composer.addPass(this.m_mainRenderPass);

        // Initialize all possible effects (but don't enable them yet)
        this.m_bloomEffect = new SelectiveBloomEffect(this.m_scene, this.m_camera, {
            blendFunction: BlendFunction.SCREEN,
            intensity: this.bloom.strength,
            radius: this.bloom.radius,
            mipmapBlur: false,
            luminanceThreshold: this.bloom.threshold,
            luminanceSmoothing: this.bloom.smoothing
        });
        this.m_bloomEffect.luminancePass.enabled = true;
        // this.m_bloomEffect.ignoreBackground = true;
        this.m_bloomEffect.inverted = true;
        // this.m_bloomEffect.blendMode.blendFunction = BlendFunction.ADD;

        this.m_outlineEffect = new PPOutlineEffect(this.m_scene, this.m_camera, {
            edgeStrength: this.outline.thickness * 100,
            pulseSpeed: 0.0,
            visibleEdgeColor: new THREE.Color(this.outline.color).getHex(),
            hiddenEdgeColor: new THREE.Color(0x000000).getHex(),
            blur: false,
            xRay: this.outline.ghostExtrudedPolygons
        });

        this.m_vignetteEffect = new VignetteEffect({
            darkness: this.vignette.darkness,
            offset: this.vignette.offset
        });

        this.m_sepiaEffect = new SepiaEffect({
            intensity: this.sepia.amount
        });

        if (this.sunGodRays.enabled) {
            this.m_sunGodRaysEffect = new SunGodRaysEffect(this.m_camera, this.sunGodRays);
        }

        if (this.m_lowResPixelRatio !== undefined) {
            this.m_lowResEffect = new LowResEffect(this.m_lowResPixelRatio);
        }

        this.m_effectPass = new FilterEffectPass(
            this.m_camera,
            this.m_bloomEffect,
            this.m_outlineEffect,
            this.m_vignetteEffect,
            this.m_sepiaEffect
        );
        this.m_composer.addPass(this.m_effectPass);
    }

    updateOutline(options: { thickness: number; color: string; ghostExtrudedPolygons: boolean }) {
        this.outline.color = options.color;
        this.outline.thickness = options.thickness;
        this.outline.ghostExtrudedPolygons = options.ghostExtrudedPolygons;
        this.outline.needsUpdate = true;
    }

    updateSunPosition(position: THREE.Vector3): void {
        this.m_lensSunPosition.copy(position);
        if (this.m_sunGodRaysEffect) {
            this.m_sunGodRaysEffect.lightPosition.copy(position);
        }
    }

    private updateEffects() {
        // First ensure all effects are initialized
        if (
            !this.m_bloomEffect ||
            !this.m_outlineEffect ||
            !this.m_vignetteEffect ||
            !this.m_sepiaEffect
        ) {
            this.initializeEffects();
        }

        // Collect active effects based on current configuration

        // Bloom effect
        if (this.bloom.enabled && this.m_bloomEffect) {
            this.m_bloomEffect.enabled = true;
            this.updateBloomOptions();
        } else if (this.m_bloomEffect) {
            this.m_bloomEffect.enabled = false;
        }

        // Outline effect
        if (this.outline.enabled && this.m_outlineEffect) {
            this.m_outlineEffect.enabled = true;
        } else if (this.m_outlineEffect) {
            this.m_outlineEffect.enabled = false;
        }

        // Vignette effect
        if (this.vignette.enabled && this.m_vignetteEffect) {
            this.m_vignetteEffect.enabled = true;
        } else if (this.m_vignetteEffect) {
            this.m_vignetteEffect.enabled = false;
            this.m_vignetteEffect.offset = this.vignette.offset;
            this.m_vignetteEffect.darkness = this.vignette.darkness;
        }

        // Sepia effect
        if (this.sepia.enabled && this.m_sepiaEffect) {
            this.m_sepiaEffect.enabled = true;
            this.m_sepiaEffect.intensity = this.sepia.amount;
        } else if (this.m_sepiaEffect) {
            this.m_sepiaEffect.enabled = false;
        }

        // Sun God Rays Effect
        if (this.sunGodRays.enabled && this.m_sunGodRaysEffect) {
            this.m_sunGodRaysEffect.enabled = true;
        }

        // Low resolution effect
        if (this.m_lowResPixelRatio !== undefined && this.m_lowResEffect) {
        }

        if (this.m_msaaEnabled) {
            this.m_composer.multisampling = this.m_staticMsaaSamplingLevel || 2;
        }

        this.m_composer.setSize(this.m_width, this.m_height);
        this.m_anyEffectEnabled = Boolean(
            (this.bloom.enabled && this.m_bloomEffect && this.m_bloomEffect.enabled)
            || (this.outline.enabled && this.m_outlineEffect && this.m_outlineEffect.enabled)
            || (this.vignette.enabled && this.m_vignetteEffect && this.m_vignetteEffect.enabled)
            || (this.sepia.enabled && this.m_sepiaEffect && this.m_sepiaEffect.enabled)
            || (this.sunGodRays.enabled && this.m_sunGodRaysEffect && this.m_sunGodRaysEffect.enabled)
        );
    }

    private updateBloomOptions(): void {
        if (this.m_bloomEffect) {
            this.m_bloomEffect.intensity = this.bloom.strength;
            this.m_bloomEffect.mipmapBlurPass.radius = this.bloom.radius;
            this.m_bloomEffect.mipmapBlurPass.levels = this.bloom.levels ?? 1;
            this.m_bloomEffect.luminanceMaterial.threshold = this.bloom.threshold;
            this.m_bloomEffect.luminanceMaterial.smoothing =
                this.bloom.luminancePassSmoothing || 0.1;
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

        this.updateEffects();

        // The postprocessing composer is pure overhead when no effect is
        // enabled — and its render path empirically drops engine-external
        // scene meshes (the mbstyle terrain mesh renders in the direct path
        // but not through the composer). Bypass it when idle.
        if (this.m_composer && this.m_anyEffectEnabled) {
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
        }
    }
}
