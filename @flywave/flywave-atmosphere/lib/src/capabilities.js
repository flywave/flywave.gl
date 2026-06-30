/* Copyright (C) 2025 flywave.gl contributors */
import { WebGLRenderer } from "three";
/**
 * Detects whether the renderer supports linear filtering of float textures.
 *
 * On WebGPU: checks for the 'float32-filterable' feature.
 * On WebGL2: checks for the OES_texture_float_linear extension.
 */
export function isFloatLinearSupported(renderer) {
    return renderer instanceof WebGLRenderer
        ? renderer.getContext().getExtension("OES_texture_float_linear") != null
        : renderer.backend.hasFeature?.("float32-filterable") ?? false;
}
//# sourceMappingURL=capabilities.js.map