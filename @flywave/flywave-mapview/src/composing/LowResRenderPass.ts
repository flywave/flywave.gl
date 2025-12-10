/* Copyright (C) 2025 flywave.gl contributors */

import { BlendFunction, Effect } from "postprocessing";
import * as THREE from "three";

export class LowResEffect extends Effect {
    private m_renderTarget: THREE.WebGLRenderTarget | null = null;
    private m_pixelRatio: number | undefined;
    private m_width = 0;
    private m_height = 0;

    constructor(pixelRatio?: number) {
        super("LowResEffect", null, {
            blendFunction: BlendFunction.SKIP // 不进行混合，直接覆盖
        });
        this.m_pixelRatio = pixelRatio;
    }

    dispose() {
        this.m_renderTarget?.dispose();
        super.dispose();
    }

    set pixelRatio(ratio: number | undefined) {
        this.m_pixelRatio = ratio;
        this.updateRenderTarget();
    }

    get pixelRatio(): number | undefined {
        return this.m_pixelRatio;
    }

    update(
        renderer: THREE.WebGLRenderer,
        inputBuffer: THREE.WebGLRenderTarget,
        deltaTime?: number
    ): void {
        if (!this.m_pixelRatio || this.m_pixelRatio >= 1) {
            return;
        }

        // 初始化或更新渲染目标
        if (
            !this.m_renderTarget ||
            this.m_width !== inputBuffer.width ||
            this.m_height !== inputBuffer.height
        ) {
            this.m_width = inputBuffer.width;
            this.m_height = inputBuffer.height;
            this.updateRenderTarget();
        }

        // 渲染到低分辨率目标
        renderer.setRenderTarget(this.m_renderTarget);
        renderer.clear();
        renderer.render(this.mainScene, this.mainCamera);

        // 使用低分辨率纹理作为效果输入
        this.uniforms.get("inputBuffer").value = this.m_renderTarget.texture;
    }

    private updateRenderTarget() {
        if (!this.m_pixelRatio) return;

        this.m_renderTarget?.dispose();

        this.m_renderTarget = new THREE.WebGLRenderTarget(
            Math.floor(this.m_width * this.m_pixelRatio),
            Math.floor(this.m_height * this.m_pixelRatio),
            {
                minFilter: THREE.LinearFilter,
                magFilter: THREE.LinearFilter,
                format: THREE.RGBAFormat,
                depthBuffer: false,
                stencilBuffer: false
            }
        );
        this.m_renderTarget.texture.name = "LowResEffect.target";
    }

    setSize(width: number, height: number): void {
        this.m_width = width;
        this.m_height = height;
        this.updateRenderTarget();
    }
}
