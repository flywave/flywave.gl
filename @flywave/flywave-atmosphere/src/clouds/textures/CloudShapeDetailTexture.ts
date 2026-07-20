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

import { CLOUD_SHAPE_DETAIL_TEXTURE_SIZE } from "../cloudConstants";
import { worleyNoise } from "../noise/noise";
import type { AnyFloatType } from "../../tsl/types";
import { reinterpretType } from "../../tsl/types";

export class CloudShapeDetailTexture {
    readonly size = CLOUD_SHAPE_DETAIL_TEXTURE_SIZE;
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
        this.texture.name = "CloudShapeDetail";
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

            // Worley FBM at 4 frequencies: 2, 4, 8, 16
            const cellCount = float(2.0);
            const n0 = worleyNoise(point, cellCount.mul(1.0)).oneMinus();
            const n1 = worleyNoise(point, cellCount.mul(2.0)).oneMinus();
            const n2 = worleyNoise(point, cellCount.mul(4.0)).oneMinus();
            const n3 = worleyNoise(point, cellCount.mul(8.0)).oneMinus();

            const noise4 = vec4(n0, n1, n2, n3);
            const fbm3a = noise4.xyz.dot(vec4(0.625, 0.25, 0.125, 0).xyz);
            const fbm3b = noise4.yzw.dot(vec4(0.625, 0.25, 0.125, 0).xyz);
            const fbm2c = noise4.zw.dot(vec4(0.75, 0.25, 0, 0).xy);
            const worleyFbm = vec4(fbm3a, fbm3b, fbm2c, 0).xyz.dot(vec4(0.625, 0.25, 0.125, 0).xyz);

            textureStore(tex, globalId, vec4(worleyFbm, 0, 0, 0));
        })()
            .computeKernel([4, 4, 4])
            .setName("CloudShapeDetail");

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
