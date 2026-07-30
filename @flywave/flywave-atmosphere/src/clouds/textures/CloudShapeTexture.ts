// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    Fn,
    If,
    Return,
    dot,
    float,
    vec2,
    vec3,
    vec4,
    globalId,
    uvec3,
    textureStore
} from "three/tsl";
import { type ComputeNode, type Renderer, Storage3DTexture } from "three/webgpu";
import { NoColorSpace, HalfFloatType, RepeatWrapping } from "three";

import { CLOUD_SHAPE_TEXTURE_SIZE } from "../cloudConstants";
import { perlinNoise, worleyNoise, remapOut, remap } from "../noise/noise";
import type { AnyFloatType } from "../../tsl/types";
import { reinterpretType } from "../../tsl/types";

export class CloudShapeTexture {
    readonly size = CLOUD_SHAPE_TEXTURE_SIZE;
    readonly texture: Storage3DTexture;
    private computeNode?: ComputeNode;

    constructor() {
        this.texture = new Storage3DTexture(this.size, this.size, this.size);
        this.texture.type = HalfFloatType;
        this.texture.colorSpace = NoColorSpace;
        this.texture.generateMipmaps = false;
        this.texture.wrapS = RepeatWrapping;
        this.texture.wrapT = RepeatWrapping;
        this.texture.wrapR = RepeatWrapping;
        this.texture.name = "CloudShape";
    }

    compute(renderer: Renderer): void {
        this.computeNode?.dispose();

        const size = this.size;
        const tex = this.texture;

        this.computeNode = Fn(() => {
            const dims = uvec3(size, size, size);
            If(globalId.greaterThanEqual(dims).any(), () => {
                Return();
            });

            const point = vec3(
                globalId.x.toFloat().add(0.5).div(size),
                globalId.y.toFloat().add(0.5).div(size),
                globalId.z.toFloat().div(size)
            ).toConst();

            // --- Perlin-Worley ---
            const perlin = perlinNoise(point, 8.0, 3).clamp(0, 1);

            const worleyFbm3 = vec3(
                worleyNoise(point, float(8.0)).oneMinus(),
                worleyNoise(point, float(32.0)).oneMinus(),
                worleyNoise(point, float(56.0)).oneMinus()
            ).dot(vec3(0.625, 0.25, 0.125));

            const perlinWorley = remapOut(perlin, float(0.0), float(1.0), worleyFbm3, float(1.0));

            // --- Worley FBM (4 octaves: 8, 16, 32, 64) ---
            const n0 = worleyNoise(point, float(8.0)).oneMinus();
            const n1 = worleyNoise(point, float(16.0)).oneMinus();
            const n2 = worleyNoise(point, float(32.0)).oneMinus();
            const n3 = worleyNoise(point, float(64.0)).oneMinus();

            const noise4 = vec4(n0, n1, n2, n3);
            const fbm3a = noise4.xyz.dot(vec3(0.625, 0.25, 0.125));
            const fbm3b = noise4.yzw.dot(vec3(0.625, 0.25, 0.125));
            const fbm2c = noise4.zw.dot(vec2(0.75, 0.25));
            const worleyFbm4 = vec3(fbm3a, fbm3b, fbm2c).dot(vec3(0.625, 0.25, 0.125));

            // Final output
            const result = remap(perlinWorley, worleyFbm4.sub(1.0), float(1.0));

            textureStore(tex, globalId, vec4(result, 0, 0, 0));
        })()
            .computeKernel([4, 4, 4])
            .setName("CloudShape");

        return renderer.compute(this.computeNode, [
            Math.ceil(size / 4),
            Math.ceil(size / 4),
            Math.ceil(size / 4)
        ]);
    }

    dispose(): void {
        this.texture.dispose();
        this.computeNode?.dispose();
    }
}
