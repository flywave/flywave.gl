/* Copyright (C) 2025 flywave.gl contributors */
import { Data3DTexture, FileLoader, Loader, type LoadingManager, FloatType } from "three";

export interface EXR3DTextureLoaderOptions {
    width?: number;
    height?: number;
    depth?: number;
}

export class EXR3DTextureLoader extends Loader<Data3DTexture> {
    options: EXR3DTextureLoaderOptions;

    constructor(options: EXR3DTextureLoaderOptions = {}, manager?: LoadingManager) {
        super(manager);
        this.options = options;
    }

    load(
        url: string,
        onLoad?: (data: Data3DTexture) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (err: unknown) => void
    ): Data3DTexture {
        const { width, height, depth } = this.options;
        const texture = new Data3DTexture(null, width, height, depth);

        const loader = new FileLoader(this.manager);
        loader.setPath(this.path);
        loader.setResponseType("arraybuffer");
        loader.load(
            url,
            (buffer: ArrayBuffer) => {
                try {
                    const parsed = this.parse(buffer);
                    texture.image = parsed.image;
                    texture.type = parsed.type;
                    texture.format = parsed.format;
                    texture.needsUpdate = true;
                    onLoad?.(texture);
                } catch (e) {
                    if (onError != null) {
                        onError(e);
                    } else {
                        console.error(e);
                    }
                    this.manager.itemError(url);
                }
            },
            onProgress,
            onError
        );

        return texture;
    }

    parse(buffer: ArrayBuffer): Data3DTexture {
        const byteArray = new Uint8Array(buffer);
        const { width, height, depth } = this.options;

        const float32Array = new Float32Array(
            byteArray.buffer,
            byteArray.byteOffset,
            byteArray.byteLength / 4
        );
        const texture = new Data3DTexture(float32Array, width ?? 256, height ?? 128, depth ?? 32);
        texture.type = FloatType;
        texture.needsUpdate = true;
        return texture;
    }
}
