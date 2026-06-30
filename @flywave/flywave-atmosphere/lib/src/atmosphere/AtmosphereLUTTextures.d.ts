import { Matrix3, Vector3, type Texture } from "three";
import type { Renderer } from "three/webgpu";
import type { AnyFloatType } from "../tsl/types";
import { AtmosphereContextBase } from "./AtmosphereContextBase";
import type { AtmosphereLUTTexture3DName, AtmosphereLUTTextureName } from "./AtmosphereLUTTypes";
import type { AtmosphereParameters } from "./AtmosphereParameters";
export declare abstract class AtmosphereLUTTexturesContext extends AtmosphereContextBase {
    textureType: AnyFloatType;
    lambdas: import("three/webgpu").UniformNode<"vec3", Vector3>;
    luminanceFromRadiance: import("three/webgpu").UniformNode<"mat3", Matrix3>;
    constructor(parameters: AtmosphereParameters, textureType: AnyFloatType);
}
export declare abstract class AtmosphereLUTTextures {
    protected parameters?: AtmosphereParameters;
    protected textureType?: AnyFloatType;
    abstract get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture;
    abstract createContext(): AtmosphereLUTTexturesContext;
    abstract computeTransmittance(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;
    abstract computeMultipleScattering(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;
    abstract computeScattering(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;
    abstract computeIrradiance(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;
    setup(parameters: AtmosphereParameters, textureType: AnyFloatType): void;
    dispose(): void;
}
