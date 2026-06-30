import { type Texture, type Vector2, type Vector3 } from "three";
import { Storage3DTexture, StorageTexture, type Renderer } from "three/webgpu";
import type { AnyFloatType } from "../tsl/types";
import type { AtmosphereLUTTexture3DName, AtmosphereLUTTextureName } from "./AtmosphereLUTTypes";
import { AtmosphereLUTTextures, AtmosphereLUTTexturesContext } from "./AtmosphereLUTTextures";
import type { AtmosphereParameters } from "./AtmosphereParameters";
export declare function createStorageTexture(name: string): StorageTexture;
export declare function createStorage3DTexture(name: string): Storage3DTexture;
export declare function setupStorageTexture(texture: Texture, textureType: AnyFloatType, size: Vector2): void;
export declare function setupStorage3DTexture(texture: Storage3DTexture, textureType: AnyFloatType, size: Vector3): void;
declare class AtmosphereLUTTexturesContextWebGPU extends AtmosphereLUTTexturesContext {
}
export declare class AtmosphereLUTTexturesWebGPU extends AtmosphereLUTTextures {
    private readonly transmittance;
    private readonly multipleScattering;
    private readonly scattering;
    private readonly singleMieScattering;
    private readonly higherOrderScattering;
    private readonly irradiance;
    private transmittanceNode?;
    private multipleScatteringNode?;
    private scatteringNode?;
    private irradianceNode?;
    constructor();
    get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture;
    createContext(): AtmosphereLUTTexturesContextWebGPU;
    computeTransmittance(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGPU): void;
    computeMultipleScattering(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGPU): void;
    computeScattering(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGPU): void;
    computeIrradiance(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGPU): void;
    setup(parameters: AtmosphereParameters, textureType: AnyFloatType): void;
    dispose(): void;
}
export {};
