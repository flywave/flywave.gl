// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

// TSL shader generators use operator chaining not fully typed in @types/three.

import { abs, Fn, screenCoordinate, time, vec2, vec3 } from "three/tsl";

/**
 * Interleaved Gradient Noise generator for dithering.
 *
 * Reference: https://advances.realtimerendering.com/s2014/index.html
 */
export const interleavedGradientNoise = seed => {
    return seed.dot(vec2(0.06711056, 0.00583715)).fract().mul(52.9829189).fract();
};

/**
 * IGN dithering node. Add to the final color output to reduce banding.
 *
 * Reference (sixth from the bottom): https://www.shadertoy.com/view/MslGR8
 */
export const dithering = Fn(() => {
    const seed = vec2(screenCoordinate.xy).add(time.fract().mul(1337));
    const noise = interleavedGradientNoise(seed);
    return vec3(noise, noise.oneMinus(), noise).sub(0.5).div(255);
}).once()();
