import { createMBMaterial } from './materials/index';
import * as THREE from 'three';
import type { RendererMaterialParameters } from '@flywave/flywave-materials';

export class MBMaterialFactory {
    static create(
        layerType: any,
        paint: Record<string, any>,
        options?: any,
    ) {
        const capabilities = options?.rendererCapabilities ?? { isWebGL2: true, maxTextures: 16, maxVertexTextures: 16, maxTextureSize: 4096, maxVertexUniforms: 1024 };
        return createMBMaterial(layerType, paint, capabilities);
    }
}
