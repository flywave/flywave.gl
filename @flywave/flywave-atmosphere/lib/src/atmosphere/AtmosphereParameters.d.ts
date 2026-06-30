import { Vector2, Vector3 } from "three";
export declare class DensityProfileLayer {
    width: number;
    expTerm: number;
    expScale: number;
    linearTerm: number;
    constantTerm: number;
    constructor(width?: number, expTerm?: number, expScale?: number, linearTerm?: number, constantTerm?: number);
    copy(other: DensityProfileLayer): this;
    clone(): DensityProfileLayer;
}
export declare class DensityProfile {
    layers: [DensityProfileLayer, DensityProfileLayer];
    constructor(layers: [DensityProfileLayer, DensityProfileLayer]);
    copy(other: DensityProfile): this;
    clone(): DensityProfile;
}
export declare class AtmosphereParameters {
    worldToUnit: number;
    solarIrradiance: Vector3;
    sunAngularRadius: number;
    bottomRadius: number;
    topRadius: number;
    rayleighDensity: DensityProfile;
    rayleighScattering: Vector3;
    mieDensity: DensityProfile;
    mieScattering: Vector3;
    mieExtinction: Vector3;
    miePhaseFunctionG: number;
    absorptionDensity: DensityProfile;
    absorptionExtinction: Vector3;
    groundAlbedo: Vector3;
    minCosLight: number;
    sunRadianceToLuminance: Vector3;
    skyRadianceToLuminance: Vector3;
    luminanceScale: number;
    combinedScatteringTextures: boolean;
    higherOrderScatteringTexture: boolean;
    transmittanceTextureSize: Vector2;
    irradianceTextureSize: Vector2;
    multipleScatteringTextureSize: Vector2;
    scatteringTextureRadiusSize: number;
    scatteringTextureCosViewSize: number;
    scatteringTextureCosLightSize: number;
    scatteringTextureCosViewLightSize: number;
    scatteringTextureSize: Vector3;
    constructor();
    copy(other: AtmosphereParameters): this;
    update(): this;
    clone(): AtmosphereParameters;
}
