/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { type RawShaderMaterialParameters, RawShaderMaterial } from "./RawShaderMaterial";
import linesShaderChunk from "./ShaderChunks/LinesChunks";

const vertexSource: string = `
#ifdef USE_COLOR
attribute vec4 color;
varying vec3 vColor;
#endif

#include <common>  
// uniforms to implement double-precision
uniform mat4 u_mvp;             // combined modelView and projection matrix
uniform vec3 u_eyepos;          // eye position major
uniform vec3 u_eyepos_lowpart;  // eye position minor ((double) eyepos - (float) eyepos)

// vertex attributes
attribute vec3 position;        // high part
attribute vec3 positionLow;     // low part

#include <high_precision_vert_func>
#include <logdepthbuf_pars_vertex>

void main() {
    #ifdef USE_COLOR
    vColor = color.rgb;
    #endif

    vec3 pos = subtractDblEyePos(position);
    gl_Position = u_mvp * vec4(pos, 1.0);
    #include <logdepthbuf_vertex>
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

#include <common>  
uniform vec3 diffuseColor;
uniform float opacity;

#ifdef USE_COLOR
varying vec3 color;
#endif

#include <logdepthbuf_pars_fragment>
void main() {
    #ifdef USE_COLOR
    gl_FragColor = vec4( diffuseColor * vColor, opacity );
    #else
    gl_FragColor = vec4( diffuseColor, opacity );
    #endif
    #include <logdepthbuf_fragment>
}`;

/**
 * Parameters used when constructing a new {@link HighPrecisionLineMaterial}.
 */
export interface HighPrecisionLineMaterialParameters extends RawShaderMaterialParameters {
    /**
     * Line color.
     */
    color?: number | string | THREE.Color;
    /**
     * Line opacity.
     */
    opacity?: number;
}

/**
 * Material designed to render high precision lines (ideal for position-sensible data).
 */
export class HighPrecisionLineMaterial extends RawShaderMaterial {
    static DEFAULT_COLOR: number = 0x000050;
    static DEFAULT_OPACITY: number = 1.0;

    isHighPrecisionLineMaterial: boolean;

    /**
     * Constructs a new `HighPrecisionLineMaterial`.
     *
     * @param params - `HighPrecisionLineMaterial` parameters.  Always required except when cloning
     * another material.
     */
    constructor(params?: HighPrecisionLineMaterialParameters) {
        Object.assign(THREE.ShaderChunk, linesShaderChunk);

        const shaderParams: RawShaderMaterialParameters | undefined = params
            ? {
                  name: "HighPrecisionLineMaterial",
                  vertexShader: vertexSource,
                  fragmentShader: fragmentSource,
                  uniforms: {
                      // FLYWAVE-17373: Original uniform name 'diffuse' due to shader compilation
                      // errors with Metal in Safari 15 on MacOS Monterrey and iPadOS 15.
                      diffuseColor: new THREE.Uniform(
                          new THREE.Color(HighPrecisionLineMaterial.DEFAULT_COLOR)
                      ),
                      opacity: new THREE.Uniform(HighPrecisionLineMaterial.DEFAULT_OPACITY),
                      u_mvp: new THREE.Uniform(new THREE.Matrix4()),
                      u_eyepos: new THREE.Uniform(new THREE.Vector3()),
                      u_eyepos_lowpart: new THREE.Uniform(new THREE.Vector3())
                  },
                  rendererCapabilities: params.rendererCapabilities
              }
            : undefined;
        Object.assign(shaderParams as any, params as any);
        super(shaderParams);

        // this.name = "HighPrecisionLineMaterial";
        this.isHighPrecisionLineMaterial = true;

        // Apply initial parameter values.
        if (params) {
            if (params.color !== undefined) {
                this.color.set(params.color as any);
            }
            if (params.opacity !== undefined) {
                this.opacity = params.opacity;
            }
        }

        this.updateTransparencyFeature();
    }

    /**
     * Line color.
     */
    get color(): THREE.Color {
        return this.uniforms.diffuseColor.value as THREE.Color;
    }

    set color(value: THREE.Color) {
        this.uniforms.diffuseColor.value.copy(value);
    }

    private updateTransparencyFeature() {
        this.transparent = this.opacity < 1.0 ? true : false;
    }
}

export function isHighPrecisionLineMaterial(
    material: object | undefined
): material is HighPrecisionLineMaterial {
    return (
        material !== undefined &&
        (material as HighPrecisionLineMaterial).isHighPrecisionLineMaterial === true
    );
}
