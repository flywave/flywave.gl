/* Copyright (C) 2025 flywave.gl contributors */

import { Matrix3, Vector3, type Texture } from "three";
import { uniform } from "three/tsl";
import type { Renderer } from "three/webgpu";

import type { AnyFloatType } from "../tsl/types";

import { AtmosphereContextBase } from "./AtmosphereContextBase";
import type { AtmosphereLUTTexture3DName, AtmosphereLUTTextureName } from "./AtmosphereLUTTypes";
import type { AtmosphereParameters } from "./AtmosphereParameters";

export abstract class AtmosphereLUTTexturesContext extends AtmosphereContextBase {
    textureType: AnyFloatType;
    lambdas = uniform(new Vector3(680, 550, 440));
    luminanceFromRadiance = uniform(new Matrix3());

    constructor(parameters: AtmosphereParameters, textureType: AnyFloatType) {
        super(parameters);
        this.textureType = textureType;
    }
}

export abstract class AtmosphereLUTTextures {
    protected parameters?: AtmosphereParameters;
    protected textureType?: AnyFloatType;

    abstract get(name: AtmosphereLUTTextureName | AtmosphereLUTTexture3DName): Texture;

    abstract createContext(): AtmosphereLUTTexturesContext;

    abstract computeTransmittance(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;
    abstract computeMultipleScattering(
        renderer: Renderer,
        context: AtmosphereLUTTexturesContext
    ): void;
    abstract computeScattering(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;
    abstract computeIrradiance(renderer: Renderer, context: AtmosphereLUTTexturesContext): void;

    setup(parameters: AtmosphereParameters, textureType: AnyFloatType): void {
        this.parameters = parameters;
        this.textureType = textureType;
    }

    dispose(): void {}
}
