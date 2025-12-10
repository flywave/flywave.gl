/* Copyright (C) 2025 flywave.gl contributors */

import {
    type IBloomEffect,
    type IBrightnessContrastEffect,
    type IHueSaturationEffect,
    type IOutlineEffect,
    type ISepiaEffect,
    type ISSAOEffect,
    type IVignetteEffect
} from "@flywave/flywave-datasource-protocol";
import {
    type Effect,
    BlendFunction,
    BrightnessContrastEffect,
    OutlineEffect,
    EdgeDetectionMode,
    EffectComposer,
    EffectPass,
    FXAAEffect,
    HueSaturationEffect,
    NormalPass,
    PredicationMode,
    RenderPass, 
    SepiaEffect,
    SMAAEffect,
    SMAAPreset,
    SSAOEffect,
    VignetteEffect
} from "postprocessing";
import * as THREE from "three";

import { SelectiveBloomEffect } from "./SelectiveBloomEffect";

import { type IPassManager } from "./IPassManager";
import { LowResEffect } from "./LowResRenderPass";
import { TranslucentDepthEffect } from "./TranslucentDepthEffect";
import { DepthPickingWithStencilPass } from "./StencilDepthPickingPass";

interface IEnabledEffect extends Effect {
    enabled?: boolean;
}

class FilterEffectPass extends EffectPass {
    private readonly rootEffects: IEnabledEffect[];
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
        const effects = this.rootEffects.filter(effect => effect.enabled);
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
    fxaaEnabled?: boolean;
    smaaEnabled?: boolean;
}

// 自定义效果接口
export interface ICustomEffect {
    id: string;
    effect: Effect & IEnabledEffect;
    enabled: boolean;
    order?: number; // 渲染顺序，数值越小越先执行
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
    translucentDepth: {
        mixFactor?: number;
        blendMode?: "mix" | "add" | "multiply" | "screen";
    };
    // 深度拾取相关配置
    depthPicking: {
        enabled: boolean;
        stencilRef?: number;
    };

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

    lowResPixelRatio?: number;

    addBloomObject(object: THREE.Object3D): void;

    removeBloomObject(object: THREE.Object3D): void;

    addIgnoreBloomObject(object: THREE.Object3D): void;

    removeIgnoreBloomObject(object: THREE.Object3D): void;

    // 新增方法：设置抗锯齿
    setAntialias(type: "none" | "fxaa" | "smaa"): void;

    addTranslucentDepthObject(object: THREE.Object3D): void;

    removeTranslucentDepthObject(object: THREE.Object3D): void;

    // 自定义效果管理方法
    addCustomEffect(customEffect: ICustomEffect): void;
    removeCustomEffect(effectId: string): boolean;
    getCustomEffect(effectId: string): ICustomEffect | undefined;
    setCustomEffectEnabled(effectId: string, enabled: boolean): boolean;
    updateCustomEffect(effectId: string, updater: (effect: Effect) => void): boolean;
    getAllCustomEffects(): ICustomEffect[];

    // 深度拾取相关方法
    setDepthPickingEnabled(enabled: boolean): void;
    setDepthPickingStencilRef(stencilRef: number): void;
    getDepthTexture(): THREE.Texture | null;
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): Promise<number | null>;
}

export class MapRenderingManager implements IMapRenderingManager {
    bloom = {
        enabled: false,
        strength: 2.5,
        radius: 0.67,
        levels: 3,
        inverted: false,
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

    // 添加SSAO效果的配置
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

    translucentDepth = {
        mixFactor: 0.4,
        blendMode: "mix" as "mix" | "add" | "multiply" | "screen"
    };

    // 深度拾取配置
    depthPicking = {
        enabled: false,
        stencilRef: 1
    };

    // 添加抗锯齿效果的配置
    fxaaEnabled: boolean = false;
    smaaEnabled: boolean = false;

    private m_msaaEnabled: boolean = true;
    private m_width: number = 1;
    private m_height: number = 1;
    private m_renderer?: THREE.WebGLRenderer;
    private m_scene?: THREE.Scene;
    private m_camera?: THREE.PerspectiveCamera | THREE.OrthographicCamera;

    private m_composer?: EffectComposer;
    private m_mainRenderPass?: RenderPass;
    private m_effectPass?: FilterEffectPass;
    private m_bloomEffect?: SelectiveBloomEffect & IEnabledEffect;
    private m_outlineEffect?: OutlineEffect & IEnabledEffect;
    private m_vignetteEffect?: VignetteEffect & IEnabledEffect;
    private m_sepiaEffect?: SepiaEffect & IEnabledEffect;
    private m_hueSaturationEffect?: HueSaturationEffect & IEnabledEffect;
    private m_brightnessContrastEffect?: BrightnessContrastEffect & IEnabledEffect;
    private m_fxaaEffect?: FXAAEffect & IEnabledEffect;
    private m_smaaEffect?: SMAAEffect & IEnabledEffect;
    private m_ssaoEffect?: SSAOEffect & IEnabledEffect;
    private m_normalPass?: NormalPass & IEnabledEffect;
    private m_translucentDepthEffect?: TranslucentDepthEffect & IEnabledEffect;
    private m_depthPickingPass?: DepthPickingWithStencilPass & IEnabledEffect;

    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;

    private m_lowResPixelRatio?: number;
    private m_lowResEffect?: LowResEffect;

    // 用于跟踪抗锯齿配置变化
    private m_lastFxaaEnabled: boolean = false;
    private m_lastSmaaEnabled: boolean = false;

    // 自定义效果存储
    private m_customEffects: Map<string, ICustomEffect> = new Map();

    // 用于跟踪临时对象
    private m_bloomObjects: THREE.Object3D[] = [];
    private m_ignoreObjects: THREE.Object3D[] = [];

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
        this.fxaaEnabled = antialiasSettings?.fxaaEnabled ?? false;
        this.smaaEnabled = antialiasSettings?.smaaEnabled ?? false;

        // 记录初始状态
        this.m_lastFxaaEnabled = this.fxaaEnabled;
        this.m_lastSmaaEnabled = this.smaaEnabled;

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
            stencilBuffer: true,
            depthBuffer: true
        });
        this.m_mainRenderPass = new RenderPass(this.m_scene, this.m_camera);
        this.m_composer.addPass(this.m_mainRenderPass);

        // 初始化深度拾取通道
        this.m_depthPickingPass = new DepthPickingWithStencilPass() as DepthPickingWithStencilPass & IEnabledEffect;
        this.m_depthPickingPass.enabled = this.depthPicking.enabled;
        this.m_composer.addPass(this.m_depthPickingPass);

        // 初始化NormalPass用于SSAO
        this.m_normalPass = new NormalPass(this.m_scene, this.m_camera) as NormalPass &
            IEnabledEffect;
        this.m_normalPass.enabled = false;

        // Initialize all possible effects (but don't enable them yet)
        this.m_bloomEffect = new SelectiveBloomEffect(this.m_scene, this.m_camera, {
            blendFunction: BlendFunction.SCREEN,
            intensity: this.bloom.strength,
            radius: this.bloom.radius,
            mipmapBlur: true,
            luminanceThreshold: this.bloom.luminancePassThreshold,
            luminanceSmoothing: this.bloom.luminancePassSmoothing
        });
        this.m_bloomEffect.luminancePass.enabled = true;
        this.m_bloomEffect.ignoreBackground = true;
        this.m_bloomEffect.inverted = this.bloom.inverted;
        this.m_bloomEffect.enabled = this.bloom.enabled; 

        this.m_vignetteEffect = new VignetteEffect({
            darkness: this.vignette.darkness,
            offset: this.vignette.offset
        });
        this.m_vignetteEffect.enabled = this.vignette.enabled;

        this.m_sepiaEffect = new SepiaEffect({
            intensity: this.sepia.amount
        });
        this.m_sepiaEffect.enabled = this.sepia.enabled;

        this.m_hueSaturationEffect = new HueSaturationEffect({
            hue: this.hueSaturation.hue,
            saturation: this.hueSaturation.saturation
        });
        this.m_hueSaturationEffect.enabled = this.hueSaturation.enabled;

        this.m_brightnessContrastEffect = new BrightnessContrastEffect({
            brightness: this.brightnessContrast.brightness,
            contrast: this.brightnessContrast.contrast
        });
        this.m_brightnessContrastEffect.enabled = this.brightnessContrast.enabled;

        this.m_outlineEffect = new OutlineEffect(this.m_scene, this.m_camera, {
            blendFunction: BlendFunction.SCREEN,
            patternScale: this.outline.thickness,
            edgeStrength: 1.0,
            pulseSpeed: 0.0,
            visibleEdgeColor: new THREE.Color(this.outline.color).getHex(),
            hiddenEdgeColor: new THREE.Color(this.outline.color).getHex(),
            xRay: !this.outline.ghostExtrudedPolygons
        });
        this.m_outlineEffect.enabled = this.outline.enabled;

        // 初始化SSAO效果
        this.m_ssaoEffect = new SSAOEffect(this.m_camera, this.m_normalPass.texture, {
            // 使用NormalPass的texture而不是scene
            blendFunction: BlendFunction.MULTIPLY,
            intensity: this.ssao.intensity,
            radius: this.ssao.radius,
            distanceThreshold: this.ssao.distanceThreshold,
            distanceFalloff: this.ssao.distanceFalloff,
            bias: this.ssao.bias,
            samples: this.ssao.samples,
            rings: this.ssao.rings
        }) as SSAOEffect & IEnabledEffect;

        this.m_ssaoEffect.enabled = this.ssao.enabled;

        // 初始化半透明深度效果
        this.m_translucentDepthEffect = new TranslucentDepthEffect(this.m_scene, this.m_camera, {
            blendFunction: BlendFunction.ADD,
            mixFactor: this.translucentDepth.mixFactor,
            blendMode: this.translucentDepth.blendMode
        }) as TranslucentDepthEffect & IEnabledEffect;
        this.m_translucentDepthEffect.enabled = true;

        // 初始化抗锯齿效果 - 修复 SMAA 配置
        this.m_fxaaEffect = new FXAAEffect() as FXAAEffect & IEnabledEffect;
        this.m_fxaaEffect.enabled = this.fxaaEnabled;

        // 修复 SMAA 配置 - 使用更明显的设置
        this.m_smaaEffect = new SMAAEffect({
            preset: SMAAPreset.ULTRA, // 使用 HIGH 预设以获得更明显的效果
            edgeDetectionMode: EdgeDetectionMode.LUMA,
            predicationMode: PredicationMode.DISABLED // 禁用预测以获得更一致的效果
        }) as SMAAEffect & IEnabledEffect;
        this.m_smaaEffect.enabled = this.smaaEnabled && !this.fxaaEnabled;

        if (this.m_lowResPixelRatio !== undefined) {
            this.m_lowResEffect = new LowResEffect(this.m_lowResPixelRatio);
        }

        // 创建效果通道
        this.recreateEffectPass();
    }

    private recreateEffectPass() {
        if (!this.m_composer || !this.m_camera) return;

        // 移除旧的效果通道
        if (this.m_effectPass) {
            this.m_composer.removePass(this.m_effectPass);
        }

        // 首先添加NormalPass到composer中（如果启用了SSAO）
        if (this.ssao.enabled && this.m_normalPass) {
            this.m_composer.addPass(this.m_normalPass);
        }

        // 创建所有效果的数组
        const allEffects: IEnabledEffect[] = [
            this.m_translucentDepthEffect!, // 半透明深度效果应该在早期应用
            this.m_bloomEffect!,
            this.m_outlineEffect!,
            this.m_vignetteEffect!,
            this.m_sepiaEffect!,
            this.m_hueSaturationEffect!,
            this.m_brightnessContrastEffect!,
            this.m_ssaoEffect! // 添加SSAO效果到效果数组
        ];

        // 添加自定义效果（按order排序）
        const customEffects = Array.from(this.m_customEffects.values())
            .filter(customEffect => customEffect.enabled)
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
            .map(customEffect => customEffect.effect);

        allEffects.push(...customEffects);

        // 重要：抗锯齿效果应该放在最后（后处理链的末端）
        // 根据设置添加抗锯齿效果（注意：FXAA 和 SMAA 不能同时启用）
        if (this.fxaaEnabled && this.m_fxaaEffect) {
            console.log("Adding FXAA effect to render pipeline");
            allEffects.push(this.m_fxaaEffect);
        } else if (this.smaaEnabled && this.m_smaaEffect) {
            console.log("Adding SMAA effect to render pipeline");
            allEffects.push(this.m_smaaEffect);
        } else {
            console.log("No antialiasing effect enabled");
        }

        // 添加低分辨率效果（如果有）- 应该在抗锯齿之前
        if (this.m_lowResEffect) {
            allEffects.push(this.m_lowResEffect);
        }

        this.m_effectPass = new FilterEffectPass(this.m_camera, ...allEffects);
        this.m_composer.addPass(this.m_effectPass);

        // 更新记录的状态
        this.m_lastFxaaEnabled = this.fxaaEnabled;
        this.m_lastSmaaEnabled = this.smaaEnabled;

        console.log(`Effect pass recreated with ${allEffects.length} effects (${customEffects.length} custom)`);
    }

    private updateEffects() {
        // First ensure all effects are initialized
        if (
            !this.m_bloomEffect ||
            !this.m_outlineEffect ||
            !this.m_vignetteEffect ||
            !this.m_sepiaEffect ||
            !this.m_hueSaturationEffect ||
            !this.m_brightnessContrastEffect ||
            !this.m_fxaaEffect ||
            !this.m_smaaEffect ||
            !this.m_ssaoEffect ||
            !this.m_normalPass || // 添加NormalPass检查
            !this.m_translucentDepthEffect || // 添加半透明深度效果检查
            !this.m_depthPickingPass // 添加深度拾取通道检查
        ) {
            this.initializeEffects();
            return;
        }

        // 检查抗锯齿配置是否发生变化
        const antialiasConfigChanged =
            this.m_lastFxaaEnabled !== this.fxaaEnabled ||
            this.m_lastSmaaEnabled !== this.smaaEnabled;

        // 检查自定义效果是否有变化
        const customEffectsChanged = Array.from(this.m_customEffects.values()).some(
            customEffect => customEffect.effect.enabled !== customEffect.enabled
        );

        // 更新深度拾取通道
        if (this.m_depthPickingPass) {
            this.m_depthPickingPass.enabled = this.depthPicking.enabled;

            // 更新模板参考值
            if (this.depthPicking.stencilRef !== undefined) {
                this.m_depthPickingPass.setStencilRef(this.depthPicking.stencilRef);
            }
        }

        // 半透明深度效果 - 始终启用
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.enabled = true; // 始终启用
            this.m_translucentDepthEffect.mixFactor = this.translucentDepth.mixFactor ?? 0.7;
            if (this.translucentDepth.blendMode) {
                this.m_translucentDepthEffect.setBlendMode(this.translucentDepth.blendMode);
            }
        }

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
            this.m_outlineEffect.patternScale = this.outline.thickness;
            this.m_outlineEffect.visibleEdgeColor = new THREE.Color(this.outline.color);
            this.m_outlineEffect.hiddenEdgeColor = new THREE.Color(this.outline.color);
            this.m_outlineEffect.xRay = !this.outline.ghostExtrudedPolygons;
        } else if (this.m_outlineEffect) {
            this.m_outlineEffect.enabled = false;
        }

        // Vignette effect
        if (this.vignette.enabled && this.m_vignetteEffect) {
            this.m_vignetteEffect.enabled = true;
            this.m_vignetteEffect.offset = this.vignette.offset;
            this.m_vignetteEffect.darkness = this.vignette.darkness;
        } else if (this.m_vignetteEffect) {
            this.m_vignetteEffect.enabled = false;
        }

        // Sepia effect
        if (this.sepia.enabled && this.m_sepiaEffect) {
            this.m_sepiaEffect.enabled = true;
            this.m_sepiaEffect.intensity = this.sepia.amount;
        } else if (this.m_sepiaEffect) {
            this.m_sepiaEffect.enabled = false;
        }

        // Hue/Saturation effect
        if (this.hueSaturation.enabled && this.m_hueSaturationEffect) {
            this.m_hueSaturationEffect.enabled = true;
            this.m_hueSaturationEffect.hue = this.hueSaturation.hue;
            this.m_hueSaturationEffect.saturation = this.hueSaturation.saturation;
        } else if (this.m_hueSaturationEffect) {
            this.m_hueSaturationEffect.enabled = false;
        }

        // Brightness/Contrast effect
        if (this.brightnessContrast.enabled && this.m_brightnessContrastEffect) {
            this.m_brightnessContrastEffect.enabled = true;
            this.m_brightnessContrastEffect.brightness = this.brightnessContrast.brightness;
            this.m_brightnessContrastEffect.contrast = this.brightnessContrast.contrast;
        } else if (this.m_brightnessContrastEffect) {
            this.m_brightnessContrastEffect.enabled = false;
        }

        // SSAO effect
        if (this.ssao.enabled && this.m_ssaoEffect) {
            this.m_ssaoEffect.enabled = true;
            this.m_normalPass.enabled = true; // 启用NormalPass

            // 更新SSAO参数
            if (this.m_ssaoEffect.ssaoMaterial) {
                this.m_ssaoEffect.ssaoMaterial.intensity = this.ssao.intensity;
                this.m_ssaoEffect.ssaoMaterial.radius = this.ssao.radius;
                this.m_ssaoEffect.ssaoMaterial.distanceThreshold = this.ssao.distanceThreshold;
                this.m_ssaoEffect.ssaoMaterial.distanceFalloff = this.ssao.distanceFalloff;
                this.m_ssaoEffect.ssaoMaterial.bias = this.ssao.bias;
            }
        } else if (this.m_ssaoEffect) {
            this.m_ssaoEffect.enabled = false;
            this.m_normalPass.enabled = false; // 禁用NormalPass
        }

        // 更新自定义效果
        this.m_customEffects.forEach(customEffect => {
            customEffect.effect.enabled = customEffect.enabled;
        });

        // FXAA effect
        if (this.m_fxaaEffect) {
            this.m_fxaaEffect.enabled = this.fxaaEnabled;
        }

        // SMAA effect - 与 FXAA 互斥
        if (this.m_smaaEffect) {
            this.m_smaaEffect.enabled = this.smaaEnabled && !this.fxaaEnabled;
        }

        // Low resolution effect
        if (this.m_lowResPixelRatio !== undefined && this.m_lowResEffect) {
            // 低分辨率效果的处理
        }

        // 更新 MSAA 设置
        if (this.m_composer) {
            if (this.m_msaaEnabled) {
                this.m_composer.multisampling = this.m_staticMsaaSamplingLevel || 2;
            } else {
                this.m_composer.multisampling = 0;
            }
        }

        // 如果抗锯齿配置或自定义效果发生变化，需要重新创建效果通道
        if (antialiasConfigChanged || customEffectsChanged) {
            this.recreateEffectPass();
        }

        this.m_composer?.setSize(this.m_width, this.m_height);
    }

    // 深度拾取相关方法
    setDepthPickingEnabled(enabled: boolean): void {
        this.depthPicking.enabled = enabled;
        if (this.m_depthPickingPass) {
            this.m_depthPickingPass.enabled = enabled;
        }
    }

    setDepthPickingStencilRef(stencilRef: number): void {
        this.depthPicking.stencilRef = stencilRef;
        if (this.m_depthPickingPass) {
            this.m_depthPickingPass.setStencilRef(stencilRef);
        }
    }

    getDepthTexture(): THREE.Texture | null {
        if (this.m_depthPickingPass && this.depthPicking.enabled) {
            return this.m_depthPickingPass.getDepthTexture();
        }
        return null;
    }

    // 新增方法：设置抗锯齿类型
    setAntialias(type: "none" | "fxaa" | "smaa"): void {
        const oldFxaa = this.fxaaEnabled;
        const oldSmaa = this.smaaEnabled;

        this.fxaaEnabled = type === "fxaa";
        this.smaaEnabled = type === "smaa";

        console.log(`Setting antialias: ${type}`, {
            old: { fxaa: oldFxaa, smaa: oldSmaa },
            new: { fxaa: this.fxaaEnabled, smaa: this.smaaEnabled }
        });

        // 强制重新创建效果通道
        if (this.m_composer) {
            this.recreateEffectPass();
            this.m_composer.setSize(this.m_width, this.m_height);
        }
    }

    // 自定义效果管理方法
    addCustomEffect(customEffect: ICustomEffect): void {
        if (this.m_customEffects.has(customEffect.id)) {
            console.warn(`Custom effect with id '${customEffect.id}' already exists. It will be replaced.`);
        }

        this.m_customEffects.set(customEffect.id, customEffect);
        console.log(`Added custom effect: ${customEffect.id}`);

        // 重新创建效果通道以包含新的自定义效果
        if (this.m_composer) {
            this.recreateEffectPass();
        }
    }

    removeCustomEffect(effectId: string): boolean {
        const removed = this.m_customEffects.delete(effectId);
        if (removed) {
            console.log(`Removed custom effect: ${effectId}`);

            // 重新创建效果通道以移除自定义效果
            if (this.m_composer) {
                this.recreateEffectPass();
            }
        } else {
            console.warn(`Custom effect with id '${effectId}' not found.`);
        }
        return removed;
    }

    getCustomEffect(effectId: string): ICustomEffect | undefined {
        return this.m_customEffects.get(effectId);
    }

    setCustomEffectEnabled(effectId: string, enabled: boolean): boolean {
        const customEffect = this.m_customEffects.get(effectId);
        if (customEffect) {
            const changed = customEffect.enabled !== enabled;
            customEffect.enabled = enabled;

            if (changed && this.m_composer) {
                this.recreateEffectPass();
            }

            return true;
        }
        return false;
    }

    updateCustomEffect(effectId: string, updater: (effect: Effect) => void): boolean {
        const customEffect = this.m_customEffects.get(effectId);
        if (customEffect) {
            updater(customEffect.effect);
            return true;
        }
        return false;
    }

    getAllCustomEffects(): ICustomEffect[] {
        return Array.from(this.m_customEffects.values());
    }

    updateOutline(options: { thickness: number; color: string; ghostExtrudedPolygons: boolean }) {
        this.outline.thickness = options.thickness;
        this.outline.color = options.color;
        this.outline.ghostExtrudedPolygons = options.ghostExtrudedPolygons;
        
        if (this.m_outlineEffect) {
            this.m_outlineEffect.patternScale = options.thickness;
            this.m_outlineEffect.visibleEdgeColor = new THREE.Color(options.color);
            this.m_outlineEffect.hiddenEdgeColor = new THREE.Color(options.color);
            this.m_outlineEffect.xRay = !options.ghostExtrudedPolygons;
        }
    }

    private updateBloomOptions(): void {
        if (this.m_bloomEffect) {
            this.m_bloomEffect.intensity = this.bloom.strength;
            this.m_bloomEffect.mipmapBlurPass.enabled = true;
            this.m_bloomEffect.mipmapBlurPass.radius = this.bloom.radius;
            this.m_bloomEffect.mipmapBlurPass.levels = this.bloom.levels || 1;
            this.m_bloomEffect.ignoreBackground = true;

            this.m_bloomEffect.inverted = this.bloom.inverted;
            this.m_bloomEffect.luminancePass.enabled = true;
            this.m_bloomEffect.luminanceMaterial.threshold = this.bloom.luminancePassThreshold;

            this.m_bloomEffect.luminanceMaterial.smoothing =
                this.bloom.luminancePassSmoothing ?? 0.1;

            this.m_bloomEffect!.selection.clear();
            this.m_bloomObjects.forEach(item => this.m_bloomEffect!.selection.add(item));

            if (this.bloom.inverted) {
                this.m_ignoreObjects.forEach(item => this.m_bloomEffect!.selection.add(item));
            } else {
                this.m_ignoreObjects.forEach(item => this.m_bloomEffect!.selection.delete(item));
            }
        }
    }

    addBloomObject(object: THREE.Object3D): void {
        if (this.m_bloomEffect) {
            this.m_bloomEffect.selection.add(object);
        }
        this.m_bloomObjects.push(object);
    }

    removeBloomObject(object: THREE.Object3D): void {
        if (this.m_bloomEffect) {
            this.m_bloomEffect.selection.delete(object);
        }
        this.m_bloomObjects = this.m_bloomObjects.filter(item => item !== object);
    }

    addIgnoreBloomObject(object: THREE.Object3D): void {
        this.m_ignoreObjects.push(object);
    }

    removeIgnoreBloomObject(object: THREE.Object3D): void {
        this.m_ignoreObjects = this.m_ignoreObjects.filter(item => item !== object);
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

        if (this.m_composer) {
            try {
                this.m_composer.render();
            } catch (error) {
                console.error("Error rendering with EffectComposer:", error);
                console.error("Falling back to normal rendering");
                // 如果EffectComposer渲染失败，回退到普通渲染
                renderer.render(scene, camera);
            }
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

    readDepth(ndc: THREE.Vector2 | THREE.Vector3): Promise<number> | null {
        return this.m_depthPickingPass?.readDepth(ndc) ?? null;
    }

    // 新增方法：获取半透明深度效果的选择对象
    getTranslucentDepthSelection() {
        return this.m_translucentDepthEffect?.selection;
    }

    // 新增方法：添加半透明深度效果的对象
    addTranslucentDepthObject(object: THREE.Object3D): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.selection.add(object);
        }
    }

    // 新增方法：移除半透明深度效果的对象
    removeTranslucentDepthObject(object: THREE.Object3D): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.selection.delete(object);
        }
    }
}