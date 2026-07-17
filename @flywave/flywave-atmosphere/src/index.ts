/* Copyright (C) 2025 flywave.gl contributors */

export * from "./capabilities";
export * from "./constants";
export { QuadGeometry } from "./atmosphere/QuadGeometry";

// TSL infrastructure
export { reinterpretType, type AnyFloatType, type UniformMap } from "./tsl/types";
export { type Node, type NodeType, type NodeValueType } from "./tsl/node";
export { FnLayout, type FnLayoutSpec, type FnLayoutInput } from "./tsl/FnLayout";
export { FnVar } from "./tsl/FnVar";
export { isWebGPU } from "./tsl/utils";
export { outputTexture, OutputTextureNode } from "./tsl/OutputTextureNode";
export { outputTexture3D, OutputTexture3DNode } from "./tsl/OutputTexture3DNode";
export { OnFrameUpdate, OnBeforeFrameUpdate } from "./tsl/events";
export {
    raySphereIntersection,
    rayEllipsoidIntersection,
    raySpheresIntersections,
    raySpheresIntersectionsStruct
} from "./tsl/math";
export { bvecAnd, bvecNot, bvecOr } from "./tsl/bvec";
export { textureGather } from "./tsl/sampling";
export { dithering, interleavedGradientNoise } from "./tsl/generators";
export { stbnTexture, stbn } from "./tsl/STBNTextureNode";
export {
    cameraFar,
    cameraNear,
    projectionMatrix,
    viewMatrix,
    inverseProjectionMatrix,
    inverseViewMatrix,
    cameraPositionWorld
} from "./tsl/accessors";
export {
    depthToViewZ,
    screenToPositionView,
    equirectToDirectionWorld
} from "./tsl/transformations";

// Atmosphere parameters and physics
export {
    DensityProfileLayer,
    DensityProfile,
    AtmosphereParameters
} from "./atmosphere/AtmosphereParameters";

export * from "./atmosphere/dimensional";

export {
    AtmosphereContextBase,
    getAtmosphereContextBase,
    atmosphereParametersStruct,
    densityProfileLayerStruct,
    densityProfileStruct,
    makeDestructible
} from "./atmosphere/AtmosphereContextBase";

export {
    AtmosphereContext,
    getAtmosphereContext,
    registerAtmosphereContext,
    type AtmosphereContextNode
} from "./atmosphere/AtmosphereContext";

export { AtmosphereLUTNode } from "./atmosphere/AtmosphereLUTNode";
export {
    type AtmosphereLUTTextureName,
    type AtmosphereLUTTexture3DName
} from "./atmosphere/AtmosphereLUTTypes";

export {
    AtmosphereLUTTextures,
    AtmosphereLUTTexturesContext
} from "./atmosphere/AtmosphereLUTTextures";

export { AtmosphereLUTTexturesWebGL } from "./atmosphere/AtmosphereLUTTexturesWebGL";
export { AtmosphereLUTTexturesWebGPU } from "./atmosphere/AtmosphereLUTTexturesWebGPU";

// Runtime scattering evaluation functions
export {
    getSolarLuminance,
    getIndirectLuminance,
    getIndirectLuminanceToPoint,
    getSplitIlluminance,
    getIndirectIlluminance,
    getSplitScalarIlluminance
} from "./atmosphere/runtime";

// Precompute functions
export { computeTransmittanceTexture, computeIrradianceTexture } from "./atmosphere/precompute";

// Multiple scattering functions
export {
    computeMultipleScatteringTexture,
    computeScatteringTexture
} from "./atmosphere/multiscattering";

// Sky and rendering nodes
export { SkyNode, sky, skyBackground, skyBackdrop } from "./atmosphere/SkyNode";
export { SkyEnvironmentNode, skyEnvironment } from "./atmosphere/SkyEnvironmentNode";
export {
    AerialPerspectiveNode,
    aerialPerspective,
    aerialPerspectiveBackdrop
} from "./atmosphere/AerialPerspectiveNode";
export { SunNode } from "./atmosphere/SunNode";
export { MoonNode } from "./atmosphere/MoonNode";
export { StarsNode } from "./atmosphere/StarsNode";

// Lighting
export { AtmosphereLight, type AtmosphereLightBody } from "./atmosphere/AtmosphereLight";
export { AtmosphereLightNode } from "./atmosphere/AtmosphereLightNode";
export { CascadedShadowMapsNode } from "./atmosphere/CascadedShadowMapsNode";

// Shadow length
export { ShadowLengthNode } from "./atmosphere/ShadowLengthNode";
export { ShadowLengthSampleLocations } from "./atmosphere/ShadowLengthSampleLocations";

// Celestial directions interface
export {
    type CelestialDirections,
    type AtmosphereCelestialUniforms,
    updateCelestialDirections
} from "./celestial/CelestialDirections";

// Additional exports
export { Stars } from "./atmosphere/Stars";
export { StarsNodeMaterial } from "./atmosphere/StarsNodeMaterial";
export { shadowLength } from "./atmosphere/ShadowLengthNode";

// Filter infrastructure
export { FilterNode } from "./tsl/FilterNode";
export { SingleFilterNode } from "./tsl/SingleFilterNode";
export { SeparableFilterNode } from "./tsl/SeparableFilterNode";
export { DualMipmapFilterNode } from "./tsl/DualMipmapFilterNode";
export { RenderTargetNode, renderTarget, convertToTexture } from "./tsl/RenderTargetNode";
export { hashValues } from "./tsl/utils";

// Blur nodes
export { DownsampleThresholdNode, downsampleThreshold } from "./tsl/DownsampleThresholdNode";
export { GaussianBlurNode, gaussianBlur } from "./tsl/GaussianBlurNode";
export {
    MipmapBlurNode,
    mipmapBlur,
    mipmapBlurDownsample,
    mipmapBlurUpsample
} from "./tsl/MipmapBlurNode";
export { MipmapSurfaceBlurNode, mipmapSurfaceBlur } from "./tsl/MipmapSurfaceBlurNode";
export { KawaseBlurNode, kawaseBlur } from "./tsl/KawaseBlurNode";

// Lens flare nodes
export { LensGhostNode } from "./tsl/LensGhostNode";
export { LensHaloNode } from "./tsl/LensHaloNode";
export { LensGlareNode, lensGlare } from "./tsl/LensGlareNode";
export { LensFlareNode, lensFlare } from "./tsl/LensFlareNode";
export { agxPunchyToneMapping, AgXPunchyToneMapping } from "./tsl/AgxToneMapping";
export { TemporalAntialiasNode, temporalAntialias } from "./tsl/TemporalAntialiasNode";
export { HighpVelocityNode, highpVelocity } from "./tsl/HighpVelocityNode";
export { bloom as tslBloom, default as BloomNode } from "./tsl/BloomNode";

// Cloud texture generation
export { CloudTextures } from "./clouds/CloudTextures";
export { CloudShapeTexture } from "./clouds/textures/CloudShapeTexture";
export { CloudShapeDetailTexture } from "./clouds/textures/CloudShapeDetailTexture";
export { LocalWeatherTexture } from "./clouds/textures/LocalWeatherTexture";
export { TurbulenceTexture } from "./clouds/textures/TurbulenceTexture";
export { CloudLayers, CloudLayer } from "./clouds/CloudLayer";
export { DensityProfile as CloudDensityProfile } from "./clouds/CloudLayer";
export { CloudUniforms } from "./clouds/CloudUniforms";
export { createCloudRenderer } from "./clouds/cloudTsl";
export {
    CloudRenderNode,
    cloudRender,
    updateCloudUniforms,
    setCloudReadyCallback
} from "./atmosphere/CloudRenderNode";
