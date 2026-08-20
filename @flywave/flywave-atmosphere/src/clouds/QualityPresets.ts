export type QualityPreset = "low" | "medium" | "high" | "ultra";

/**
 * Values mirror the reference implementation's qualityPresets.ts
 * (@takram/three-clouds) field by field. Structural differences are
 * intentional (flat layout + `shadow*` prefixes instead of takram's
 * `clouds`/`shadow` groups); every VALUE must stay aligned.
 *
 * Mapping notes:
 * - takram `lightShafts: boolean` → `maxShadowLengthIterationCount`
 *   (0 = disabled, 500 = enabled = takram default).
 * - takram top-level `haze` → `hazeEnabled`.
 * - takram `shadow.maxIterationCount` → `shadowMaxIterationCount`.
 */
export interface QualityPresetConfig {
    resolutionScale: number;
    hazeEnabled: boolean;
    // Build-time sampling switches (reference: @define('SHAPE_DETAIL') /
    // @define('TURBULENCE') in takram CloudsMaterial/ShadowMaterial — compile-
    // time shader specialization, not runtime uniforms).
    shapeDetail: boolean;
    turbulence: boolean;
    accurateSunSkyLight: boolean;
    accuratePhaseFunction: boolean;
    multiScatteringOctaves: number;
    maxIterationCount: number;
    minStepSize: number;
    maxStepSize: number;
    maxRayDistance: number;
    perspectiveStepScale: number;
    minDensity: number;
    minExtinction: number;
    minTransmittance: number;
    maxIterationCountToGround: number;
    maxIterationCountToSun: number;
    minSecondaryStepSize: number;
    secondaryStepScale: number;
    maxShadowLengthIterationCount: number;
    minShadowLengthStepSize: number;
    maxShadowLengthRayDistance: number;
    shadowCascadeCount: number;
    shadowMapSize: number;
    shadowMaxIterationCount: number;
    shadowMinStepSize: number;
    shadowMaxStepSize: number;
    shadowMinTransmittance: number;
}

// takram `defaults` (= their "high" preset) — values 1:1.
const high: QualityPresetConfig = {
    resolutionScale: 1,
    hazeEnabled: true,
    shapeDetail: true,
    turbulence: true,
    accurateSunSkyLight: true,
    accuratePhaseFunction: false,
    multiScatteringOctaves: 8,
    maxIterationCount: 500,
    minStepSize: 50,
    maxStepSize: 1000,
    maxRayDistance: 2e5,
    perspectiveStepScale: 1.01,
    minDensity: 1e-5,
    minExtinction: 1e-5,
    minTransmittance: 1e-2,
    maxIterationCountToGround: 3,
    maxIterationCountToSun: 2,
    minSecondaryStepSize: 100,
    secondaryStepScale: 2,
    maxShadowLengthIterationCount: 500,
    minShadowLengthStepSize: 50,
    maxShadowLengthRayDistance: 2e5,
    shadowCascadeCount: 3,
    shadowMapSize: 512,
    shadowMaxIterationCount: 50,
    shadowMinStepSize: 100,
    shadowMaxStepSize: 1000,
    shadowMinTransmittance: 1e-4
};

export const qualityPresets: Record<QualityPreset, QualityPresetConfig> = {
    low: {
        ...high,
        shapeDetail: false, // Expensive (takram low)
        turbulence: false, // Expensive (takram low)
        accurateSunSkyLight: false, // Greatly reduces texel reads (takram low)
        maxIterationCount: 200,
        minStepSize: 100,
        maxRayDistance: 1e5,
        minDensity: 1e-4,
        minExtinction: 1e-4,
        minTransmittance: 1e-1, // Makes the primary march terminate earlier.
        maxIterationCountToGround: 0, // Expensive
        maxIterationCountToSun: 1, // Only 1 march makes big difference
        // takram low: lightShafts = false → shadow-length march disabled.
        maxShadowLengthIterationCount: 0,
        shadowMaxIterationCount: 25,
        shadowMinTransmittance: 1e-2, // Makes the shadow march terminate earlier.
        shadowCascadeCount: 2,
        shadowMapSize: 256
    },
    medium: {
        ...high,
        turbulence: false, // Expensive (takram medium)
        accurateSunSkyLight: false, // (takram medium)
        minDensity: 1e-4,
        minExtinction: 1e-4,
        maxIterationCountToSun: 2,
        maxIterationCountToGround: 1,
        // takram medium: lightShafts = false → shadow-length march disabled.
        maxShadowLengthIterationCount: 0,
        shadowMapSize: 256
    },
    high: {
        ...high
    },
    ultra: {
        ...high,
        minStepSize: 10,
        shadowMapSize: 1024
    }
};
