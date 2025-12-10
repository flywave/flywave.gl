/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

/**
 * The base shader to use for {@link @flywave/flywave-mapview#MapView}'s
 * composing passes, like {@link MSAAMaterial}.
 */
export const CopyShader: THREE.ShaderMaterialParameters = {
    uniforms: {
        tDiffuse: { value: null },
        opacity: { value: 1.0 }
    },
    vertexShader: `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`,
    fragmentShader: `
    uniform float opacity;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
        vec4 texel = texture2D( tDiffuse, vUv );
        gl_FragColor = opacity * texel;
    }`
};

/**
 * The material is used for composing.
 */
export class CopyMaterial extends THREE.ShaderMaterial {
    /**
     * The constructor of `CopyMaterial`.
     *
     * @param uniforms - The [[CopyShader]]'s uniforms.
     */
    constructor(uniforms: Record<string, THREE.IUniform>) {
        super({
            name: "CopyMaterial",
            uniforms,
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            premultipliedAlpha: true,
            transparent: false,
            blending: THREE.NoBlending,
            depthTest: false,
            depthWrite: false
        });
    }
}
