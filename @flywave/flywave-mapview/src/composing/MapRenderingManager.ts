/* Copyright (C) 2025 flywave.gl contributors */

import {
    ITranslucentLayerConfig,
    type IBloomEffect,
    type IBrightnessContrastEffect,
    type IColorGradingLUTEffect,
    type IFogLightEffect,
    type IHueSaturationEffect,
    type IOutlineEffect,
    type ISepiaEffect,
    type ISSREffect,
    type IVignetteEffect
} from "@flywave/flywave-datasource-protocol";
import * as THREE from "three/webgpu";
import { mrt, diffuseColor, normalView, vec4 } from "three/tsl";
import type { Renderer } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";

import { type IPassManager } from "./IPassManager";
import { type IViewRenderManager, type AntialiasingMode, type IFogLightDef } from "./vrm";
import { TranslucentLayerEffect, OUTLINE_LAYER_BIT } from "./vrm/TranslucentLayerEffect";
import { packOctahedralNormal } from "./vrm/effects/ssr";

/**
 * Per-surface reflection parameters stored on `mat.userData.__ssrParams` and
 * compiled into the material's `ssrData` MRT entry. `reflectivity` doubles as
 * the fresnel F0: 0.02 ≈ water, 0.04–0.08 ≈ polished stone, ~0.9 ≈ mirror.
 */
export interface IReflectiveParams {
    /** Reflection strength / fresnel F0 (0–1). Below 0.01 = not reflective. */
    reflectivity: number;
    /** Surface roughness (0–1); drives reflection falloff, see ssr.maxRoughness. */
    roughness: number;
}

export interface IReflectiveObjectHandle {
    /** Live-tune parameters (uniforms — no pipeline or shader rebuild). */
    update(params: Partial<IReflectiveParams>): void;
    /** Remove the reflection mask; the material itself is left untouched. */
    delete(): void;
}

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

/**
 * Material carrying the bloom/translucent multi-render-target (MRT) node and the
 * per-object userData the bloom/translucent passes key off. `mrtNode` is left
 * as `Node | null` (the return type of three's `mrt()`) instead of `unknown`.
 */
type BloomMrtMaterial = THREE.Material & {
    mrtNode: THREE.Node | null;
    userData?: Record<string, unknown>;
};

/** Defaults for {@link addReflectiveObject} — "polished floor" territory. */
const DEFAULT_REFLECTIVE_PARAMS: IReflectiveParams = {
    reflectivity: 0.8,
    roughness: 0.08
};

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
    colorGradingLUT: IColorGradingLUTEffect;
    fogLight: IFogLightEffect;
    taaEnabled: boolean;
    antialiasing: AntialiasingMode;
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

    ssr: ISSREffect;
    /**
     * Tag an object subtree as reflective (screen-space reflections). The
     * engine patches each material's `ssrData` MRT output — the material's
     * own shading is untouched and no per-object pipeline is created; the
     * pixels these surfaces cover pay for the SSR march, nothing else does.
     * Requires `ssr.enabled` (theme `postEffects.ssr`). Call `MapView.update`
     * afterwards (on-demand render loop).
     */
    addReflectiveObject(
        object: THREE.Object3D,
        params?: Partial<IReflectiveParams>
    ): IReflectiveObjectHandle;
    removeReflectiveObject(object: THREE.Object3D): void;

    /**
     * Register a fog light (volumetric lamp halo). Plain data def plus the
     * def's geo position already projected to the world frame by the caller
     * (MapView). Adding, removing or moving lights never rebuilds the node
     * graph.
     */
    addFogLight(def: IFogLightDef, worldPosition: THREE.Vector3): void;
    removeFogLight(def: IFogLightDef): void;
    /** Per-frame uniform refresh (world → camera-relative view space). */
    updateFogLights(
        cameraWorldPosition: THREE.Vector3,
        cameraWorldMatrixInverse: THREE.Matrix4
    ): void;

    addOutlineObject(object: THREE.Object3D): void;
    removeOutlineObject(object: THREE.Object3D): void;

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
    updateCustomEffect(effectId: string, updater: (effect: ICustomEffect) => void): boolean;
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

    /**
     * Selective outline config. `enabled` is selection-driven: any
     * `addOutlineObject` call arms the mask pass, and it then STAYS in the
     * node graph (default `keepPassAlive: true`) so toggling selections never
     * recompiles the post-processing pipeline — the empty mask reads as "no
     * silhouette" and the effect is a visual no-op. Set `keepPassAlive:
     * false` to tear the pass down when the last outlined object is removed
     * (idle scenes pay nothing, but every 0↔1 selection change rebuilds the
     * whole chain). `xray: true` (default) outlines the FULL silhouette
     * including geometry hidden behind occluders; `hiddenColor` optionally
     * recolors those occluded ring sections.
     */
    outline: IOutlineEffect = {
        enabled: false,
        thickness: 2,
        color: "#ffffff",
        xray: true,
        hiddenColor: undefined,
        keepPassAlive: true
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

    /**
     * 3D LUT color grading. `url` must be an absolute/resolved URL by the
     * time it reaches the VRM (MapView.setPostEffects resolves relative
     * paths through the uriResolver). Empty URL = neutral (no-op) LUT.
     */
    colorGradingLUT: IColorGradingLUTEffect = {
        enabled: false,
        url: "",
        opacity: 1
    };

    /**
     * Volumetric light halos. Lights live in the VRM's `fogLights` registry
     * (addFogLight/removeFogLight below); this slot only carries the global
     * config. Toggling `enabled` rebuilds the graph once.
     */
    fogLight: IFogLightEffect = {
        enabled: false,
        intensity: 1,
        density: 0.002
    };

    /**
     * Screen-space reflections global config. Which pixels reflect is decided
     * per object via {@link addReflectiveObject}; this slot only carries the
     * pass config. Toggling `enabled` rebuilds the graph once.
     */
    ssr: ISSREffect = {
        enabled: false,
        resolutionScale: 0.5,
        maxRayDistance: 5000,
        binarySearchIterations: 4,
        thickness: 2,
        edgeFade: 0.9,
        maxRoughness: 0.6,
        intensity: 1,
        debug: 0
    };

    taaEnabled: boolean = false;
    /**
     * Active anti-aliasing strategy. Drives `vrm.config.antialiasing`.
     * `taaEnabled` is kept as a deprecated alias (maps to "taa").
     */
    antialiasing: AntialiasingMode = "none";

    private m_msaaEnabled: boolean = true;
    private m_width: number = 1;
    private m_height: number = 1;
    private m_dynamicMsaaSamplingLevel: MSAASampling;
    private m_staticMsaaSamplingLevel: MSAASampling;
    private m_lowResPixelRatio?: number;
    private m_customEffects: Map<string, ICustomEffect> = new Map();
    private m_pendingBloomObjects: THREE.Object3D[] = [];
    private m_pendingOutlineObjects: THREE.Object3D[] = [];
    /**
     * Persistent registry of tagged reflective subtrees. Re-applied on every
     * `syncPostEffectsToVRM`: objects tagged BEFORE the theme loaded (while
     * `ssr.enabled` was still false) get their ssrData material entries
     * written once the effect turns on, and disabling strips them cleanly
     * (no stray ssrData entry left in an MRT-less pass).
     */
    private m_reflectiveObjects: THREE.Object3D[] = [];
    private m_pendingFogLights: { def: IFogLightDef; world: THREE.Vector3 }[] = [];
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

        // Graph-structural fingerprint: the fields baked into the node graph
        // at build time. A re-sync with identical values must stay
        // rebuild-free — a whole-chain dispose+recompile is a visible stall —
        // so `needsUpdate` is only set when this fingerprint actually
        // changes. Uniform-fed fields (fogLight intensity/density) and the
        // async-swapped LUT url are excluded on purpose.
        const signature = () => {
            const c = vrm.config;
            return JSON.stringify([
                c.antialiasing,
                c.taa.enabled,
                c.bloom,
                c.outline,
                c.vignette,
                c.brightnessContrast,
                c.hueSaturation,
                c.sepia,
                c.colorGradingLUT.enabled,
                c.colorGradingLUT.opacity,
                c.fogLight.enabled,
                c.ssr
            ]);
        };
        const before = signature();

        // Reconcile the selection-driven `enabled` flag with what the VRM
        // gate will actually build (enabled && (selection || keepPassAlive)).
        // This keeps the flag truthful after e.g. un-arming keepPassAlive
        // while idle (pass drops, flag must drop too), while pending
        // pre-VRM selections count as "about to exist" so the flag survives
        // the VRM-creation sync. Runs BEFORE the copy below so the VRM
        // config gets the reconciled value.
        this.outline.enabled =
            this.outline.enabled &&
            (vrm.outlineObjects.size > 0 ||
                this.m_pendingOutlineObjects.length > 0 ||
                this.outline.keepPassAlive === true);

        vrm.config.bloom.enabled = this.bloom.enabled;
        vrm.config.bloom.intensity = this.bloom.strength;
        vrm.config.bloom.radius = this.bloom.radius;
        vrm.config.bloom.threshold = this.bloom.luminancePassThreshold;

        vrm.config.outline.enabled = this.outline.enabled;
        vrm.config.outline.thickness = this.outline.thickness;
        vrm.config.outline.color = this.outline.color;
        vrm.config.outline.xray = this.outline.xray !== false;
        vrm.config.outline.hiddenColor = this.outline.hiddenColor;
        vrm.config.outline.keepPassAlive = this.outline.keepPassAlive === true;

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

        vrm.config.colorGradingLUT.enabled = this.colorGradingLUT.enabled;
        vrm.config.colorGradingLUT.url = this.colorGradingLUT.url;
        vrm.config.colorGradingLUT.opacity = this.colorGradingLUT.opacity ?? 1;

        vrm.config.fogLight.enabled = this.fogLight.enabled;
        // intensity/density are uniforms the fog node reads per frame.
        vrm.config.fogLight.intensity = this.fogLight.intensity ?? 1;
        vrm.config.fogLight.density = this.fogLight.density ?? 0.002;

        Object.assign(vrm.config.ssr, this.ssr);

        vrm.config.taa.enabled = this.taaEnabled;
        // Resolve the active AA mode: the explicit `antialiasing` field wins,
        // but the deprecated `taaEnabled` boolean still maps to "taa".
        vrm.config.antialiasing =
            this.antialiasing !== "none" ? this.antialiasing : this.taaEnabled ? "taa" : "none";

        if (signature() !== before) {
            vrm.needsUpdate = true;
        }
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
            for (const obj of this.m_pendingOutlineObjects) {
                vrm.outlineObjects.add(obj);
                this.applyOutlineLayer(obj, true);
            }
            this.m_pendingOutlineObjects = [];
            for (const { def, world } of this.m_pendingFogLights) {
                vrm.fogLights.set(def, world);
            }
            this.m_pendingFogLights = [];
            // Reflective tags live in the materials, but the ssrData entry is
            // gated on `ssr.enabled` — which this sync may have just flipped.
            // Re-apply so tags added before the theme loaded (enabled still
            // false at the time) land now, and a disable strips them cleanly.
            for (const obj of this.m_reflectiveObjects) {
                this.applyReflectiveMrtNode(obj);
            }
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

    updateOutline(options: Partial<IOutlineEffect>): void {
        // `enabled` is deprecated (selection-driven); ignore it here.
        const { enabled: _ignored, ...config } = options;
        Object.assign(this.outline, config);
        this.syncConfigToViewRenderManager();
    }

    addBloomObject(object: THREE.Object3D): void {
        this.m_pendingBloomObjects.push(object);
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        vrm.bloomObjects.add(object);
        this.applyBloomMrtNode(object, 1);
    }
    removeBloomObject(object: THREE.Object3D): void {
        this.m_pendingBloomObjects = this.m_pendingBloomObjects.filter(o => o !== object);
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        if (!vrm.bloomObjects.has(object)) return;
        vrm.bloomObjects.delete(object);
        this.applyBloomMrtNode(object, 0);
    }

    addFogLight(def: IFogLightDef, worldPosition: THREE.Vector3): void {
        this.m_pendingFogLights.push({ def, world: worldPosition });
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        vrm.fogLights.set(def, worldPosition);
    }

    removeFogLight(def: IFogLightDef): void {
        this.m_pendingFogLights = this.m_pendingFogLights.filter(d => d.def !== def);
        this.viewRenderManager?.fogLights.delete(def);
    }

    updateFogLights(
        cameraWorldPosition: THREE.Vector3,
        cameraWorldMatrixInverse: THREE.Matrix4
    ): void {
        this.viewRenderManager?.updateFogLights(cameraWorldPosition, cameraWorldMatrixInverse);
    }
    private applyBloomMrtNode(object: THREE.Object3D, intensity: number): void {
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as BloomMrtMaterial | undefined;
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

    addReflectiveObject(
        object: THREE.Object3D,
        params?: Partial<IReflectiveParams>
    ): IReflectiveObjectHandle {
        if (!this.m_reflectiveObjects.includes(object)) {
            this.m_reflectiveObjects.push(object);
        }
        this.applyReflectiveMrtNode(object, params);

        const mrm = this;
        return {
            update(latest: Partial<IReflectiveParams>): void {
                mrm.applyReflectiveMrtNode(object, latest);
            },
            delete(): void {
                mrm.removeReflectiveObject(object);
            }
        };
    }

    removeReflectiveObject(object: THREE.Object3D): void {
        this.m_reflectiveObjects = this.m_reflectiveObjects.filter(o => o !== object);
        this.applyReflectiveMrtNode(object, null);
    }

    /**
     * Write/clear `__ssrParams` on every material of the subtree and rebuild
     * its mrtNode. `params == null` clears the tag; omitted = re-apply the
     * stored tag (used by the postEffects sync). Object-level params merge
     * over material-level ones (a material may carry baked-in params from
     * `createSurfaceMaterial`), both over the defaults.
     */
    private applyReflectiveMrtNode(
        object: THREE.Object3D,
        params?: Partial<IReflectiveParams> | null
    ): void {
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as BloomMrtMaterial | undefined;
            if (mat == null) return;
            mat.userData = mat.userData ?? {};
            if (params === null) {
                delete mat.userData.__ssrParams;
                delete mat.userData.__ssrUniforms;
            } else {
                const baked = mat.userData.__ssrParams as IReflectiveParams | undefined;
                mat.userData.__ssrParams = {
                    ...DEFAULT_REFLECTIVE_PARAMS,
                    ...baked,
                    ...params
                };
            }
            this.rebuildMrtNode(mat);
        });
        this.viewRenderManager?.onNeedsRender?.();
    }

    private rebuildMrtNode(mat: BloomMrtMaterial): void {
        const entries: Record<string, THREE.Node> = {};
        const bloomIntensity = mat.userData?.__bloomIntensity;
        if (bloomIntensity != null) {
            entries.bloomIntensity = uniform(bloomIntensity);
        }
        const layerId = mat.userData?.__translucentLayerId;
        if (layerId != null) {
            entries.translucentLayerId = uniform(layerId);
            entries.translucentColor = diffuseColor.rgb;
        }
        // SSR reflectivity mask — only while the SSR pass exists (the pass
        // MRT layout carries the ssrData attachment only then; a stray mrtNode
        // entry in an MRT-less pass would replace the fragment output). The
        // uniforms are cached on the material so handle.update() rewrites
        // values live, without a shader rebuild.
        const ssrParams = mat.userData?.__ssrParams as IReflectiveParams | undefined;
        if (ssrParams != null && this.ssr.enabled) {
            // A three uniform node, typed loosely: the @types/three
            // `uniform()` overload infers `unknown` and fails vec4()'s
            // Node<"float"> overload.
            type FloatUniform = THREE.Node<"float"> & { value: number };
            type SsrUniforms = { reflectivity: FloatUniform; roughness: FloatUniform };
            let u = mat.userData.__ssrUniforms as SsrUniforms | undefined;
            if (u == null) {
                u = {
                    reflectivity: uniform(ssrParams.reflectivity) as FloatUniform,
                    roughness: uniform(ssrParams.roughness) as FloatUniform
                };
                mat.userData.__ssrUniforms = u;
            }
            u.reflectivity.value = ssrParams.reflectivity;
            u.roughness.value = ssrParams.roughness;
            entries.ssrData = vec4(
                packOctahedralNormal(normalView.normalize()),
                u.reflectivity,
                u.roughness
            );
        }
        mat.mrtNode = Object.keys(entries).length > 0 ? mrt(entries) : null;
        mat.needsUpdate = true;
    }
    removeIgnoreBloomObject(object: THREE.Object3D): void {
        this.viewRenderManager?.bloomIgnoreObjects.delete(object);
    }

    addOutlineObject(object: THREE.Object3D): void {
        this.m_pendingOutlineObjects.push(object);
        // `enabled` doubles as the "mask pass is in the graph" flag: it is
        // only false after a teardown (or before the first arming). While it
        // is armed — including the keepPassAlive idle state — selection is a
        // draw-time layer-bit toggle and must not recompile the pipeline.
        const passAppears = !this.outline.enabled;
        this.outline.enabled = true;
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        // Flip the VRM config copy too: theme sync never carries `enabled`
        // (updateOutline drops it as selection-driven), so without this a
        // runtime first selection would rebuild the graph still without the
        // mask pass.
        vrm.config.outline.enabled = true;
        vrm.outlineObjects.add(object);
        if (passAppears) {
            vrm.needsUpdate = true;
        }
        this.applyOutlineLayer(object, true);
    }

    removeOutlineObject(object: THREE.Object3D): void {
        this.m_pendingOutlineObjects = this.m_pendingOutlineObjects.filter(o => o !== object);
        const vrm = this.viewRenderManager;
        if (vrm == null) return;
        if (!vrm.outlineObjects.has(object)) return;
        vrm.outlineObjects.delete(object);
        this.applyOutlineLayer(object, false);
        if (vrm.outlineObjects.size === 0 && this.outline.keepPassAlive !== true) {
            // Last selection gone and the pass is not kept alive: drop the
            // outline pass on the next node graph rebuild, so idle scenes pay
            // nothing for it. With keepPassAlive the empty mask renders only
            // the background, which in the reversed-depth buffer reads as
            // "no silhouette" — the effect is a visual no-op and re-selection
            // stays a pure layer-bit toggle.
            this.outline.enabled = false;
            vrm.needsUpdate = true;
        }
    }

    /**
     * Tags/untags an object (whole subtree) with OUTLINE_LAYER_BIT. The
     * ViewRenderManager renders only bit-11 objects into the outline mask
     * pass, so no material modification is involved.
     */
    private applyOutlineLayer(object: THREE.Object3D, enable: boolean): void {
        object.traverse(child => {
            if (enable) {
                child.layers.enable(OUTLINE_LAYER_BIT);
            } else {
                child.layers.disable(OUTLINE_LAYER_BIT);
            }
        });
    }

    private m_translucentLayerEffect?: TranslucentLayerEffect;

    addTranslucentObject(object: THREE.Object3D, layer: string): void {
        const wasEmpty = this.m_translucentLayerEffect?.hasObjects === false;
        this.m_translucentLayerEffect?.addObject(object, layer);
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as BloomMrtMaterial | undefined;
            if (mat && !mat.userData?.__translucentLayerId) {
                mat.userData = mat.userData || {};
                mat.userData.__translucentLayerId = layer;
                this.rebuildMrtNode(mat);
            }
        });
        if (wasEmpty && this.viewRenderManager) this.viewRenderManager.needsUpdate = true;
    }
    removeTranslucentObject(object: THREE.Object3D): void {
        this.m_translucentLayerEffect?.removeObject(object);
        object.traverse(child => {
            const mat = (child as THREE.Mesh).material as BloomMrtMaterial | undefined;
            if (mat?.userData?.__translucentLayerId) {
                delete mat.userData.__translucentLayerId;
                this.rebuildMrtNode(mat);
            }
        });
        const isEmpty = this.m_translucentLayerEffect?.hasObjects === false;
        if (isEmpty && this.viewRenderManager) this.viewRenderManager.needsUpdate = true;
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
    updateCustomEffect(effectId: string, updater: (effect: ICustomEffect) => void): boolean {
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
