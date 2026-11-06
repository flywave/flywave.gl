/* Copyright (C) 2025 flywave.gl contributors */
// @ts-nocheck

import { float, Fn, uniform, vec4 } from "three/tsl";
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

        // NOTE: routed through `colorNode`, NOT `fragmentNode` — a custom
        // fragmentNode bypasses the renderer's MRT wrapping in three r185
        // (see SolidLineMaterial.setupNodes for the full comment) and makes
        // the WebGPU pipeline invalid in the MRT scene pass.
        //
        // The per-fragment circle falloff cannot be expressed here: `pointUV`
        // is WebGL-only (it emits `gl_PointCoord`), so on the WebGPU backend
        // the fragment module failed to parse ("unresolved value
        // 'gl_PointCoord'") and the resulting invalid pipeline discarded the
        // whole frame's command buffer. There is nothing to shade anyway:
        // WebGPU rasterizes `point-list` primitives as exactly one pixel, and
        // the node-based WebGL fallback pins `gl_PointSize` to 1.0
        // (GLSLNodeBuilder), so a point covers a single fragment. `size` is
        // therefore used for picking (`Circles.testPoint`) only.
        const fragmentColor = vec4(this.m_colorUniform, this.m_opacityUniform);
        this.colorNode = fragmentColor;
        // Alpha above already includes m_opacityUniform (aliased by the
        // `opacity` accessor); pin opacityNode to 1 to avoid double-multiply.
        this.opacityNode = float(1);
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
