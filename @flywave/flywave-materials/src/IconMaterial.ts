/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from "three";

import {
    RawShaderMaterial,
    RawShaderMaterialParameters,
    RendererMaterialParameters
} from "./RawShaderMaterial";

const vertexSource: string = `
attribute vec4 position;
attribute vec4 color;
attribute vec2 uv;

uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying vec4 vColor;
varying vec2 vUv;

void main() {
    vUv = uv;
    vColor = color;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xyz, 1.0);
}`;

const fragmentSource: string = `
precision highp float;
precision highp int;

uniform sampler2D map;
uniform bool uIsSdf;
uniform float uEdge;
uniform float uGamma;
uniform vec3 uHaloColor;
uniform float uHaloAlpha;
uniform float uHaloWidth;
uniform float uHaloBlur;

varying vec4 vColor;
varying vec2 vUv;

void main() {

    vec4 tex = texture2D(map, vUv.xy);

    if (!uIsSdf) {
        vec4 color = tex * vColor;
        if (color.a < 0.05) {
            discard;
        }
        gl_FragColor = color;
        return;
    }

    // SDF icon: the alpha channel holds the signed distance field with the
    // glyph edge at uEdge (0.75 for mapbox sprites). Fill matches mapbox
    // symbol.fragment: buff=0.75, gamma=EDGE_GAMMA → smoothstep(buff-gamma,
    // buff+gamma, dist). The halo ring sits at buff_halo = uEdge - uHaloWidth
    // with a blur-width gamma (mapbox: buff=(6-halo_width)/SDF_PX,
    // gamma=(halo_blur*1.19/SDF_PX + EDGE_GAMMA)).
    float d = tex.a;
    float fillA = smoothstep(uEdge - uGamma, uEdge + uGamma, d);
    float haloBuff = uEdge - uHaloWidth;
    float haloGamma = uHaloBlur + uGamma;
    // Mapbox draws the SDF halo and fill as two separate passes: the fill is
    // then blended ON TOP of the halo (alpha accumulates where both cover —
    // the halo covers the fill core too, no (1-fillA) cut). Emulate that
    // two-layer composite in one pass: top = fill (premultiplied vColor,
    // rgb = color·op, a = op), bottom = halo premultiplied by its color alpha
    // and icon-opacity.
    float haloCov = smoothstep(haloBuff - haloGamma, haloBuff + haloGamma, d);
    float aFill = fillA * vColor.a;
    float aHalo = haloCov * uHaloAlpha * vColor.a;
    vec3 rgbHalo = uHaloColor.rgb * aHalo;
    vec3 rgb = vColor.rgb * fillA + rgbHalo * (1.0 - aFill);
    float alpha = aFill + aHalo * (1.0 - aFill);
    gl_FragColor = vec4(rgb, alpha);
}`;

/**
 * Parameters used when constructing a new {@link IconMaterial}.
 */
export interface IconMaterialParameters extends RendererMaterialParameters {
    /**
     * Texture map.
     */
    map: THREE.Texture;
    /**
     * Enable the SDF rendering path (texture alpha = distance field).
     */
    sdf?: boolean;
    /**
     * SDF edge value in the texture (mapbox sprites use 0.75).
     */
    edge?: number;
    /**
     * SDF edge antialiasing width.
     */
    gamma?: number;
    /**
     * Halo color (RGB).
     */
    haloColor?: THREE.Color;
    /**
     * Halo color alpha (icon-halo-color rgba alpha, mapbox premultiplies the
     * halo by it).
     */
    haloAlpha?: number;
    /**
     * Halo width in SDF field units (0..1).
     */
    haloWidth?: number;
    /**
     * Halo blur in SDF field units (0..1).
     */
    haloBlur?: number;
}

/**
 * 2D material for icons, similar to [[TextMaterial]]. Uses component in texture coordinates to
 * apply opacity.
 */
export class IconMaterial extends RawShaderMaterial {
    /**
     * Constructs a new `IconMaterial`.
     *
     * @param params - `IconMaterial` parameters. Always required except when cloning another
     * material.
     */
    constructor(params?: IconMaterialParameters) {
        const shaderParams: RawShaderMaterialParameters | undefined = params
            ? {
                  name: "IconMaterial",
                  vertexShader: vertexSource,
                  fragmentShader: fragmentSource,
                  uniforms: {
                      map: new THREE.Uniform(params.map),
                      uIsSdf: new THREE.Uniform(params.sdf === true),
                      uEdge: new THREE.Uniform(params.edge ?? 0.75),
                      // Mapbox EDGE_GAMMA = 0.105 / devicePixelRatio (1x here);
                      // it feeds both the fill edge AA and the halo blur gamma.
                      uGamma: new THREE.Uniform(params.gamma ?? 0.105),
                      uHaloColor: new THREE.Uniform(params.haloColor ?? new THREE.Color(0, 0, 0)),
                      uHaloAlpha: new THREE.Uniform(params.haloAlpha ?? 1),
                      uHaloWidth: new THREE.Uniform(params.haloWidth ?? 0),
                      uHaloBlur: new THREE.Uniform(params.haloBlur ?? 0)
                  },
                  depthTest: false,
                  depthWrite: false,
                  transparent: true,

                  // NOTE: do NOT set `vertexColors: true` here. The vertex
                  // shader declares its own `attribute vec4 color` (RGBA with
                  // per-vertex opacity); `vertexColors` would make three.js
                  // inject its own `attribute vec3 color` into the
                  // ShaderMaterial prefix, causing a redefinition compile
                  // error and icons never rendering.
                  premultipliedAlpha: true,
                  rendererCapabilities: params.rendererCapabilities
              }
            : undefined;
        super(shaderParams);
    }

    /**
     * Icon texture map/atlas.
     */
    get map(): THREE.Texture {
        return this.uniforms.map.value;
    }
}
