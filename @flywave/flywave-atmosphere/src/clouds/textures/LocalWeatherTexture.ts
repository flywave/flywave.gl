// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    Fn,
    If,
    Return,
    dot,
    smoothstep,
    vec2,
    vec3,
    vec4,
    float,
    globalId,
    uvec2,
    textureStore
} from "three/tsl";
import { type ComputeNode, type Renderer, StorageTexture } from "three/webgpu";
import { NoColorSpace, HalfFloatType, RepeatWrapping } from "three";

import { CLOUD_LOCAL_WEATHER_TEXTURE_SIZE } from "../cloudConstants";
import { perlinNoise, perlinNoiseVec3, worleyNoise } from "../noise/noise";
import { reinterpretType } from "../../tsl/types";
import type { AnyFloatType } from "../../tsl/types";

function worleyFbm(
    point: any,
    frequency: number,
    amplitude: number,
    lacunarity: number,
    gain: number,
    octaveCount: number
): any {
    let noise = float(0);
    let freq = float(frequency);
    let amp = float(amplitude);
    const lac = float(lacunarity);
    const g = float(gain);
    for (let i = 0; i < octaveCount; i++) {
        noise = noise.add(amp.mul(worleyNoise(point, freq).oneMinus()));
        freq = freq.mul(lac);
        amp = amp.mul(g);
    }
    return noise;
}

export class LocalWeatherTexture {
    readonly size = CLOUD_LOCAL_WEATHER_TEXTURE_SIZE;
    readonly texture: StorageTexture;
    private computeNode?: ComputeNode;

    constructor() {
        this.texture = new StorageTexture(this.size, this.size);
        this.texture.type = HalfFloatType;
        this.texture.colorSpace = NoColorSpace;
        this.texture.generateMipmaps = false;
        this.texture.wrapS = RepeatWrapping;
        this.texture.wrapT = RepeatWrapping;
        this.texture.name = "LocalWeather";
    }

    compute(renderer: Renderer): void {
        this.computeNode?.dispose();

        const size = this.size;
        const tex = this.texture;

        this.computeNode = Fn(() => {
            const dims = uvec2(size, size);
            If(globalId.xy.greaterThanEqual(dims).any(), () => {
                Return();
            });

            const point = vec3(
                globalId.x.toFloat().add(0.5).div(size),
                globalId.y.toFloat().add(0.5).div(size),
                float(0.0)
            ).toConst();

            const out = vec4(0).toVar();

            // G channel: Mid clouds
            {
                const worley = worleyFbm(point.add(vec3(0.5)), 8.0, 0.4, 2.0, 0.95, 4);
                out.g = smoothstep(float(1.0), float(1.4), worley);
            }

            // R channel: Low clouds (subtract mid clouds)
            {
                const worley = worleyFbm(point, 16.0, 0.4, 2.0, 0.95, 4);
                out.r = smoothstep(float(0.8), float(1.4), worley).sub(out.g).saturate();
            }

            // B channel: High clouds
            {
                const perlin = perlinNoiseVec3(point, vec3(6.0, 12.0, 1.0), 8);
                out.b = smoothstep(float(-0.5), float(0.5), perlin);
            }

            // A channel: Extra layer
            {
                const perlin = perlinNoise(point.add(vec3(-19.1, 33.4, 47.2)), 32.0, 4);
                out.a = smoothstep(float(-0.5), float(0.5), perlin);
            }

            out.a = float(1.0);
            textureStore(tex, globalId.xy, out);
        })()
            .computeKernel([8, 8, 1])
            .setName("LocalWeather");

        return renderer.compute(this.computeNode, [Math.ceil(size / 8), Math.ceil(size / 8), 1]);
    }

    dispose(): void {
        this.texture.dispose();
        this.computeNode?.dispose();
    }
}
