/*
 * Copyright (C) 2020-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { convertFragmentShaderToWebGL2, convertVertexShaderToWebGL2 } from "@flywave/flywave-utils";
import * as THREE from "three";

import { getShaderMaterialDefine, setShaderMaterialDefine } from "./Utils";

/**
 * [[RawShaderMaterial]] parameters.
 */
export interface RendererMaterialParameters {
    rendererCapabilities: THREE.WebGLCapabilities;
}

export interface RawShaderMaterialParameters
    extends RendererMaterialParameters,
        THREE.ShaderMaterialParameters {}

/**
 * Base class for all raw shader materials. Ensures WebGL2 compatibility for WebGL1 shaders.
 */
export class RawShaderMaterial extends THREE.ShaderMaterial {
    /**
     * The constructor of `RawShaderMaterial`.
     *
     * @param params - `RawShaderMaterial` parameters.  Always required except when cloning
     * another material.
     */
    constructor(params?: RawShaderMaterialParameters) {
        // Built-in declarations that three.js ALWAYS injects via the
        // ShaderMaterial prefix (position, normal, and the camera matrices).
        // Conditional attributes (uv, tangent, color) are left in the shader
        // because three only declares them when a matching #define is set.
        const STRIP_ATTRS = ["position", "normal", "uv"];
        const STRIP_UNIFORMS = [
            "modelMatrix", "modelViewMatrix", "projectionMatrix",
            "viewMatrix", "normalMatrix", "cameraPosition",
        ];
        const stripBuiltins = (src: string | undefined): string | undefined => {
            if (!src) return src;
            let out = src;
            for (const name of [...STRIP_ATTRS, ...STRIP_UNIFORMS]) {
                // Remove `attribute ... <name>;` and `uniform ... <name>;` lines.
                out = out.replace(
                    new RegExp(`^\\s*attribute\\s+\\w+\\s+${name}\\s*;\\s*$`, "gm"),
                    "",
                );
                out = out.replace(
                    new RegExp(`^\\s*uniform\\s+\\w+\\s+${name}\\s*;\\s*$`, "gm"),
                    "",
                );
            }
            return out;
        };

        const shaderParams: THREE.ShaderMaterialParameters | undefined = params
            ? {
                  ...params,
                  vertexShader: stripBuiltins(params.vertexShader),
                  fragmentShader: stripBuiltins(params.fragmentShader),
              }
            : undefined;
        if (shaderParams) {
            delete (shaderParams as any).rendererCapabilities;
        }
        super(shaderParams);
        this.invalidateFog();
        this.invalidateLogarithmicDepthBuffer(params?.rendererCapabilities.logarithmicDepthBuffer as boolean);
        this.setOpacity(shaderParams?.opacity);
    }

    invalidateFog() {
        if (this.defines !== undefined && this.fog !== getShaderMaterialDefine(this, "USE_FOG")) {
            setShaderMaterialDefine(this, "USE_FOG", this.fog);
        }
    }

    invalidateLogarithmicDepthBuffer(logarithmicDepthBuffer:boolean){
    if (this.defines !== undefined && logarithmicDepthBuffer !== getShaderMaterialDefine(this, "USE_LOGDEPTHBUF")) {
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
