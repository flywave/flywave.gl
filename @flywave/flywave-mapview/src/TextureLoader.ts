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
     * orientation and `texture.flipY` is false — the loader guarantees a
     * ZERO-flip texture on both backends. three r185's flip behaviour is
     * asymmetric (WebGPU flips ImageBitmap at upload; the WebGL fallback flips
     * at upload AND in the shader), so texture-level flips cannot be made to
     * agree across backends. Consumers that need the web-mercator north-up
     * orientation own it in their UVs instead: see the ground-plane UV
     * convention in AddGroundPlane / WebTileLoader. The terrain flow also
     * re-creates textures from ImageBitmaps itself and sets flipY explicitly.
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
            // Zero-flip contract: v = 0 is the bitmap's top (north) row on
            // both backends. See the orientation note above.
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
            // Same zero-flip contract as the ImageBitmap path.
            texture.flipY = false;
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
