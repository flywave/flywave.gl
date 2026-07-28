import { Vector2 } from "three";

export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface QualityPresetConfig {
    resolutionScale: number;
    hazeEnabled: boolean;
    accuratePhaseFunction: boolean;
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
    shadowCascadeCount: number;
    shadowMapSize: number;
    shadowMaxIterationCount: number;
    shadowMinStepSize: number;
    shadowMinTransmittance: number;
    maxShadowLengthIterationCount: number;
}

const high: QualityPresetConfig = {
    resolutionScale: 1,
    hazeEnabled: true,
    accuratePhaseFunction: false,
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
    shadowCascadeCount: 3,
    shadowMapSize: 512,
    shadowMaxIterationCount: 50,
    shadowMinStepSize: 100,
    shadowMinTransmittance: 1e-4,
    maxShadowLengthIterationCount: 500
};

export const qualityPresets: Record<QualityPreset, QualityPresetConfig> = {
    low: {
        ...high,
        hazeEnabled: true,
        accuratePhaseFunction: false,
        maxIterationCount: 200,
        minStepSize: 100,
        maxRayDistance: 1e5,
        minDensity: 1e-4,
        minExtinction: 1e-4,
        minTransmittance: 1e-1,
        maxIterationCountToGround: 0,
        maxIterationCountToSun: 1,
        shadowCascadeCount: 2,
        shadowMapSize: 256,
        shadowMaxIterationCount: 25,
        shadowMinStepSize: 100,
        shadowMinTransmittance: 1e-2,
        maxShadowLengthIterationCount: 200
    },
    medium: {
        ...high,
        hazeEnabled: true,
        accuratePhaseFunction: false,
        minDensity: 1e-4,
        minExtinction: 1e-4,
        maxIterationCountToSun: 2,
        maxIterationCountToGround: 1,
        shadowCascadeCount: 3,
        shadowMapSize: 256,
        shadowMaxIterationCount: 50,
        shadowMinStepSize: 100,
        shadowMinTransmittance: 1e-4,
        maxShadowLengthIterationCount: 300
    },
    high: {
        ...high,
        maxShadowLengthIterationCount: 500
    },
    ultra: {
        ...high,
        accuratePhaseFunction: true,
        minStepSize: 10,
        shadowMapSize: 1024,
        maxShadowLengthIterationCount: 500
    }
};
