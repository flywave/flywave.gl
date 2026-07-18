// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Vector2, Vector3, Vector4 } from "three";
import { uniform, vec2, vec3, vec4, mat4 } from "three/tsl";

import { CloudLayers } from "./CloudLayer";

export class CloudUniforms {
    // Atmosphere
    bottomRadius = uniform(6360000.0);
    altitudeCorrection = uniform(new Vector3());
    sunDirection = uniform(new Vector3(1, 0, 0));
    cameraShapeOffset = uniform(new Vector3());
    cameraHeight = uniform(0.0);

    // Participating medium
    scatteringCoefficient = uniform(1.0);
    absorptionCoefficient = uniform(0.0);

    // Primary raymarch
    minDensity = uniform(1e-5);
    minExtinction = uniform(1e-5);
    minTransmittance = uniform(1e-2);
    maxIterationCount = uniform(500);
    minStepSize = uniform(50.0);
    maxStepSize = uniform(1000.0);
    maxRayDistance = uniform(200000.0);
    perspectiveStepScale = uniform(1.01);

    // Secondary raymarch
    maxIterationCountToSun = uniform(2);
    maxIterationCountToGround = uniform(3);
    minSecondaryStepSize = uniform(100.0);
    secondaryStepScale = uniform(2.0);

    // Shape and weather
    localWeatherRepeat = uniform(new Vector2(100, 100));
    localWeatherOffset = uniform(new Vector2(0, 0));
    coverage = uniform(0.3);
    shapeRepeat = uniform(new Vector3(0.0003, 0.0003, 0.0003));
    shapeOffset = uniform(new Vector3(0, 0, 0));
    shapeDetailRepeat = uniform(new Vector3(0.006, 0.006, 0.006));
    shapeDetailOffset = uniform(new Vector3(0, 0, 0));
    turbulenceRepeat = uniform(20.0);
    turbulenceDisplacement = uniform(350.0);

    // Scattering
    skyLightScale = uniform(1.0);
    groundBounceScale = uniform(1.0);
    powderScale = uniform(0.8);
    powderExponent = uniform(150.0);

    // Cloud layers (packed vec4)
    minLayerHeights = uniform(new Vector4());
    maxLayerHeights = uniform(new Vector4());
    minIntervalHeights = uniform(new Vector3());
    maxIntervalHeights = uniform(new Vector3());
    densityScales = uniform(new Vector4());
    shapeAmounts = uniform(new Vector4());
    shapeDetailAmounts = uniform(new Vector4());
    weatherExponents = uniform(new Vector4());
    shapeAlteringBiases = uniform(new Vector4());
    coverageFilterWidths = uniform(new Vector4());
    minHeight = uniform(750.0);
    maxHeight = uniform(1400.0);
    shadowTopHeight = uniform(8000.0);

    // Density profile (packed)
    densityProfileExpTerms = uniform(new Vector4());
    densityProfileExponents = uniform(new Vector4());
    densityProfileLinearTerms = uniform(new Vector4());
    densityProfileConstantTerms = uniform(new Vector4());

    // Lighting (simplified)
    sunIrradiance = uniform(new Vector3(1.5, 1.5, 1.5));
    skyIrradianceMin = uniform(new Vector3(0.2, 0.3, 0.4));
    skyIrradianceMax = uniform(new Vector3(0.4, 0.5, 0.6));
    sunIrradianceMin = uniform(new Vector3(1.0, 0.9, 0.7));
    sunIrradianceMax = uniform(new Vector3(1.5, 1.4, 1.2));

    // STBN
    frame = uniform(0);

    // Texture nodes (set externally by CloudTextures)
    localWeatherTextureNode: any = null;
    shapeTextureNode: any = null;
    shapeDetailTextureNode: any = null;
    turbulenceTextureNode: any = null;

    // Raw textures (for texture() calls in TSL)
    localWeatherTexture: any = null;
    shapeTexture: any = null;
    shapeDetailTexture: any = null;
    turbulenceTexture: any = null;

    readonly layers: CloudLayers;

    constructor(layers?: CloudLayers) {
        this.layers = layers ?? new CloudLayers(CloudLayers.DEFAULT);
        this.updateLayers();
    }

    updateLayers(): void {
        const layers = this.layers;
        const v4 = new Vector4();
        const v3 = new Vector3();

        layers.packValues("altitude", v4);
        this.minLayerHeights.value.copy(v4);
        layers.packSums("altitude", "height", v4);
        this.maxLayerHeights.value.copy(v4);
        layers.packValues("densityScale", v4);
        this.densityScales.value.copy(v4);
        layers.packValues("shapeAmount", v4);
        this.shapeAmounts.value.copy(v4);
        layers.packValues("shapeDetailAmount", v4);
        this.shapeDetailAmounts.value.copy(v4);
        layers.packValues("weatherExponent", v4);
        this.weatherExponents.value.copy(v4);
        layers.packValues("shapeAlteringBias", v4);
        this.shapeAlteringBiases.value.copy(v4);
        layers.packValues("coverageFilterWidth", v4);
        this.coverageFilterWidths.value.copy(v4);
        layers.packDensityProfiles("expTerm", v4);
        this.densityProfileExpTerms.value.copy(v4);
        layers.packDensityProfiles("exponent", v4);
        this.densityProfileExponents.value.copy(v4);
        layers.packDensityProfiles("linearTerm", v4);
        this.densityProfileLinearTerms.value.copy(v4);
        layers.packDensityProfiles("constantTerm", v4);
        this.densityProfileConstantTerms.value.copy(v4);

        const minInt = new Vector3();
        const maxInt = new Vector3();
        layers.packIntervalHeights(minInt, maxInt);
        this.minIntervalHeights.value.copy(minInt);
        this.maxIntervalHeights.value.copy(maxInt);

        const alts = [layers[0].altitude, layers[1].altitude, layers[2].altitude];
        const topHeights = [
            layers[0].altitude + layers[0].height,
            layers[1].altitude + layers[1].height,
            layers[2].altitude + layers[2].height
        ];
        this.minHeight.value = Math.min(alts[0], alts[1], alts[2]);
        this.maxHeight.value = Math.max(topHeights[0], topHeights[1], topHeights[2]);
        this.shadowTopHeight.value = this.maxHeight.value;
    }
}
