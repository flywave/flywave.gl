/* Copyright (C) 2025 flywave.gl contributors */

export type QualityPreset = "low" | "medium" | "high" | "ultra";

export interface CloudLayerConfig {
    channel?: "r" | "g" | "b" | "a";
    altitude?: number;
    height?: number;
    densityScale?: number;
    shapeAmount?: number;
    shapeDetailAmount?: number;
    weatherExponent?: number;
    shapeAlteringBias?: number;
    coverageFilterWidth?: number;
    shadow?: boolean;
    densityProfile?: {
        expTerm?: number;
        exponent?: number;
        linearTerm?: number;
        constantTerm?: number;
    };
}

export interface CloudConfig {
    quality?: QualityPreset;
    coverage?: number;
    layers?: CloudLayerConfig[];

    scatteringCoefficient?: number;
    absorptionCoefficient?: number;
    scatterAnisotropy1?: number;
    scatterAnisotropy2?: number;
    scatterAnisotropyMix?: number;
    accuratePhaseFunction?: boolean;

    skyLightScale?: number;
    groundBounceScale?: number;
    powderScale?: number;
    powderExponent?: number;

    maxIterationCount?: number;
    minStepSize?: number;
    maxStepSize?: number;
    maxRayDistance?: number;
    perspectiveStepScale?: number;
    minDensity?: number;
    minExtinction?: number;
    minTransmittance?: number;

    maxIterationCountToSun?: number;
    maxIterationCountToGround?: number;
    minSecondaryStepSize?: number;
    secondaryStepScale?: number;

    shadowCascadeCount?: number;
    shadowMapSize?: number;
    maxShadowFilterRadius?: number;

    hazeEnabled?: boolean;
    hazeDensityScale?: number;
    hazeExponent?: number;
    hazeScatteringCoefficient?: number;
    hazeAbsorptionCoefficient?: number;

    localWeatherRepeat?: number;
    localWeatherVelocity?: [number, number];
    shapeRepeat?: number;
    shapeVelocity?: [number, number, number];
    shapeDetailRepeat?: number;
    shapeDetailVelocity?: [number, number, number];
    turbulenceRepeat?: number;
    turbulenceDisplacement?: number;

    sunAngularRadius?: number;
}

export interface AerialPerspectiveConfig {
    correctGeometricError?: boolean;
    lighting?: boolean;
    transmittance?: boolean;
    inscattering?: boolean;
    moonScattering?: boolean;
    shadowSampleCount?: number;
    shadowFilterRadius?: number;
}
