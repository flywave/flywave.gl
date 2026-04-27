import type * as THREE from "three";
import { RenderTexture, TextureTransparency } from "../common";
import { type IDisposable } from "../utils";
import { type TextureOwnership } from "./create-texture-args";
export interface TextureParams {
    type: RenderTexture.Type;
    ownership?: TextureOwnership;
    transparency: TextureTransparency;
    handle: THREE.Texture;
}
export declare class Texture extends RenderTexture implements IDisposable {
    readonly texture: THREE.Texture;
    readonly ownership?: TextureOwnership;
    transparency: TextureTransparency;
    get hasOwner(): boolean;
    get key(): string | undefined;
    constructor(params: TextureParams);
    getTexture(): THREE.Texture;
    dispose(): void;
}
export declare class Texture2DDataUpdater {
    data: Uint8Array;
    modified: boolean;
    constructor(data: Uint8Array);
    setByteAtIndex(index: number, byte: number): void;
    getByteAtIndex(index: number): number;
}
