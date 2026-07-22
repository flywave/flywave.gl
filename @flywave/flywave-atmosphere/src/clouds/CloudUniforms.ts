// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix4, Vector2, Vector3, Vector4 } from "three";
import { uniform, vec2, vec3, vec4, mat4 } from "three/tsl";

import { CloudLayers } from "./CloudLayer";
import { qualityPresets, type QualityPreset } from "./QualityPresets";

export class CloudUniforms {
    // Atmosphere
    bottomRadius = uniform(6360000.5); // slightly different to test inline
    altitudeCorrection = uniform(new Vector3());
    sunDirection = uniform(new Vector3(1, 0, 0));
    cameraShapeOffset = uniform(new Vector3());
    cameraPosition = uniform(new Vector3()); // ECEF, with altitudeCorrection applied (matches shader cameraPosition)
    cameraHeight = uniform(0.0);
    cameraVelocity = uniform(0.0);
    // Meters → atmosphere-runtime length unit (km). Must match
    // AtmosphereParameters.worldToUnit. Required because the atmosphere LUT
    // lookups (getSplitScalarIlluminance, getIndirectLuminanceToPoint) expect
    // positions in the same unit as parametersNode.bottomRadius/topRadius,
    // which are pre-multiplied by worldToUnit at construction time.
    worldToUnit = uniform(0.001);

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

    // Shadow length (disabled by default: we approximate without a BSM shadow map)
    maxShadowLengthIterationCount = uniform(0);
    minShadowLengthStepSize = uniform(50.0);
    maxShadowLengthRayDistance = uniform(200000.0);

    // Beer Shadow Map (BSM) uniforms
    shadowCascadeCount = uniform(1);
    shadowFar = uniform(50000.0);
    shadowTexelSize = uniform(new Vector2(1 / 512, 1 / 512));
    maxShadowFilterRadius = uniform(4.0);
    // Per-cascade data (up to 4 cascades). With 1 cascade only [0] is used.
    shadowMatrices = [
        uniform(new Matrix4()),
        uniform(new Matrix4()),
        uniform(new Matrix4()),
        uniform(new Matrix4())
    ];
    inverseShadowMatrices = [
        uniform(new Matrix4()),
        uniform(new Matrix4()),
        uniform(new Matrix4()),
        uniform(new Matrix4())
    ];
    shadowIntervals = [
        uniform(new Vector2(0, 1)),
        uniform(new Vector2(0, 1)),
        uniform(new Vector2(0, 1)),
        uniform(new Vector2(0, 1))
    ];
    // Shadow buffer textures (one per cascade). Set externally by CloudRenderNode.
    shadowTextureNodes: (any | null)[] = [null, null, null, null];

    // Shape and weather
    localWeatherRepeat = uniform(new Vector2(100, 100));
    localWeatherOffset = uniform(new Vector2(0, 0));
    localWeatherVelocity = uniform(new Vector2(0, 0));
    coverage = uniform(0.3);
    shapeRepeat = uniform(new Vector3(0.0003, 0.0003, 0.0003));
    shapeOffset = uniform(new Vector3(0, 0, 0));
    shapeVelocity = uniform(new Vector3(0, 0, 0));
    shapeDetailRepeat = uniform(new Vector3(0.006, 0.006, 0.006));
    shapeDetailOffset = uniform(new Vector3(0, 0, 0));
    shapeDetailVelocity = uniform(new Vector3(0, 0, 0));
    turbulenceRepeat = uniform(20.0);
    turbulenceDisplacement = uniform(350.0);

    // Scattering
    skyLightScale = uniform(1.0);
    groundBounceScale = uniform(1.0);
    powderScale = uniform(0.8);
    powderExponent = uniform(150.0);

    // Haze (analytical altitude-exponential fog)
    hazeEnabled = uniform(1.0);
    hazeDensityScale = uniform(3e-5);
    hazeExponent = uniform(1e-3);
    hazeScatteringCoefficient = uniform(0.9);
    hazeAbsorptionCoefficient = uniform(0.5);

    // Phase function
    accuratePhaseFunction = uniform(0.0); // 0 = dual-HG, 1 = Draine+HG Mie fit
    scatterAnisotropy1 = uniform(0.7);
    scatterAnisotropy2 = uniform(-0.2);
    scatterAnisotropyMix = uniform(0.5);

    // Sun angular radius (radians). Earth: ~0.00465 rad (0.2666°).
    // Larger values produce softer shadow penumbras via expanded PCF.
    sunAngularRadius = uniform(0.00465);

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

    // Lighting (use real solar spectrum matching atmosphere parameters)
    sunIrradiance = uniform(new Vector3(1.474, 1.8504, 1.91198));
    skyIrradianceMin = uniform(new Vector3(0.2, 0.3, 0.4));
    skyIrradianceMax = uniform(new Vector3(0.4, 0.5, 0.6));
    sunIrradianceMin = uniform(new Vector3(1.0, 0.9, 0.7));
    sunIrradianceMax = uniform(new Vector3(1.5, 1.4, 1.2));

    // Screen resolution (for mip level computation)
    resolution = uniform(new Vector2(1920, 1080));

    // Mip level scale: 0.25 for temporal upscale, 1.0 for full-res
    // Reference: CloudsMaterial.setSize sets mipLevelScale = 0.25
    mipLevelScale = uniform(0.25);

    // Matrices for velocity reprojection
    prevViewProjection = uniform(new Matrix4());
    ecefToWorld = uniform(new Matrix4());

    // Jittered inverse projection matrix for temporal upscale
    // Updated each frame with a sub-pixel offset based on Bayer 4x4 pattern
    jitteredInverseProj = uniform(new Matrix4());

    // STBN
    frame = uniform(0);

    // Debug visualization mode:
    // 0 = normal cloud render
    // 1 = rayNear (red), rayFar (green), shouldMarch (blue)
    // 2 = cameraHeight (grayscale)
    // 3 = cloud alpha only
    debugMode = uniform(0);

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
        console.log("[CloudUniforms] constructor called");
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
        // Match reference: only layers with non-zero densityScale contribute to bounds.
        let minH = Infinity;
        let maxH = 0;
        for (let i = 0; i < 3; ++i) {
            if (layers[i].densityScale > 0 && layers[i].height > 0) {
                if (alts[i] < minH) minH = alts[i];
                if (topHeights[i] > maxH) maxH = topHeights[i];
            }
        }
        this.minHeight.value = minH === Infinity ? 0 : minH;
        this.maxHeight.value = maxH;
        // shadowTopHeight: only layers with shadow=true contribute.
        let shadowTopH = 0;
        for (let i = 0; i < 3; ++i) {
            if (layers[i].shadow && layers[i].height > 0) {
                if (topHeights[i] > shadowTopH) shadowTopH = topHeights[i];
            }
        }
        this.shadowTopHeight.value = shadowTopH;
    }

    applyQualityPreset(preset: QualityPreset): void {
        const p = qualityPresets[preset];
        this.hazeEnabled.value = p.hazeEnabled ? 1 : 0;
        this.accuratePhaseFunction.value = p.accuratePhaseFunction ? 1 : 0;
        this.maxIterationCount.value = p.maxIterationCount;
        this.minStepSize.value = p.minStepSize;
        this.maxStepSize.value = p.maxStepSize;
        this.maxRayDistance.value = p.maxRayDistance;
        this.perspectiveStepScale.value = p.perspectiveStepScale;
        this.minDensity.value = p.minDensity;
        this.minExtinction.value = p.minExtinction;
        this.minTransmittance.value = p.minTransmittance;
        this.maxIterationCountToGround.value = p.maxIterationCountToGround;
        this.maxIterationCountToSun.value = p.maxIterationCountToSun;
        this.shadowCascadeCount.value = p.shadowCascadeCount;
        this.maxShadowLengthIterationCount.value = p.maxShadowLengthIterationCount;
    }
}
