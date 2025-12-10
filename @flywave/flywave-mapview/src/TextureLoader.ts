/* Copyright (C) 2025 flywave.gl contributors */

import * as THREE from "three";

export type RequestHeaders = Record<string, string>;

/**
 * A texture loader that supports request headers(e.g. for Authorization)
 */
export class TextureLoader {
    private readonly m_textureLoader = new THREE.TextureLoader();

    /**
     * Load an image from url and create a texture
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
        // Use THREE.js texture loader directly if no request header is set
        if (requestHeaders === undefined) {
            return await this.loadWithThreeLoader(url);
        }

        // Load image with fetch API if request header is set
        const response = await fetch(url, {
            headers: requestHeaders,
            signal: abortSignal,
            mode: crossOrigin ? "cors" : "no-cors"
        });
        const blob = await response.blob();

        // Load image from blob using THREE.js loader
        const texture = await this.loadWithThreeLoader(URL.createObjectURL(blob));

        // Set correct image format from original URL or blob mime type
        // (object URL does not contain file format)
        const isJPEG =
            blob.type === "image/jpeg/" ||
            url.search(/\.jpe?g($|\?)/i) > 0 ||
            url.search(/^data\:image\/jpeg/) === 0;
        texture.format = isJPEG ? THREE.RGBFormat : THREE.RGBAFormat;

        return texture;
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
