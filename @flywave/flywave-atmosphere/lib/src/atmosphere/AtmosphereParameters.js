/* Copyright (C) 2025 flywave.gl contributors */
import { Vector2, Vector3 } from "three";
export class DensityProfileLayer {
    constructor(width = 0, expTerm = 0, expScale = 0, linearTerm = 0, constantTerm = 0) {
        this.width = width;
        this.expTerm = expTerm;
        this.expScale = expScale;
        this.linearTerm = linearTerm;
        this.constantTerm = constantTerm;
    }
    copy(other) {
        this.width = other.width;
        this.expTerm = other.expTerm;
        this.expScale = other.expScale;
        this.linearTerm = other.linearTerm;
        this.constantTerm = other.constantTerm;
        return this;
    }
    clone() {
        return new DensityProfileLayer().copy(this);
    }
}
export class DensityProfile {
    constructor(layers) {
        this.layers = layers;
    }
    copy(other) {
        this.layers = [other.layers[0].clone(), other.layers[1].clone()];
        return this;
    }
    clone() {
        return new DensityProfile([this.layers[0].clone(), this.layers[1].clone()]);
    }
}
const luminanceCoefficients = new Vector3(0.2126, 0.7152, 0.0722);
export class AtmosphereParameters {
    constructor() {
        this.worldToUnit = 0.001;
        this.solarIrradiance = new Vector3(1.474, 1.8504, 1.91198);
        this.sunAngularRadius = 0.004675;
        this.bottomRadius = 6360000;
        this.topRadius = 6420000;
        this.rayleighDensity = new DensityProfile([
            new DensityProfileLayer(),
            new DensityProfileLayer(0, 1, -1 / 8000)
        ]);
        this.rayleighScattering = new Vector3(0.000005802, 0.000013558, 0.0000331);
        this.mieDensity = new DensityProfile([
            new DensityProfileLayer(),
            new DensityProfileLayer(0, 1, -1 / 1200)
        ]);
        this.mieScattering = new Vector3().setScalar(0.000003996);
        this.mieExtinction = new Vector3().setScalar(0.00000444);
        this.miePhaseFunctionG = 0.8;
        this.absorptionDensity = new DensityProfile([
            new DensityProfileLayer(25000, 0, 0, 1 / 15000, -2 / 3),
            new DensityProfileLayer(0, 0, 0, -1 / 15000, 8 / 3)
        ]);
        this.absorptionExtinction = new Vector3(0.00000065, 0.000001881, 0.000000085);
        this.groundAlbedo = new Vector3().setScalar(0.3);
        this.minCosLight = Math.cos((120 * Math.PI) / 180);
        this.sunRadianceToLuminance = new Vector3(98242.786222, 69954.398112, 66475.012354);
        this.skyRadianceToLuminance = new Vector3(114974.91644, 71305.954816, 65310.548555);
        this.luminanceScale = 1 / luminanceCoefficients.dot(this.sunRadianceToLuminance);
        this.combinedScatteringTextures = true;
        this.higherOrderScatteringTexture = true;
        this.transmittanceTextureSize = new Vector2(256, 64);
        this.irradianceTextureSize = new Vector2(64, 16);
        this.multipleScatteringTextureSize = new Vector2(64, 64);
        this.scatteringTextureRadiusSize = 32;
        this.scatteringTextureCosViewSize = 128;
        this.scatteringTextureCosLightSize = 32;
        this.scatteringTextureCosViewLightSize = 8;
        this.scatteringTextureSize = new Vector3();
        this.update();
    }
    copy(other) {
        this.worldToUnit = other.worldToUnit;
        this.solarIrradiance.copy(other.solarIrradiance);
        this.sunAngularRadius = other.sunAngularRadius;
        this.bottomRadius = other.bottomRadius;
        this.topRadius = other.topRadius;
        this.rayleighDensity.copy(other.rayleighDensity);
        this.rayleighScattering.copy(other.rayleighScattering);
        this.mieDensity.copy(other.mieDensity);
        this.mieScattering.copy(other.mieScattering);
        this.mieExtinction.copy(other.mieExtinction);
        this.miePhaseFunctionG = other.miePhaseFunctionG;
        this.absorptionDensity.copy(other.absorptionDensity);
        this.absorptionExtinction.copy(other.absorptionExtinction);
        this.groundAlbedo.copy(other.groundAlbedo);
        this.minCosLight = other.minCosLight;
        this.sunRadianceToLuminance.copy(other.sunRadianceToLuminance);
        this.skyRadianceToLuminance.copy(other.skyRadianceToLuminance);
        this.luminanceScale = other.luminanceScale;
        this.combinedScatteringTextures = other.combinedScatteringTextures;
        this.transmittanceTextureSize.copy(other.transmittanceTextureSize);
        this.irradianceTextureSize.copy(other.irradianceTextureSize);
        this.multipleScatteringTextureSize.copy(other.multipleScatteringTextureSize);
        this.scatteringTextureRadiusSize = other.scatteringTextureRadiusSize;
        this.scatteringTextureCosViewSize = other.scatteringTextureCosViewSize;
        this.scatteringTextureCosLightSize = other.scatteringTextureCosLightSize;
        this.scatteringTextureCosViewLightSize = other.scatteringTextureCosViewLightSize;
        this.scatteringTextureSize.copy(other.scatteringTextureSize);
        return this;
    }
    update() {
        this.scatteringTextureSize.set(this.scatteringTextureCosViewLightSize * this.scatteringTextureCosLightSize, this.scatteringTextureCosViewSize, this.scatteringTextureRadiusSize);
        return this;
    }
    clone() {
        return new AtmosphereParameters().copy(this);
    }
}
//# sourceMappingURL=AtmosphereParameters.js.map