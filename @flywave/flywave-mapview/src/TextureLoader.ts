/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three/webgpu";

export type RequestHeaders = Record<string, string>;

/**
 * A texture loader that supports request headers(e.g. for Authorization)
 */
export class TextureLoader {
    private readonly m_textureLoader = new THREE.TextureLoader();

    /**
     * Load an image from url and create a texture
     *
     * The image is decoded exactly once, straight into an ImageBitmap:
     * `fetch -> arrayBuffer -> createImageBitmap`. The previous path went
     * `blob -> objectURL -> HTMLImageElement` (native decode #1, with the
     * element retained as `texture.image`), and callers that need an
     * ImageBitmap (e.g. TextureSerializer.textureToImageBitmap) then re-encoded
     * the same image again (decode #2) - the dominant main-thread cost while
     * streaming imagery tiles.
     *
     * Orientation: the bitmap is decoded in its natural (top-left origin)
     * orientation and `texture.flipY` stays false. That reproduces the old
     * pipeline exactly: three r185 WebGPU only flips in-shader for
     * `image instanceof ImageBitmap && flipY === true` (see the flipYUniform
     * in three.webgpu.js), so the old path (HTMLImageElement + flipY=true)
     * sampled the raw, natural orientation - and the terrain imagery flow
     * overrode flipY to false anyway before re-encoding bitmaps with
     * `imageOrientation: "none"`.
     *
     * @param url - URL to the image
     * @param requestHeaders - Optional request headers to load image(e.g. Authorization)
     * @param abortSignal - Optional AbortSignal to cancel the load.
     * @param crossOrigin - Enable/disable CORS
     */
    async load(
        url: string,
        requestHeaders?: RequestHeaders | undefined,
        abortSignal?: AbortSignal,
        crossOrigin: boolean = true
    ): Promise<THREE.Texture> {
        const response = await fetch(url, {
            headers: requestHeaders,
            signal: abortSignal,
            mode: crossOrigin ? "cors" : "no-cors"
        });
        if (!response.ok) {
            throw new Error(`failed to load texture: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        try {
            const imageBitmap = await createImageBitmap(new Blob([buffer]));
            const texture = new THREE.Texture(imageBitmap);
            texture.flipY = false;
            texture.needsUpdate = true;
            // three r137+ dropped RGBFormat support, so jpg/png textures are
            // always uploaded as RGBAFormat (the old RGB/RGBA format split by
            // JPEG/PNG is obsolete)
            texture.format = THREE.RGBAFormat;
            return texture;
        } catch (error) {
            // createImageBitmap cannot rasterize some formats the browser's
            // Image element can (e.g. SVG); fall back to the legacy loader.
            const blob = new Blob([buffer]);
            const texture = await this.loadWithThreeLoader(URL.createObjectURL(blob));
            texture.format = THREE.RGBAFormat;
            return texture;
        }
    }

    private loadWithThreeLoader(url: string): Promise<THREE.Texture> {
        return new Promise<THREE.Texture>((resolve, reject) => {
            this.m_textureLoader.setCrossOrigin("");
            this.m_textureLoader.load(
                url,
                texture => {
                    resolve(texture);
                },
                undefined,
                () => {
                    reject(new Error("failed to load texture"));
                }
            );
        });
    }
}
