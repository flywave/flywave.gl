/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import { Fn, fwidth, length, pointUV, smoothstep, uniform, vec2, vec3, vec4 } from "three/tsl";
import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";

export interface CirclePointsMaterialParameters {
    size?: number;
    color?: THREE.Color;
    opacity?: number;
    rendererCapabilities?: { isWebGL2: boolean; logarithmicDepthBuffer: boolean };
}

export class CirclePointsMaterial extends NodeMaterial {
    static readonly DEFAULT_CIRCLE_SIZE = 1;

    private readonly m_sizeUniform = uniform(CirclePointsMaterial.DEFAULT_CIRCLE_SIZE);
    private readonly m_colorUniform = uniform(new THREE.Color());
    private readonly m_opacityUniform = uniform(1.0);

    constructor(parameters?: CirclePointsMaterialParameters) {
        super();
        this.name = "CirclePointsMaterial";
        this.depthTest = false;
        this.depthWrite = false;
        this.transparent = true;

        if (parameters?.size !== undefined) {
            this.m_sizeUniform.value = parameters.size;
        }
        if (parameters?.color !== undefined) {
            this.m_colorUniform.value.copy(parameters.color);
        }
        if (parameters?.opacity !== undefined) {
            this.m_opacityUniform.value = parameters.opacity;
        }

        this.fragmentNode = Fn(() => {
            const radius = float(0.5);
            const coords = pointUV.sub(vec2(0.5));
            const len = length(coords);
            const falloff = fwidth(len);
            const threshold = float(1).sub(smoothstep(radius.sub(falloff), radius, len));
            const alpha = this.m_opacityUniform.mul(threshold);
            return vec4(this.m_colorUniform, alpha);
        })();
    }

    get size(): number {
        return this.m_sizeUniform.value;
    }

    set size(size: number) {
        this.m_sizeUniform.value = size;
    }

    get color(): THREE.Color {
        return this.m_colorUniform.value;
    }

    set color(value: THREE.Color) {
        this.m_colorUniform.value.copy(value);
    }

    get opacity(): number {
        return this.m_opacityUniform?.value ?? 1.0;
    }

    // The three Material base class assigns this.opacity inside super() (before field
    // initialization, when m_opacityUniform is still undefined); assignments during that
    // window are silently discarded, and at the end of the constructor parameters.opacity
    // overwrites the real value.
    set opacity(value: number) {
        if (this.m_opacityUniform != null) this.m_opacityUniform.value = value;
    }

    setOpacity(value: number) {
        this.m_opacityUniform.value = value;
    }

    get uniforms() {
        return {
            size: { value: this.m_sizeUniform.value },
            opacity: { value: this.m_opacityUniform.value },
            diffuseColor: { value: this.m_colorUniform.value }
        };
    }
}
