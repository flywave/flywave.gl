// @ts-nocheck
/* Copyright (C) 2025 flywave.gl contributors */

import { Fn, frameId, nodeImmutable, screenCoordinate, vec3 } from "three/tsl";
import {
    type NodeBuilder,
    Data3DTexture,
    NearestFilter,
    RedFormat,
    RepeatWrapping,
    Texture3DNode
} from "three/webgpu";

import { DEFAULT_STBN_URL } from "../constants";
import { STBNLoader } from "../STBNLoader";
import { hashString } from "./utils";

const emptyTexture3D = /*#__PURE__*/ (() => {
    const texture = new Data3DTexture(new Uint8Array(1));
    texture.format = RedFormat;
    texture.minFilter = NearestFilter;
    texture.magFilter = NearestFilter;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.wrapR = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
})();

export class STBNTextureNode extends Texture3DNode {
    url = DEFAULT_STBN_URL;

    private dataPromise?: Promise<void>;

    constructor() {
        super(emptyTexture3D);
    }

    override customCacheKey(): number {
        return hashString(this.url);
    }

    override setup(builder: NodeBuilder): unknown {
        this.dataPromise ??= new STBNLoader()
            .loadAsync(this.url)
            .then(texture => {
                texture.name = "STBN";
                this.value = texture;
            })
            .catch((error: unknown) => {
                // eslint-disable-next-line no-console
                console.error(error);
            });

        return super.setup(builder);
    }

    // @ts-expect-error Ignore
    override clone(): Texture3DNode {
        const copy = new Texture3DNode(this.value, this.uvNode, this.levelNode);
        copy.referenceNode = this;
        return copy;
    }
}

export const stbnTexture = /*#__PURE__*/ nodeImmutable(STBNTextureNode);

export const stbn = /*#__PURE__*/ Fn(() => {
    return stbnTexture
        .sample(vec3(screenCoordinate.xy, frameId.mod(64)).div(vec3(128, 128, 64)))
        .r.toVar();
}).once()();
