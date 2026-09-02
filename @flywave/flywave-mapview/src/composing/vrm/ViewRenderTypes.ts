/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";
import type { GeoCoordinates } from "@flywave/flywave-geoutils";

export interface IBloomConfig {
    enabled: boolean;
    intensity: number;
    radius: number;
    threshold: number;
}

export interface IVignetteConfig {
    enabled: boolean;
    offset: number;
    darkness: number;
}

export interface IBrightnessContrastConfig {
    enabled: boolean;
    brightness: number;
    contrast: number;
}

export interface IHueSaturationConfig {
    enabled: boolean;
    hue: number;
    saturation: number;
}

export interface ISepiaConfig {
    enabled: boolean;
    amount: number;
}

export interface IColorGradingLUTConfig {
    enabled: boolean;
    /** Resolved LUT file URL (already through the uriResolver). */
    url: string;
    opacity: number;
}

/**
 * One volumetric fog light (lamp glow through haze). Plain data — registered
 * at runtime via `mapView.addFogLight`; add/remove/reposition never rebuilds
 * the node graph, only uniform slots change.
 */
export interface IFogLightDef {
    /** Geographic position of the light (converted to world once on add). */
    position: GeoCoordinates;
    /** Light color, 0xRRGGBB. */
    color: number;
    /** Luminous intensity multiplier; ~1 = a bright street lamp. */
    intensity: number;
    /** Halo radius in meters; falloff is 1 / (1 + h² / radius²). */
    radius: number;
    /**
     * Visibility factor 0-1 reserved for the future occlusion pre-pass;
     * consumed premultiplied at uniform upload time. Defaults to 1.
     */
    visibility?: number;
    /** World-frame position cached by `MapView.addFogLight` (do not set). */
    worldPosition?: THREE.Vector3;
}

export interface IFogLightConfig {
    enabled: boolean;
    /** Global intensity multiplier on top of each light's own intensity. */
    intensity: number;
    /** Halo reach along the view ray (1/m); ~0.002 saturates in a few 100 m. */
    density: number;
}

export interface IOutlineConfig {
    enabled: boolean;
    thickness: number;
    color: string;
    /** X-ray mode (outline hidden parts too). Defaults to true. */
    xray: boolean;
    /** Ring color for occluded silhouette sections; undefined = same as color. */
    hiddenColor?: string;
}

export interface ITemporalAntialiasConfig {
    enabled: boolean;
}

export interface ILensFlareConfig {
    enabled: boolean;
    bloomIntensity: number;
    ghostIntensity: number;
    haloIntensity: number;
    glareIntensity: number;
}

export interface IAerialPerspectiveConfig {
    enabled: boolean;
    lighting?: boolean;
    transmittance?: boolean;
    inscattering?: boolean;
    moonScattering?: boolean;
    correctGeometricError?: boolean;
}

export interface ICloudsConfig {
    enabled: boolean;
}
export type ToneMappingMode =
    | "linear"
    | "reinhard"
    | "cineon"
    | "aces"
    | "agx"
    | "agx-punchy"
    | "neutral";

/** Anti-aliasing strategy: "none" | "taa" | "smaa" (mutually exclusive). */
export type AntialiasingMode = "none" | "taa" | "smaa";

export interface IViewRenderConfig {
    aerialPerspective: IAerialPerspectiveConfig;
    bloom: IBloomConfig;
    vignette: IVignetteConfig;
    brightnessContrast: IBrightnessContrastConfig;
    hueSaturation: IHueSaturationConfig;
    sepia: ISepiaConfig;
    colorGradingLUT: IColorGradingLUTConfig;
    fogLight: IFogLightConfig;
    outline: IOutlineConfig;
    taa: ITemporalAntialiasConfig;
    clouds?: ICloudsConfig;
    lensFlare: ILensFlareConfig;
    toneMappingMode: ToneMappingMode;
    antialiasing: AntialiasingMode;
}

import type { TranslucentLayerEffect } from "./TranslucentLayerEffect";

export interface IViewRenderManager {
    readonly config: IViewRenderConfig;
    bloomObjects: Set<THREE.Object3D>;
    bloomIgnoreObjects: Set<THREE.Object3D>;
    /** Fog lights registered for the volumetric halo pass (plain data defs). */
    fogLights: Set<IFogLightDef>;
    /**
     * Per-frame light uniform refresh (world → camera-relative view space).
     * Called from `MapView.render` right before the frame is submitted; cheap
     * (≤ capacity vector transforms).
     */
    updateFogLights(
        cameraWorldPosition: THREE.Vector3,
        cameraWorldMatrixInverse: THREE.Matrix4
    ): void;
    /** Objects registered for the selective outline pass (see MapRenderingManager). */
    outlineObjects: Set<THREE.Object3D>;
    translucentLayerEffect?: TranslucentLayerEffect;
    exposure: { value: number };
    gpuPicking: boolean;
    /**
     * Invoked when an async post-effect load finished and flagged
     * `needsUpdate` outside the frame loop; the host schedules a frame
     * (MapView.update) so the change shows on a static map.
     */
    onNeedsRender?: () => void;
    /** Camera-relative camera the pass renders with (produces the pickDepth MRT). */
    readonly renderCamera?: THREE.Camera;
    render(scene: THREE.Scene, camera: THREE.Camera): void;
    setSize(width: number, height: number): void;
    dispose(): void;
    needsUpdate: boolean;
    setLensFlareConfig(config: ILensFlareConfig): void;
    getColorTexture(): THREE.Texture | null;
    getDepthTexture(): THREE.Texture | null;
    readDepthAsync(ndc: THREE.Vector2 | THREE.Vector3): Promise<number | null>;
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): number | null;
    /**
     * Synchronous depth + pickId lookup from the slot cache; null when no
     * readback is available yet (cold pixel / camera moved), pickId 0 when
     * the GPU definitively answered "sky".
     */
    readPickSync(ndc: THREE.Vector2 | THREE.Vector3): { depth: number; pickId: number } | null;
    /** Resolves a pickId to the object rendered with it (prunes stale). */
    getPickedObject(pickId: number): THREE.Object3D | undefined;
    /** Camera-relative render camera for unprojecting GPU depth. */
    readonly pickCamera?: THREE.Camera;
}
