/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

import { CopyShader } from "./CopyMaterial";

/**
 * The material to use for the quad of the {@link @flywave/flywave-mapview#MSAARenderPass}
 * in the composing.
 */
export class MSAAMaterial extends THREE.ShaderMaterial {
    /**
     * The constructor of `MSAAMaterial`.
     *
     * @param uniforms - The [[CopyShader]]'s uniforms.
     */
    constructor(uniforms: Record<string, THREE.IUniform>) {
        super({
            uniforms,
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            premultipliedAlpha: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthTest: false,
            depthWrite: false
        });
    }
}
