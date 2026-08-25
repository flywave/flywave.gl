/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

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

export interface IOutlineConfig {
    enabled: boolean;
    thickness: number;
    color: string;
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
    /** Objects registered for the selective outline pass (see MapRenderingManager). */
    outlineObjects: Set<THREE.Object3D>;
    translucentLayerEffect?: TranslucentLayerEffect;
    exposure: { value: number };
    gpuPicking: boolean;
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
