/* Copyright (C) 2025 flywave.gl contributors */

import { DepthCopyPass } from "postprocessing";
import * as THREE from "three";
import { ClassificationType } from "../DataSource";


/**
 * DepthReadingPass extends DepthCopyPass to provide depth reading functionality.
 * Note: readDepth does not support logarithmic depth buffers and will be incompatible 
 * with scenes using logarithmic depth buffering. Future versions will add compatibility.
 */
export class DepthReadingPass extends DepthCopyPass {
    private readBuffer: Float32Array = new Float32Array(4);

    constructor() {
        super({ depthPacking: THREE.BasicDepthPacking });
        this.fullscreenMaterial.stencilWrite = true;
        this.fullscreenMaterial.stencilRef = 0;
        this.fullscreenMaterial.stencilFunc = THREE.AlwaysStencilFunc;
        this.fullscreenMaterial.stencilZPass = THREE.ReplaceStencilOp;

    }

    setClassificationTypeFilter(classificationType: ClassificationType | 0): void {
        this.fullscreenMaterial.stencilRef = classificationType;
        this.fullscreenMaterial.stencilFunc = classificationType === 0 ?
            THREE.AlwaysStencilFunc : THREE.EqualStencilFunc;
    }

    /**
     * Reads depth value at the given NDC coordinates.
     * Note: This method does not support logarithmic depth buffers.
     * Compatibility with logarithmic depth buffers will be added in future versions.
     * @param ndc - Normalized device coordinates
     * @returns depth value or null if invalid
     */
    readDepth(ndc: THREE.Vector2 | THREE.Vector3): number | null {
        const renderTarget = this["renderTarget"];
        if (!renderTarget) return null;
        const uvX = (ndc.x * 0.5) + 0.5;
        const uvY = (ndc.y * 0.5) + 0.5;

        const x = Math.floor(uvX * renderTarget.width);
        const y = Math.floor(uvY * renderTarget.height);

        if (x < 0 || x >= renderTarget.width || y < 0 || y >= renderTarget.height) {
            return null;
        }

        if (this.renderer.capabilities.logarithmicDepthBuffer) {
            throw new Error("DepthReadingPass does not support logarithmic depth buffers.");
        }

        this.renderer.readRenderTargetPixels(renderTarget, x, y, 1, 1, this.readBuffer);


        const depth = this.readBuffer[0];

        return depth < 0.999999 ? depth : null;
    }
}