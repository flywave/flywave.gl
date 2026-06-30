import { type Texture } from "three";
import { type Renderer } from "three/webgpu";
import type { AnyFloatType } from "../tsl/types";
import type { AtmosphereLUTTexture3DName, AtmosphereLUTTextureName } from "./AtmosphereLUTTypes";
import { AtmosphereLUTTextures, AtmosphereLUTTexturesContext } from "./AtmosphereLUTTextures";
import type { AtmosphereParameters } from "./AtmosphereParameters";
declare class AtmosphereLUTTexturesContextWebGL extends AtmosphereLUTTexturesContext {
}
export declare class AtmosphereLUTTexturesWebGL extends AtmosphereLUTTextures {
    private readonly transmittanceRT;
    private readonly multipleScatteringRT;
    private readonly scatteringRT;
    private readonly singleMieScatteringRT;
    private readonly higherOrderScatteringRT;
    private readonly irradianceRT;
    private readonly mesh;
    private transmittanceMaterial?;
    private multipleScatteringMaterial?;
    private scatteringMaterial?;
    private irradianceMaterial?;
    private readonly layer;
    constructor();
    get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture;
    createContext(): AtmosphereLUTTexturesContextWebGL;
    private renderToRenderTarget;
    private renderToRenderTarget3D;
    private createMaterial;
    computeTransmittance(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGL): void;
    computeMultipleScattering(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGL): void;
    computeScattering(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGL): void;
    computeIrradiance(renderer: Renderer, context: AtmosphereLUTTexturesContextWebGL): void;
    setup(parameters: AtmosphereParameters, textureType: AnyFloatType): void;
    dispose(): void;
}
export {};
