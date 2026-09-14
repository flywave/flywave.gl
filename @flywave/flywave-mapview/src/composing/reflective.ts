/* Copyright (C) 2025 flywave.gl contributors */

import { MeshStandardNodeMaterial } from "three/webgpu";

import type { IReflectiveParams } from "./MapRenderingManager";

/**
 * Ready-made reflectivity/roughness pairs for
 * {@link MapRenderingManager.addReflectiveObject} and
 * {@link createSurfaceMaterial}. `reflectivity` doubles as the fresnel F0,
 * so water (0.05) reflects mostly at grazing angles while a mirror (~0.95)
 * reflects head-on — physically-plausible defaults, tune freely.
 */
export type ReflectionPresetName = "mirror" | "polishedFloor" | "marble" | "wetAsphalt" | "water";

export const REFLECTION_PRESETS: Record<ReflectionPresetName, IReflectiveParams> = {
    mirror: { reflectivity: 0.95, roughness: 0.02 },
    polishedFloor: { reflectivity: 0.8, roughness: 0.08 },
    marble: { reflectivity: 0.5, roughness: 0.16 },
    wetAsphalt: { reflectivity: 0.3, roughness: 0.3 },
    water: { reflectivity: 0.08, roughness: 0.06 }
};

/**
 * Material-side metalness per preset. The SKY reflection does not come from
 * SSR (the atmosphere has no depth — the ray march can never hit it) but
 * from the PBR specular environment (scene.environmentNode = atmosphere IBL
 * when atmosphere is enabled). A metalness-0 dielectric reflects that IBL at
 * F0 = 4% — practically invisible — so presets that should show the sky
 * carry high metalness (metals also lose their diffuse, reading as polish).
 */
const PRESET_METALNESS: Record<ReflectionPresetName, number> = {
    mirror: 1,
    polishedFloor: 0.9,
    marble: 0.4,
    wetAsphalt: 0.15,
    water: 1
};

/**
 * Convenience material factory for reflective user components: builds a
 * standard node material whose look (color + roughness) matches the chosen
 * reflection preset, with the reflection params baked into the material —
 * put a Mesh using it on a MapAnchor and one
 * `mapRenderingManager.addReflectiveObject(mesh)` call (no params needed)
 * turns the reflections on.
 */
export function createSurfaceMaterial(options?: {
    preset?: ReflectionPresetName;
    /** Base color, 0xRRGGBB. */
    color?: number;
}): MeshStandardNodeMaterial {
    const presetName = options?.preset ?? "polishedFloor";
    const params = REFLECTION_PRESETS[presetName];
    const material = new MeshStandardNodeMaterial({
        color: options?.color ?? 0x9a9a9a,
        roughness: params.roughness,
        metalness: PRESET_METALNESS[presetName]
    });
    material.userData = { __ssrParams: { ...params } };
    return material;
}
