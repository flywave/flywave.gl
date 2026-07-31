/* Copyright (C) 2025 flywave.gl contributors */

import { convertFragmentShaderToWebGL2, convertVertexShaderToWebGL2 } from "@flywave/flywave-utils";
import * as THREE from "three/webgpu";

import { getShaderMaterialDefine, setShaderMaterialDefine } from "./Utils";

/**
 * Renderer capability descriptor consumed by legacy GLSL-based materials.
 *
 * In the WebGPU renderer architecture, these properties are derived from the
 * renderer configuration rather than queried from a `WebGLRenderingContext`.
 * They exist solely to bridge the transition period while GLSL materials are
 * progressively rewritten as TSL node materials.
 */
export interface RendererCapabilities {
    readonly isWebGL2: boolean;
    readonly logarithmicDepthBuffer: boolean;
}

export interface RendererMaterialParameters {
    rendererCapabilities: RendererCapabilities;
}

export interface RawShaderMaterialParameters
    extends RendererMaterialParameters,
        THREE.ShaderMaterialParameters {}

/**
 * Base class for all raw shader materials.
 *
 * All shaders are compiled as GLSL3 (ES 3.00) since both the WebGPU WebGL2
 * backend and native WebGL2 contexts support it. The GLSL1-to-GLSL3 conversion
 * via {@link convertVertexShaderToWebGL2} / {@link convertFragmentShaderToWebGL2}
 * is applied unconditionally to remain compatible with shaders authored in
 * legacy GLSL1 syntax.
 */
export class RawShaderMaterial extends THREE.RawShaderMaterial {
    /**
     * The constructor of `RawShaderMaterial`.
     *
     * @param params - `RawShaderMaterial` parameters.  Always required except when cloning
     * another material.
     */
    constructor(params?: RawShaderMaterialParameters) {
        const shaderParams: THREE.ShaderMaterialParameters | undefined = params
            ? {
                  ...params,
                  glslVersion: THREE.GLSL3,
                  vertexShader: params.vertexShader
                      ? convertVertexShaderToWebGL2(params.vertexShader)
                      : params.vertexShader,
                  fragmentShader: params.fragmentShader
                      ? convertFragmentShaderToWebGL2(params.fragmentShader)
                      : params.fragmentShader
              }
            : undefined;
        // Remove properties that are not in THREE.ShaderMaterialParameters, otherwise THREE.js
        // will log warnings.
        if (shaderParams) {
            delete (shaderParams as any).rendererCapabilities;
        }
        super(shaderParams);
        this.invalidateFog();
        this.invalidateLogarithmicDepthBuffer(
            params?.rendererCapabilities.logarithmicDepthBuffer ?? false
        );
        this.setOpacity(shaderParams?.opacity);
    }

    invalidateFog() {
        if (this.defines !== undefined && this.fog !== getShaderMaterialDefine(this, "USE_FOG")) {
            setShaderMaterialDefine(this, "USE_FOG", this.fog);
        }
    }

    invalidateLogarithmicDepthBuffer(logarithmicDepthBuffer: boolean) {
        if (
            this.defines !== undefined &&
            logarithmicDepthBuffer !== getShaderMaterialDefine(this, "USE_LOGDEPTHBUF")
        ) {
            setShaderMaterialDefine(this, "USE_LOGDEPTHBUF", logarithmicDepthBuffer);
        }
    }

    /**
     * To set the material's opacity property value and also update the opacity value of the uniforms if needed.
     * @param opacity If undefined, the value is not set
     */
    setOpacity(opacity?: number) {
        if (opacity !== undefined) {
            // The base constructor may set the opacity property before,
            // therefore we don't check unequality of the current and new opacity value:
            this.opacity = opacity;
            if (this.uniforms?.opacity) {
                this.uniforms.opacity.value = opacity;
            }
        }
    }
}
