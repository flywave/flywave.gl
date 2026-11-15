/* Copyright (C) 2025 flywave.gl contributors */

import { uniform } from "three/tsl";
import { type Renderer, type Texture, Matrix3, Vector3 } from "three/webgpu";

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

    /**
     * Allocates the backing GPU textures before any material samples them.
     *
     * The WebGL path defers LUT generation to time-sliced passes on the first
     * frame, while scene materials may sample the tables during the very same
     * frame. Allocating there first would recreate (and delete) the texture
     * after it has already been bound, which WebGL reports as
     * "bindTexture: attempt to use a deleted object". The WebGPU path uses
     * compute passes and has nothing to preallocate, so this is a no-op there.
     */
    initRenderTargets(_renderer: Renderer): void {}

    dispose(): void {}
}
