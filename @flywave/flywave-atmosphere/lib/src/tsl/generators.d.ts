/**
 * Interleaved Gradient Noise generator for dithering.
 *
 * Reference: https://advances.realtimerendering.com/s2014/index.html
 */
export declare const interleavedGradientNoise: (seed: any) => any;
/**
 * IGN dithering node. Add to the final color output to reduce banding.
 *
 * Reference (sixth from the bottom): https://www.shadertoy.com/view/MslGR8
 */
export declare const dithering: import("three/webgpu").Node<"vec3">;
