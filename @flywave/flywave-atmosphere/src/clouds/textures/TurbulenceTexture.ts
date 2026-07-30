// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Fn, If, Return, vec3, vec4, float, globalId, uvec2, textureStore } from "three/tsl";
import { type ComputeNode, type Renderer, StorageTexture } from "three/webgpu";
import { NoColorSpace, HalfFloatType, RepeatWrapping } from "three";

import { CLOUD_TURBULENCE_TEXTURE_SIZE } from "../cloudConstants";
import { perlinNoise } from "../noise/noise";
import { reinterpretType } from "../../tsl/types";
import type { AnyFloatType } from "../../tsl/types";

function perlin3d(point: any): any {
    const perlin1 = perlinNoise(point, 12.0, 3);
    const perlin2 = perlinNoise(point.yzx.add(vec3(-19.1, 33.4, 47.2)), 12.0, 3);
    const perlin3 = perlinNoise(point.zxy.add(vec3(74.2, -124.5, 99.4)), 12.0, 3);
    return vec3(perlin1, perlin2, perlin3);
}

function curlNoise(point: any): any {
    const delta = float(0.1);
    const dx = vec3(delta, 0, 0);
    const dy = vec3(0, delta, 0);
    const dz = vec3(0, 0, delta);

    const px0 = perlin3d(point.sub(dx));
    const px1 = perlin3d(point.add(dx));
    const py0 = perlin3d(point.sub(dy));
    const py1 = perlin3d(point.add(dy));
    const pz0 = perlin3d(point.sub(dz));
    const pz1 = perlin3d(point.add(dz));

    const x = py1.z.sub(py0.z).sub(pz1.y.sub(pz0.y));
    const y = pz1.x.sub(pz0.x).sub(px1.z.sub(px0.z));
    const z = px1.y.sub(px0.y).sub(py1.x.sub(py0.x));

    const divisor = float(1.0).div(delta.mul(2.0));
    return vec3(x, y, z).mul(divisor).normalize();
}

export class TurbulenceTexture {
    readonly size = CLOUD_TURBULENCE_TEXTURE_SIZE;
    readonly texture: StorageTexture;
    private computeNode?: ComputeNode;

    constructor() {
        this.texture = new StorageTexture(this.size, this.size);
        this.texture.type = HalfFloatType;
        this.texture.colorSpace = NoColorSpace;
        this.texture.generateMipmaps = false;
        this.texture.wrapS = RepeatWrapping;
        this.texture.wrapT = RepeatWrapping;
        this.texture.name = "Turbulence";
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

            const c = curlNoise(point);
            const result = c.mul(0.5).add(0.5);
            textureStore(tex, globalId.xy, vec4(result, 1.0));
        })()
            .computeKernel([8, 8, 1])
            .setName("Turbulence");

        return renderer.compute(this.computeNode, [Math.ceil(size / 8), Math.ceil(size / 8), 1]);
    }

    dispose(): void {
        this.texture.dispose();
        this.computeNode?.dispose();
    }
}
