/* Copyright (C) 2025 flywave.gl contributors */
import { Matrix3, Vector3 } from "three";
import { uniform } from "three/tsl";
import { AtmosphereContextBase } from "./AtmosphereContextBase";
export class AtmosphereLUTTexturesContext extends AtmosphereContextBase {
    constructor(parameters, textureType) {
        super(parameters);
        this.lambdas = uniform(new Vector3(680, 550, 440));
        this.luminanceFromRadiance = uniform(new Matrix3());
        this.textureType = textureType;
    }
}
export class AtmosphereLUTTextures {
    setup(parameters, textureType) {
        this.parameters = parameters;
        this.textureType = textureType;
    }
    dispose() { }
}
//# sourceMappingURL=AtmosphereLUTTextures.js.map