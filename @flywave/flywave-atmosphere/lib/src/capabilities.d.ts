import { WebGLRenderer } from "three";
import type { Renderer } from "three/webgpu";
/**
 * Detects whether the renderer supports linear filtering of float textures.
 *
 * On WebGPU: checks for the 'float32-filterable' feature.
 * On WebGL2: checks for the OES_texture_float_linear extension.
 */
export declare function isFloatLinearSupported(renderer: Renderer | WebGLRenderer): boolean;
