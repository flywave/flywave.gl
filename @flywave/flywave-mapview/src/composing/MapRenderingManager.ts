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
import { TranslucentLayerEffect } from "./TranslucentDepthEffect";
import { DepthPickingWithStencilPass } from "./StencilDepthPickingPass";

// Interface for effects that can be enabled/disabled
interface IEnabledEffect extends Effect {
    enabled?: boolean;
}

// Custom effect pass that filters enabled effects
class FilterEffectPass extends EffectPass {
    private readonly rootEffects: IEnabledEffect[];
    private currentEffects: IEnabledEffect[];

    /**
     * Constructor for FilterEffectPass
     * @param camera - Camera used for rendering
     * @param effects - Effects to be managed by this pass
     */
    constructor(camera?: THREE.Camera, ...effects: IEnabledEffect[]) {
        super(camera, ...effects);
        this.rootEffects = effects;
        this.currentEffects = effects;
    }

    /**
     * Render method that filters enabled effects before rendering
     * @param renderer - WebGL renderer
     * @param inputBuffer - Input render target
     * @param outputBuffer - Output render target
     * @param deltaTime - Time delta for animations
     * @param stencilTest - Whether to perform stencil test
     */
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

// MSAA sampling levels for anti-aliasing
enum MSAASampling {
    Level_0 = 0,
    Level_1 = 1,
    Level_2 = 2,
    Level_4 = 4,
    Level_8 = 8
}

// Default MSAA sampling levels
const DEFAULT_DYNAMIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_1;
const DEFAULT_STATIC_MSAA_SAMPLING_LEVEL = MSAASampling.Level_4;

// Anti-aliasing settings interface
export interface IMapAntialiasSettings {
    msaaEnabled: boolean;
    dynamicMsaaSamplingLevel?: MSAASampling;
    staticMsaaSamplingLevel?: MSAASampling;
    fxaaEnabled?: boolean;
    smaaEnabled?: boolean;
}

// Custom effect interface
export interface ICustomEffect {
    id: string;
    effect: Effect & IEnabledEffect;
    enabled: boolean;
    order?: number; // Rendering order, lower values are rendered first
}

// Main rendering manager interface
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
    // Depth picking related configuration
    depthPicking: {
        enabled: boolean;
        stencilRef?: number;
    };

    /**
     * Render the scene
     * @param renderer - WebGL renderer
     * @param scene - Scene to render
     * @param camera - Camera to use for rendering
     * @param isStaticFrame - Whether this is a static frame
     * @param time - Current time for animations
     */
    render(
        renderer: THREE.WebGLRenderer,
        scene: THREE.Scene,
        camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
        isStaticFrame: boolean,
        time?: number
    ): void;

    /**
     * Update outline effect options
     * @param options - Outline configuration options
     */
    updateOutline(options: {
        thickness: number;
        color: string;
        ghostExtrudedPolygons: boolean;
    }): void;

    lowResPixelRatio?: number;

    /**
     * Add an object to bloom effect
     * @param object - Object to add to bloom effect
     */
    addBloomObject(object: THREE.Object3D): void;

    /**
     * Remove an object from bloom effect
     * @param object - Object to remove from bloom effect
     */
    removeBloomObject(object: THREE.Object3D): void;

    /**
     * Add an object to ignore bloom effect
     * @param object - Object to ignore in bloom effect
     */
    addIgnoreBloomObject(object: THREE.Object3D): void;

    /**
     * Remove an object from ignore bloom effect
     * @param object - Object to stop ignoring in bloom effect
     */
    removeIgnoreBloomObject(object: THREE.Object3D): void;

    /**
     * Set anti-aliasing type
     * @param type - Type of anti-aliasing to use
     */
    setAntialias(type: "none" | "fxaa" | "smaa"): void;

    /**
     * Add a translucent object to a layer
     * @param object - Object to add
     * @param layer - Layer to add the object to
     */
    addTranslucentObject(object: THREE.Object3D, layer: string): void;

    /**
     * Remove a translucent object
     * @param object - Object to remove
     */
    removeTranslucentObject(object: THREE.Object3D): void;

    /**
     * Add a translucent layer
     * @param layer - Layer to add
     */
    addTranslucentLayer(layer: string, layerConfig: ITranslucentLayerConfig): void;
    /**
     * Update translucent layer configuration
     * @param layer - Layer to update
     * @param config - Translucent layer configuration
     */
    updateTranslucentLayer(layer: string, config: {
        mixFactor?: number;
        blendMode?: "mix" | "add" | "multiply" | "screen";
    }): void;

    /**
     * Remove a translucent layer
     * @param layer - Layer to remove
     */
    removeTranslucentLayer(layer: string): void;

    // Custom effect management methods
    /**
     * Add a custom effect
     * @param customEffect - Custom effect to add
     */
    addCustomEffect(customEffect: ICustomEffect): void;
    
    /**
     * Remove a custom effect
     * @param effectId - ID of the effect to remove
     * @returns Whether the effect was successfully removed
     */
    removeCustomEffect(effectId: string): boolean;
    
    /**
     * Get a custom effect by ID
     * @param effectId - ID of the effect to retrieve
     * @returns The custom effect or undefined if not found
     */
    getCustomEffect(effectId: string): ICustomEffect | undefined;
    
    /**
     * Enable or disable a custom effect
     * @param effectId - ID of the effect to update
     * @param enabled - Whether the effect should be enabled
     * @returns Whether the effect was successfully updated
     */
    setCustomEffectEnabled(effectId: string, enabled: boolean): boolean;
    
    /**
     * Update a custom effect
     * @param effectId - ID of the effect to update
     * @param updater - Function to update the effect
     * @returns Whether the effect was successfully updated
     */
    updateCustomEffect(effectId: string, updater: (effect: Effect) => void): boolean;
    
    /**
     * Get all custom effects
     * @returns Array of all custom effects
     */
    getAllCustomEffects(): ICustomEffect[];

    // Depth picking related methods
    /**
     * Enable or disable depth picking
     * @param enabled - Whether depth picking should be enabled
     */
    setDepthPickingEnabled(enabled: boolean): void;
    
    /**
     * Set stencil reference value for depth picking
     * @param stencilRef - Stencil reference value
     */
    setDepthPickingStencilRef(stencilRef: number): void;
    
    /**
     * Get depth texture
     * @returns Depth texture or null if not available
     */
    getDepthTexture(): THREE.Texture | null;
    
    /**
     * Read depth at a specific point
     * @param ndc - Normalized device coordinates
     * @returns Promise resolving to depth value or null
     */
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): Promise<number | null>;
}

// Main rendering manager implementation
export class MapRenderingManager implements IMapRenderingManager {
    // Bloom effect configuration
    bloom = {
        enabled: false,
        strength: 2.5,
        radius: 0.67,
        levels: 3,
        inverted: false,
        luminancePassThreshold: 0.0,
        luminancePassSmoothing: 0.1
    };

    // Outline effect configuration
    outline = {
        enabled: false,
        thickness: 0.02,
        color: "#ffffff",
        ghostExtrudedPolygons: false
    };

    // Vignette effect configuration
    vignette = {
        enabled: false,
        offset: 1.0,
        darkness: 1.0
    };

    // Sepia effect configuration
    sepia = {
        enabled: false,
        amount: 0.5
    };

    // Hue/Saturation effect configuration
    hueSaturation = {
        enabled: false,
        hue: 0.0,
        saturation: 0.0
    };

    // Brightness/Contrast effect configuration
    brightnessContrast = {
        enabled: false,
        brightness: 0.0,
        contrast: 0.0
    };

    // SSAO effect configuration
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

    // Translucent depth configuration
    translucentDepth = {

    };

    // Depth picking configuration
    depthPicking = {
        enabled: false,
        stencilRef: 1
    };

    // Anti-aliasing effect configuration
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
    private m_translucentDepthEffect?: TranslucentLayerEffect & IEnabledEffect;
    private m_depthPickingPass?: DepthPickingWithStencilPass & IEnabledEffect;

    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;

    private m_lowResPixelRatio?: number;
    private m_lowResEffect?: LowResEffect;

    // Track anti-aliasing configuration changes
    private m_lastFxaaEnabled: boolean = false;
    private m_lastSmaaEnabled: boolean = false;

    // Store custom effects
    private m_customEffects: Map<string, ICustomEffect> = new Map();

    // Track temporary objects
    private m_bloomObjects: THREE.Object3D[] = [];
    private m_ignoreObjects: THREE.Object3D[] = [];

    /**
     * Constructor for MapRenderingManager
     * @param width - Initial width of the rendering area
     * @param height - Initial height of the rendering area
     * @param lowResPixelRatio - Pixel ratio for low resolution rendering
     * @param antialiasSettings - Anti-aliasing settings
     */
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

        // Record initial state
        this.m_lastFxaaEnabled = this.fxaaEnabled;
        this.m_lastSmaaEnabled = this.smaaEnabled;

        this.lowResPixelRatio = lowResPixelRatio;
        this.setSize(width, height);
    }

    /**
     * Initialize all effects
     */
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

        // Initialize depth picking pass
        this.m_depthPickingPass = new DepthPickingWithStencilPass() as DepthPickingWithStencilPass & IEnabledEffect;
        this.m_depthPickingPass.enabled = this.depthPicking.enabled;
        this.m_composer.addPass(this.m_depthPickingPass);

        // Initialize NormalPass for SSAO
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

        // Initialize SSAO effect
        this.m_ssaoEffect = new SSAOEffect(this.m_camera, this.m_normalPass.texture, {
            // Use NormalPass texture instead of scene
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

        // Initialize translucent depth effect
        this.m_translucentDepthEffect = new TranslucentLayerEffect(this.m_scene, this.m_camera, {
            blendFunction: BlendFunction.SCREEN,
        }) as TranslucentLayerEffect & IEnabledEffect;
        this.m_translucentDepthEffect.enabled = true;

        // Initialize anti-aliasing effects - Fix SMAA configuration
        this.m_fxaaEffect = new FXAAEffect() as FXAAEffect & IEnabledEffect;
        this.m_fxaaEffect.enabled = this.fxaaEnabled;

        // Fix SMAA configuration - Use more noticeable settings
        this.m_smaaEffect = new SMAAEffect({
            preset: SMAAPreset.ULTRA, // Use HIGH preset for more noticeable effect
            edgeDetectionMode: EdgeDetectionMode.LUMA,
            predicationMode: PredicationMode.DISABLED // Disable predication for more consistent effect
        }) as SMAAEffect & IEnabledEffect;
        this.m_smaaEffect.enabled = this.smaaEnabled && !this.fxaaEnabled;

        if (this.m_lowResPixelRatio !== undefined) {
            this.m_lowResEffect = new LowResEffect(this.m_lowResPixelRatio);
        }

        // Create effect pass
        this.recreateEffectPass();
    }

    /**
     * Recreate the effect pass with current configuration
     */
    private recreateEffectPass() {
        if (!this.m_composer || !this.m_camera) return;

        // Remove old effect pass
        if (this.m_effectPass) {
            this.m_composer.removePass(this.m_effectPass);
        }

        // First add NormalPass to composer (if SSAO is enabled)
        if (this.ssao.enabled && this.m_normalPass) {
            this.m_composer.addPass(this.m_normalPass);
        }

        // Create array of all effects
        const allEffects: IEnabledEffect[] = [
            this.m_translucentDepthEffect!, // Translucent depth effect should be applied early
            this.m_bloomEffect!,
            this.m_outlineEffect!,
            this.m_vignetteEffect!,
            this.m_sepiaEffect!,
            this.m_hueSaturationEffect!,
            this.m_brightnessContrastEffect!,
            this.m_ssaoEffect! // Add SSAO effect to effect array
        ];

        // Add custom effects (sorted by order)
        const customEffects = Array.from(this.m_customEffects.values())
            .filter(customEffect => customEffect.enabled)
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
            .map(customEffect => customEffect.effect);

        allEffects.push(...customEffects);

        // Important: Anti-aliasing effects should be placed last (at the end of the post-processing chain)
        // Add anti-aliasing effects based on settings (note: FXAA and SMAA cannot be enabled simultaneously)
        if (this.fxaaEnabled && this.m_fxaaEffect) {
            console.log("Adding FXAA effect to render pipeline");
            allEffects.push(this.m_fxaaEffect);
        } else if (this.smaaEnabled && this.m_smaaEffect) {
            console.log("Adding SMAA effect to render pipeline");
            allEffects.push(this.m_smaaEffect);
        } else {
            console.log("No antialiasing effect enabled");
        }

        // Add low resolution effect (if any) - should be before anti-aliasing
        if (this.m_lowResEffect) {
            allEffects.push(this.m_lowResEffect);
        }

        this.m_effectPass = new FilterEffectPass(this.m_camera, ...allEffects);
        this.m_composer.addPass(this.m_effectPass);

        // Update recorded state
        this.m_lastFxaaEnabled = this.fxaaEnabled;
        this.m_lastSmaaEnabled = this.smaaEnabled;

        console.log(`Effect pass recreated with ${allEffects.length} effects (${customEffects.length} custom)`);
    }

    /**
     * Update all effects with current configuration
     */
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
            !this.m_normalPass || // Add NormalPass check
            !this.m_translucentDepthEffect || // Add translucent depth effect check
            !this.m_depthPickingPass // Add depth picking pass check
        ) {
            this.initializeEffects();
            return;
        }

        // Check if anti-aliasing configuration has changed
        const antialiasConfigChanged =
            this.m_lastFxaaEnabled !== this.fxaaEnabled ||
            this.m_lastSmaaEnabled !== this.smaaEnabled;

        // Check if custom effects have changed
        const customEffectsChanged = Array.from(this.m_customEffects.values()).some(
            customEffect => customEffect.effect.enabled !== customEffect.enabled
        );

        // Update depth picking pass
        if (this.m_depthPickingPass) {
            this.m_depthPickingPass.enabled = this.depthPicking.enabled;

            // Update stencil reference value
            if (this.depthPicking.stencilRef !== undefined) {
                this.m_depthPickingPass.setStencilRef(this.depthPicking.stencilRef);
            }
        }

        // Translucent depth effect - always enabled
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.enabled = true; // Always enabled
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
            this.m_normalPass.enabled = true; // Enable NormalPass

            // Update SSAO parameters
            if (this.m_ssaoEffect.ssaoMaterial) {
                this.m_ssaoEffect.ssaoMaterial.intensity = this.ssao.intensity;
                this.m_ssaoEffect.ssaoMaterial.radius = this.ssao.radius;
                this.m_ssaoEffect.ssaoMaterial.distanceThreshold = this.ssao.distanceThreshold;
                this.m_ssaoEffect.ssaoMaterial.distanceFalloff = this.ssao.distanceFalloff;
                this.m_ssaoEffect.ssaoMaterial.bias = this.ssao.bias;
            }
        } else if (this.m_ssaoEffect) {
            this.m_ssaoEffect.enabled = false;
            this.m_normalPass.enabled = false; // Disable NormalPass
        }

        // Update custom effects
        this.m_customEffects.forEach(customEffect => {
            customEffect.effect.enabled = customEffect.enabled;
        });

        // FXAA effect
        if (this.m_fxaaEffect) {
            this.m_fxaaEffect.enabled = this.fxaaEnabled;
        }

        // SMAA effect - mutually exclusive with FXAA
        if (this.m_smaaEffect) {
            this.m_smaaEffect.enabled = this.smaaEnabled && !this.fxaaEnabled;
        }

        // Low resolution effect
        if (this.m_lowResPixelRatio !== undefined && this.m_lowResEffect) {
            // Low resolution effect processing
        }

        // Update MSAA settings
        if (this.m_composer) {
            if (this.m_msaaEnabled) {
                this.m_composer.multisampling = this.m_staticMsaaSamplingLevel || 2;
            } else {
                this.m_composer.multisampling = 0;
            }
        }

        // If anti-aliasing configuration or custom effects have changed, recreate effect pass
        if (antialiasConfigChanged || customEffectsChanged) {
            this.recreateEffectPass();
        }

        this.m_composer?.setSize(this.m_width, this.m_height);
    }

    // Depth picking related methods
    /**
     * Enable or disable depth picking
     * @param enabled - Whether depth picking should be enabled
     */
    setDepthPickingEnabled(enabled: boolean): void {
        this.depthPicking.enabled = enabled;
        if (this.m_depthPickingPass) {
            this.m_depthPickingPass.enabled = enabled;
        }
    }

    /**
     * Set stencil reference value for depth picking
     * @param stencilRef - Stencil reference value
     */
    setDepthPickingStencilRef(stencilRef: number): void {
        this.depthPicking.stencilRef = stencilRef;
        if (this.m_depthPickingPass) {
            this.m_depthPickingPass.setStencilRef(stencilRef);
        }
    }

    /**
     * Get depth texture
     * @returns Depth texture or null if not available
     */
    getDepthTexture(): THREE.Texture | null {
        if (this.m_depthPickingPass && this.depthPicking.enabled) {
            return this.m_depthPickingPass.getDepthTexture();
        }
        return null;
    }

    // New method: Set anti-aliasing type
    /**
     * Set anti-aliasing type
     * @param type - Type of anti-aliasing to use
     */
    setAntialias(type: "none" | "fxaa" | "smaa"): void {
        const oldFxaa = this.fxaaEnabled;
        const oldSmaa = this.smaaEnabled;

        this.fxaaEnabled = type === "fxaa";
        this.smaaEnabled = type === "smaa";

        console.log(`Setting antialias: ${type}`, {
            old: { fxaa: oldFxaa, smaa: oldSmaa },
            new: { fxaa: this.fxaaEnabled, smaa: this.smaaEnabled }
        });

        // Force recreate effect pass
        if (this.m_composer) {
            this.recreateEffectPass();
            this.m_composer.setSize(this.m_width, this.m_height);
        }
    }

    // Custom effect management methods
    /**
     * Add a custom effect
     * @param customEffect - Custom effect to add
     */
    addCustomEffect(customEffect: ICustomEffect): void {
        if (this.m_customEffects.has(customEffect.id)) {
            console.warn(`Custom effect with id '${customEffect.id}' already exists. It will be replaced.`);
        }

        this.m_customEffects.set(customEffect.id, customEffect);
        console.log(`Added custom effect: ${customEffect.id}`);

        // Recreate effect pass to include new custom effect
        if (this.m_composer) {
            this.recreateEffectPass();
        }
    }

    /**
     * Remove a custom effect
     * @param effectId - ID of the effect to remove
     * @returns Whether the effect was successfully removed
     */
    removeCustomEffect(effectId: string): boolean {
        const removed = this.m_customEffects.delete(effectId);
        if (removed) {
            console.log(`Removed custom effect: ${effectId}`);

            // Recreate effect pass to remove custom effect
            if (this.m_composer) {
                this.recreateEffectPass();
            }
        } else {
            console.warn(`Custom effect with id '${effectId}' not found.`);
        }
        return removed;
    }

    /**
     * Get a custom effect by ID
     * @param effectId - ID of the effect to retrieve
     * @returns The custom effect or undefined if not found
     */
    getCustomEffect(effectId: string): ICustomEffect | undefined {
        return this.m_customEffects.get(effectId);
    }

    /**
     * Enable or disable a custom effect
     * @param effectId - ID of the effect to update
     * @param enabled - Whether the effect should be enabled
     * @returns Whether the effect was successfully updated
     */
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

    /**
     * Update a custom effect
     * @param effectId - ID of the effect to update
     * @param updater - Function to update the effect
     * @returns Whether the effect was successfully updated
     */
    updateCustomEffect(effectId: string, updater: (effect: Effect) => void): boolean {
        const customEffect = this.m_customEffects.get(effectId);
        if (customEffect) {
            updater(customEffect.effect);
            return true;
        }
        return false;
    }

    /**
     * Get all custom effects
     * @returns Array of all custom effects
     */
    getAllCustomEffects(): ICustomEffect[] {
        return Array.from(this.m_customEffects.values());
    }

    /**
     * Update outline effect options
     * @param options - Outline configuration options
     */
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

    /**
     * Update bloom effect options
     */
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

    /**
     * Add an object to bloom effect
     * @param object - Object to add to bloom effect
     */
    addBloomObject(object: THREE.Object3D): void {
        if (this.m_bloomEffect) {
            this.m_bloomEffect.selection.add(object);
        }
        this.m_bloomObjects.push(object);
    }

    /**
     * Remove an object from bloom effect
     * @param object - Object to remove from bloom effect
     */
    removeBloomObject(object: THREE.Object3D): void {
        if (this.m_bloomEffect) {
            this.m_bloomEffect.selection.delete(object);
        }
        this.m_bloomObjects = this.m_bloomObjects.filter(item => item !== object);
    }

    /**
     * Add an object to ignore bloom effect
     * @param object - Object to ignore in bloom effect
     */
    addIgnoreBloomObject(object: THREE.Object3D): void {
        this.m_ignoreObjects.push(object);
    }

    /**
     * Remove an object from ignore bloom effect
     * @param object - Object to stop ignoring in bloom effect
     */
    removeIgnoreBloomObject(object: THREE.Object3D): void {
        this.m_ignoreObjects = this.m_ignoreObjects.filter(item => item !== object);
    }

    /**
     * Render the scene
     * @param renderer - WebGL renderer
     * @param scene - Scene to render
     * @param camera - Camera to use for rendering
     * @param isStaticFrame - Whether this is a static frame
     */
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
                // If EffectComposer rendering fails, fall back to normal rendering
                renderer.render(scene, camera);
            }
        } else {
            renderer.render(scene, camera);
        }
    }

    /**
     * Set the size of the rendering area
     * @param width - Width of the rendering area
     * @param height - Height of the rendering area
     */
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

    /**
     * Read depth at a specific point
     * @param ndc - Normalized device coordinates
     * @returns Promise resolving to depth value or null
     */
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): Promise<number> | null {
        return this.m_depthPickingPass?.readDepth(ndc) ?? null;
    }

    /**
     * Add a translucent layer
     * @param layer - Layer name
     * @param layerConfig - Layer configuration
     */
    addTranslucentLayer(layer: string, layerConfig: ITranslucentLayerConfig): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.createLayer(layer, layerConfig);
        }
    }

    /**
     * Update a translucent layer
     * @param layer - Layer name
     * @param layerConfig - Layer configuration
     */
    updateTranslucentLayer(layer: string, layerConfig: ITranslucentLayerConfig): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.updateLayer(layer, layerConfig);
        }
    }

    /**
     * Remove a translucent layer
     * @param layer - Layer name
     */
    removeTranslucentLayer(layer: string): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.removeLayer(layer);
        }
    }

    // New method: Add translucent depth effect object
    /**
     * Add a translucent object to a layer
     * @param object - Object to add
     * @param layer - Layer to add the object to
     */
    addTranslucentObject(object: THREE.Object3D, layer: string): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.addToLayer(object, layer);
        }
    }

    // New method: Remove translucent depth effect object
    /**
     * Remove a translucent object
     * @param object - Object to remove
     */
    removeTranslucentObject(object: THREE.Object3D): void {
        if (this.m_translucentDepthEffect) {
            this.m_translucentDepthEffect.removeFromLayer(object);
        }
    }
}