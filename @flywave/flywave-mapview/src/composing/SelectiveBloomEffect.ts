import { BloomEffectOptions, SelectiveBloomEffect as PostProcessingSelectiveBloomEffect } from 'postprocessing'
import { MeshDepthMaterial, WebGLRenderer } from 'three';

export class SelectiveBloomEffect extends PostProcessingSelectiveBloomEffect {

    initialize(renderer: WebGLRenderer, alpha: boolean, frameBufferType: number): void {
        super.initialize(renderer, alpha, frameBufferType); 
    }
}
