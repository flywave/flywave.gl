/* Copyright (C) 2025 flywave.gl contributors */
import { DataTexture, FileLoader, Loader, type LoadingManager, FloatType } from "three";

export interface EXRTextureLoaderOptions {
    width?: number;
    height?: number;
}

export class EXRTextureLoader extends Loader<DataTexture> {
    options: EXRTextureLoaderOptions;

    constructor(options: EXRTextureLoaderOptions = {}, manager?: LoadingManager) {
        super(manager);
        this.options = options;
    }

    load(
        url: string,
        onLoad?: (data: DataTexture) => void,
        onProgress?: (event: ProgressEvent) => void,
        onError?: (err: unknown) => void
    ): DataTexture {
        const { width, height } = this.options;
        const texture = new DataTexture(null, width, height);

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
                    texture.minFilter = parsed.minFilter;
                    texture.magFilter = parsed.magFilter;
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

    parse(buffer: ArrayBuffer): DataTexture {
        const byteArray = new Uint8Array(buffer);
        const { width, height } = this.options;

        const float32Array = new Float32Array(
            byteArray.buffer,
            byteArray.byteOffset,
            byteArray.byteLength / 4
        );
        const texture = new DataTexture(
            float32Array,
            width ?? 256,
            height ?? 128,
            undefined,
            FloatType
        );
        texture.needsUpdate = true;
        return texture;
    }
}
