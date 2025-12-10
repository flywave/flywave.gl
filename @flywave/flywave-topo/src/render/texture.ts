/* Copyright (C) 2025 flywave.gl contributors */



import type * as THREE from "three";

import { RenderTexture, TextureTransparency } from "../common";
import { type IDisposable, assert } from "../utils";
import { type TextureOwnership } from "./create-texture-args";

export interface TextureParams {
    type: RenderTexture.Type;
    ownership?: TextureOwnership;
    transparency: TextureTransparency;
    handle: THREE.Texture;
}

export class Texture extends RenderTexture implements IDisposable {
    public readonly texture: THREE.Texture;
    public readonly ownership?: TextureOwnership;
    public transparency: TextureTransparency;

    public get hasOwner(): boolean {
        return undefined !== this.ownership;
    }

    public get key(): string | undefined {
        return typeof this.ownership !== "string" && typeof this.ownership?.key === "string"
            ? this.ownership.key
            : undefined;
    }

    public constructor(params: TextureParams) {
        super(params.type);
        this.ownership = params.ownership;
        this.texture = params.handle;
        this.transparency = params.handle.premultiplyAlpha
            ? params.transparency
            : TextureTransparency.Opaque;
    }

    public getTexture(): THREE.Texture {
        return this.texture;
    }

    public dispose() {
        this.texture.dispose();
    }
}

export class Texture2DDataUpdater {
    public data: Uint8Array;
    public modified: boolean = false;

    public constructor(data: Uint8Array) {
        this.data = data;
    }

    public setByteAtIndex(index: number, byte: number) {
        assert(index < this.data.length);
        if (byte !== this.data[index]) {
            this.data[index] = byte;
            this.modified = true;
        }
    }

    public getByteAtIndex(index: number): number {
        assert(index < this.data.length);
        return this.data[index];
    }
}
