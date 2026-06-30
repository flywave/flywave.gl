// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */
// AtmosphereLUTNode extends Node and uses WebGPU-specific lifecycle hooks
// (updateBeforeType, version, dispatchEvent) not fully typed in @types/three@0.184.
import { Data3DTexture, FloatType, HalfFloatType, RGBAFormat, Texture } from "three";
import { Node, NodeUpdateType, RendererUtils } from "three/webgpu";
import { isFloatLinearSupported } from "../capabilities";
import { isWebGPU } from "../tsl/utils";
import { outputTexture } from "../tsl/OutputTextureNode";
import { outputTexture3D } from "../tsl/OutputTexture3DNode";
import { requestIdleCallback } from "./helpers/requestIdleCallback";
import { AtmosphereLUTTexturesWebGL } from "./AtmosphereLUTTexturesWebGL";
import { AtmosphereLUTTexturesWebGPU } from "./AtmosphereLUTTexturesWebGPU";
import { AtmosphereParameters } from "./AtmosphereParameters";
const { resetRendererState, restoreRendererState } = RendererUtils;
async function timeSlice(iterable) {
    const iterator = iterable[Symbol.iterator]();
    return await new Promise((resolve, reject) => {
        const callback = () => {
            try {
                const { value, done } = iterator.next();
                if (done === true) {
                    resolve(value);
                }
                else {
                    requestIdleCallback(callback);
                }
            }
            catch (error) {
                reject(error instanceof Error ? error : new Error());
            }
        };
        requestIdleCallback(callback);
    });
}
let rendererState;
function run(renderer, task) {
    rendererState = resetRendererState(renderer, rendererState);
    renderer.setClearColor(0, 0);
    renderer.autoClear = false;
    task();
    restoreRendererState(renderer, rendererState);
    return true;
}
const emptyTexture = new Texture();
const emptyTexture3D = (() => {
    const texture = new Data3DTexture(new Uint8Array(4));
    texture.format = RGBAFormat;
    texture.needsUpdate = true;
    return texture;
})();
const updateEvent = { type: "update" };
export class AtmosphereLUTNode extends Node {
    static get type() {
        return "AtmosphereLUTNode";
    }
    constructor(parameters = new AtmosphereParameters(), textureType) {
        super(null);
        this.textureNodes = {
            transmittance: outputTexture(this, emptyTexture),
            multipleScattering: outputTexture(this, emptyTexture),
            scattering: outputTexture3D(this, emptyTexture3D),
            singleMieScattering: outputTexture3D(this, emptyTexture3D),
            higherOrderScattering: outputTexture3D(this, emptyTexture3D),
            irradiance: outputTexture(this, emptyTexture)
        };
        this.updating = false;
        this.updateBeforeType = NodeUpdateType.FRAME;
        this.parameters = parameters;
        this.textureType = textureType;
    }
    getTextureNode(name) {
        return this.textureNodes[name];
    }
    dispatchUpdate() {
        this.dispatchEvent(updateEvent);
    }
    *performCompute(renderer, context) {
        const { textures } = this;
        if (textures == null) {
            return;
        }
        yield run(renderer, () => {
            textures.computeTransmittance(renderer, context);
            this.dispatchUpdate();
        });
        yield run(renderer, () => {
            textures.computeMultipleScattering(renderer, context);
            this.dispatchUpdate();
        });
        yield run(renderer, () => {
            textures.computeScattering(renderer, context);
            this.dispatchUpdate();
        });
        yield run(renderer, () => {
            textures.computeIrradiance(renderer, context);
            this.dispatchUpdate();
        });
    }
    async updateTextures(renderer) {
        if (this.textures == null) {
            throw new Error("LUT textures are not initialized.");
        }
        const context = this.textures.createContext();
        this.updating = true;
        try {
            await timeSlice(this.performCompute(renderer, context));
        }
        catch (error) {
            throw error instanceof Error ? error : new Error();
        }
        finally {
            this.updating = false;
            context.dispose();
            this.disposeQueue?.();
        }
    }
    updateBefore({ renderer }) {
        if (renderer == null || this.version === this.currentVersion) {
            return;
        }
        this.currentVersion = this.version;
        this.updateTextures(renderer).catch((error) => {
            throw error instanceof Error ? error : new Error();
        });
    }
    setup(builder) {
        if (this.textures == null) {
            this.textures = isWebGPU(builder)
                ? new AtmosphereLUTTexturesWebGPU()
                : new AtmosphereLUTTexturesWebGL();
            const { transmittance, irradiance, multipleScattering, scattering, singleMieScattering, higherOrderScattering } = this.textureNodes;
            transmittance.value = this.textures.get("transmittance");
            multipleScattering.value = this.textures.get("multipleScattering");
            scattering.value = this.textures.get("scattering");
            singleMieScattering.value = this.textures.get("singleMieScattering");
            higherOrderScattering.value = this.textures.get("higherOrderScattering");
            irradiance.value = this.textures.get("irradiance");
            const textureType = isFloatLinearSupported(builder.renderer)
                ? this.textureType ?? FloatType
                : HalfFloatType;
            this.parameters.update();
            this.textures.setup(this.parameters, textureType);
        }
        return super.setup(builder);
    }
    dispose() {
        if (this.updating) {
            this.disposeQueue = () => {
                this.dispose();
                this.disposeQueue = undefined;
            };
            return;
        }
        this.textures?.dispose();
        this.textures = undefined;
        super.dispose();
    }
}
//# sourceMappingURL=AtmosphereLUTNode.js.map