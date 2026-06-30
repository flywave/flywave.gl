// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
// TSL struct construction and field destructureation use patterns not
// fully supported by @types/three@0.184.
import { float, ivec2, struct, uint, uvec2, vec3 } from "three/tsl";
import { NodeBuilder } from "three/webgpu";
import { reinterpretType } from "../tsl/types";
import { Angle, Dimensionless, DimensionlessSpectrum, InverseLength, IrradianceSpectrum, Length, ScatteringSpectrum } from "./dimensional";
export const densityProfileLayerStruct = struct({
    width: Length,
    expTerm: Dimensionless,
    expScale: InverseLength,
    linearTerm: InverseLength,
    constantTerm: Dimensionless
}, "DensityProfileLayer");
export const densityProfileStruct = struct({
    layer0: densityProfileLayerStruct.layout.name,
    layer1: densityProfileLayerStruct.layout.name
}, "DensityProfile");
const atmosphereParametersLayout = {
    worldToUnit: Dimensionless,
    solarIrradiance: IrradianceSpectrum,
    sunAngularRadius: Angle,
    bottomRadius: Length,
    topRadius: Length,
    rayleighDensity: densityProfileStruct.layout.name,
    rayleighScattering: ScatteringSpectrum,
    mieDensity: densityProfileStruct.layout.name,
    mieScattering: ScatteringSpectrum,
    mieExtinction: ScatteringSpectrum,
    miePhaseFunctionG: Dimensionless,
    absorptionDensity: densityProfileStruct.layout.name,
    absorptionExtinction: ScatteringSpectrum,
    groundAlbedo: DimensionlessSpectrum,
    minCosLight: Dimensionless,
    sunRadianceToLuminance: DimensionlessSpectrum,
    skyRadianceToLuminance: DimensionlessSpectrum,
    luminanceScale: Dimensionless,
    transmittanceTextureSize: "uvec2",
    irradianceTextureSize: "uvec2",
    multipleScatteringTextureSize: "uvec2",
    scatteringTextureRadiusSize: "uint",
    scatteringTextureCosViewSize: "uint",
    scatteringTextureCosLightSize: "uint",
    scatteringTextureCosViewLightSize: "uint"
};
export const atmosphereParametersStruct = struct(atmosphereParametersLayout, "AtmosphereParameters");
function densityProfileLayer(layer, worldToUnit) {
    const { width, expTerm, expScale, linearTerm, constantTerm } = layer;
    return densityProfileLayerStruct({
        width: float(width * worldToUnit),
        expTerm: float(expTerm),
        expScale: float(expScale / worldToUnit),
        linearTerm: float(linearTerm / worldToUnit),
        constantTerm: float(constantTerm)
    });
}
function densityProfile(profile, worldToUnit) {
    return densityProfileStruct({
        layer0: densityProfileLayer(profile.layers[0], worldToUnit),
        layer1: densityProfileLayer(profile.layers[1], worldToUnit)
    });
}
const DESTRUCTIBLE = Symbol("DESTRUCTIBLE");
export function makeDestructible(node) {
    reinterpretType(node);
    if (node[DESTRUCTIBLE] === true) {
        return node;
    }
    for (const key in atmosphereParametersLayout) {
        if (Object.hasOwn(atmosphereParametersLayout, key)) {
            node[key] = node.get(key);
        }
    }
    node[DESTRUCTIBLE] = true;
    return node;
}
export class AtmosphereContextBase {
    constructor(parameters) {
        this.parameters = parameters;
        const { worldToUnit, solarIrradiance, sunAngularRadius, bottomRadius, topRadius, rayleighDensity, rayleighScattering, mieDensity, mieScattering, mieExtinction, miePhaseFunctionG, absorptionDensity, absorptionExtinction, groundAlbedo, minCosLight, sunRadianceToLuminance, skyRadianceToLuminance, luminanceScale, transmittanceTextureSize, irradianceTextureSize, multipleScatteringTextureSize, scatteringTextureRadiusSize, scatteringTextureCosViewSize, scatteringTextureCosLightSize, scatteringTextureCosViewLightSize } = parameters;
        this.parametersNode = makeDestructible(atmosphereParametersStruct({
            worldToUnit: float(worldToUnit),
            solarIrradiance: vec3(solarIrradiance),
            sunAngularRadius: float(sunAngularRadius),
            bottomRadius: float(bottomRadius * worldToUnit),
            topRadius: float(topRadius * worldToUnit),
            rayleighDensity: densityProfile(rayleighDensity, worldToUnit),
            rayleighScattering: vec3(rayleighScattering.x / worldToUnit, rayleighScattering.y / worldToUnit, rayleighScattering.z / worldToUnit),
            mieDensity: densityProfile(mieDensity, worldToUnit),
            mieScattering: vec3(mieScattering.x / worldToUnit, mieScattering.y / worldToUnit, mieScattering.z / worldToUnit),
            mieExtinction: vec3(mieExtinction.x / worldToUnit, mieExtinction.y / worldToUnit, mieExtinction.z / worldToUnit),
            miePhaseFunctionG: float(miePhaseFunctionG),
            absorptionDensity: densityProfile(absorptionDensity, worldToUnit),
            absorptionExtinction: vec3(absorptionExtinction.x / worldToUnit, absorptionExtinction.y / worldToUnit, absorptionExtinction.z / worldToUnit),
            groundAlbedo: vec3(groundAlbedo),
            minCosLight: float(minCosLight),
            sunRadianceToLuminance: vec3(sunRadianceToLuminance),
            skyRadianceToLuminance: vec3(skyRadianceToLuminance),
            luminanceScale: float(luminanceScale),
            transmittanceTextureSize: ivec2(transmittanceTextureSize),
            irradianceTextureSize: ivec2(irradianceTextureSize),
            multipleScatteringTextureSize: uvec2(multipleScatteringTextureSize),
            scatteringTextureRadiusSize: uint(scatteringTextureRadiusSize),
            scatteringTextureCosViewSize: uint(scatteringTextureCosViewSize),
            scatteringTextureCosLightSize: uint(scatteringTextureCosLightSize),
            scatteringTextureCosViewLightSize: uint(scatteringTextureCosViewLightSize)
        }).toConst("atmosphereParameters"));
    }
    dispose() { }
}
export function getAtmosphereContextBase(host) {
    const hostContext = host instanceof NodeBuilder ? host.context : host.contextNode.value;
    if (typeof hostContext.getAtmosphere !== "function") {
        throw new Error("getAtmosphere() was not found in the context.");
    }
    const atmosphereContext = hostContext.getAtmosphere();
    if (!(atmosphereContext instanceof AtmosphereContextBase)) {
        throw new Error("getAtmosphere() must return an instanceof AtmosphereContextBase.");
    }
    return atmosphereContext;
}
//# sourceMappingURL=AtmosphereContextBase.js.map