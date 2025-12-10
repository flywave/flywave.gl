/* Copyright (C) 2025 flywave.gl contributors */

import {
    type WebGLRenderer,
    ClampToEdgeWrapping,
    DataTexture,
    FloatType,
    NearestFilter,
    RGBAFormat,
    WebGLRenderTarget
} from "three";

export class WebGLUtils {
    static createFloatTexture(
        renderer: WebGLRenderer,
        width: number,
        height: number,
        data?: Float32Array
    ): DataTexture {
        const texture = new DataTexture(
            data || new Float32Array(width * height * 4),
            width,
            height,
            RGBAFormat,
            FloatType
        );

        texture.wrapS = ClampToEdgeWrapping;
        texture.wrapT = ClampToEdgeWrapping;
        texture.minFilter = NearestFilter;
        texture.magFilter = NearestFilter;
        texture.needsUpdate = true;

        return texture;
    }

    static createRenderTarget(
        renderer: WebGLRenderer,
        width: number,
        height: number
    ): WebGLRenderTarget {
        return new WebGLRenderTarget(width, height, {
            format: RGBAFormat,
            type: FloatType,
            stencilBuffer: false,
            depthBuffer: false
        });
    }
}
