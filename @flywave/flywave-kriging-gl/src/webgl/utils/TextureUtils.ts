/* Copyright (C) 2025 flywave.gl contributors */

import { ClampToEdgeWrapping, DataTexture, FloatType, NearestFilter, RGBAFormat } from "three";

import type { Variogram } from "../../core/Variogram";

export class TextureUtils {
    // 修复 TextureUtils.ts 中的createVariogramTexture方法
    static createVariogramTexture(variogram: Variogram): DataTexture {
        const { n, K, M, x, y, t } = variogram.data; // 注意：添加了t（原始值）

        const width = Math.min(1024, Math.ceil(Math.sqrt(n)));
        const height = Math.ceil(n / width);

        const data = new Float32Array(width * height * 4);

        // 修复：正确打包所有必要数据
        for (let i = 0; i < n; i++) {
            const idx = i * 4;
            data[idx] = M[i]; // M[i] - 权重系数 λ_i
            data[idx + 1] = x[i]; // x coordinate
            data[idx + 2] = y[i]; // y coordinate
            data[idx + 3] = t[i]; // 原始观测值 Z(x_i) - 这是关键修复！
        }

        const texture = new DataTexture(data, width, height, RGBAFormat, FloatType);
        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        texture.minFilter = NearestFilter;
        texture.magFilter = NearestFilter;
        texture.needsUpdate = true;

        return texture;
    }

    static ceilPowerOfTwo(value: number): number {
        return Math.pow(2, Math.ceil(Math.log2(value)));
    }
}
