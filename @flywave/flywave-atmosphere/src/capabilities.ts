/* Copyright (C) 2025 flywave.gl contributors */

import { WebGLRenderer } from "three";
import type { Renderer } from "three/webgpu";

/**
 * Detects whether the renderer supports linear filtering of float textures.
 *
 * On WebGPU: checks for the 'float32-filterable' feature.
 * On WebGL2: checks for the OES_texture_float_linear extension.
 */
export function isFloatLinearSupported(renderer: Renderer | WebGLRenderer): boolean {
    return renderer instanceof WebGLRenderer
        ? renderer.getContext().getExtension("OES_texture_float_linear") != null
        : (
              renderer.backend as Renderer["backend"] & {
                  hasFeature?: (name: string) => boolean;
              }
          ).hasFeature?.("float32-filterable") ?? false;
}
