// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import {
    Data3DTexture,
    LinearFilter,
    LinearMipMapLinearFilter,
    NoColorSpace,
    RedFormat,
    RepeatWrapping,
    TextureLoader,
    UnsignedByteType,
    type Texture
} from "three";
import { type Renderer } from "three/webgpu";
export class CloudTextures {
    private _shapeTexture: Data3DTexture | null = null;
    private _shapeDetailTexture: Data3DTexture | null = null;
    private _localWeatherTexture: Texture | null = null;
    private _turbulenceTexture: Texture | null = null;

    private _assetsPath = "./assets/clouds";

    async load(renderer?: Renderer): Promise<void> {
        // Load 2D textures via TextureLoader
        const loader = new TextureLoader();

        this._localWeatherTexture = await loader.loadAsync(`${this._assetsPath}/local_weather.png`);
        this._localWeatherTexture.minFilter = LinearMipMapLinearFilter;
        this._localWeatherTexture.magFilter = LinearFilter;
        this._localWeatherTexture.wrapS = RepeatWrapping;
        this._localWeatherTexture.wrapT = RepeatWrapping;
        this._localWeatherTexture.colorSpace = NoColorSpace;
        this._localWeatherTexture.generateMipmaps = true;
        this._localWeatherTexture.needsUpdate = true;

        this._turbulenceTexture = await loader.loadAsync(`${this._assetsPath}/turbulence.png`);
        this._turbulenceTexture.minFilter = LinearFilter;
        this._turbulenceTexture.magFilter = LinearFilter;
        this._turbulenceTexture.wrapS = RepeatWrapping;
        this._turbulenceTexture.wrapT = RepeatWrapping;
        this._turbulenceTexture.colorSpace = NoColorSpace;
        this._turbulenceTexture.needsUpdate = true;

        // Load 3D textures from raw binary data
        this._shapeTexture = await this.load3DTexture(`${this._assetsPath}/shape.bin`, 128);
        this._shapeDetailTexture = await this.load3DTexture(
            `${this._assetsPath}/shape_detail.bin`,
            32
        );
    }

    private async load3DTexture(url: string, size: number): Promise<Data3DTexture> {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        const data = new Uint8Array(buffer);

        const texture = new Data3DTexture(data, size, size, size);
        texture.format = RedFormat;
        texture.type = UnsignedByteType;
        texture.minFilter = LinearFilter;
        texture.magFilter = LinearFilter;
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.wrapR = RepeatWrapping;
        texture.colorSpace = NoColorSpace;
        texture.needsUpdate = true;
        return texture;
    }

    get shapeTexture(): Texture {
        return this._shapeTexture!;
    }

    get shapeDetailTexture(): Texture {
        return this._shapeDetailTexture!;
    }

    get localWeatherTexture(): Texture {
        return this._localWeatherTexture!;
    }

    get turbulenceTexture(): Texture {
        return this._turbulenceTexture!;
    }

    dispose(): void {
        this._shapeTexture?.dispose();
        this._shapeDetailTexture?.dispose();
        this._localWeatherTexture?.dispose();
        this._turbulenceTexture?.dispose();
    }
}

import { UnsignedByteType } from "three";
