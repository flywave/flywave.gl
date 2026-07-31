/* Copyright (C) 2025 flywave.gl contributors */

import { TextureNode } from "three/webgpu";
import type { Texture, NodeBuilder } from "three/webgpu";

import { reinterpretType } from "./types";
import type { Node as NodeT } from "./node";

/**
 * A TextureNode that triggers the owner node's build when accessed.
 *
 * This enables lazy evaluation: the texture is not computed until the first
 * time a shader samples it, at which point the owner node's `setup()` runs
 * and populates the texture.
 */
export class OutputTextureNode extends TextureNode {
    static get type(): string {
        return "OutputTextureNode";
    }

    readonly _owner: NodeT;

    constructor(owner: NodeT, texture: Texture) {
        super(texture);
        this._owner = owner;

        // WORKAROUND: setUpdateMatrix exists at runtime but is not declared
        // in @types/three@0.184 TextureNode.
        reinterpretType<
            OutputTextureNode & {
                setUpdateMatrix: (value: boolean) => void;
            }
        >(this);
        this.setUpdateMatrix(false);
    }

    setup(builder: NodeBuilder) {
        this._owner.build(builder);
        return super.setup(builder);
    }

    clone(): this {
        // @ts-expect-error polymorphic constructor with private properties
        const copy = new this.constructor(this._owner, this.value);
        copy.uvNode = this.uvNode;
        copy.levelNode = this.levelNode;
        copy.biasNode = this.biasNode;
        copy.sampler = this.sampler;
        copy.depthNode = this.depthNode;
        copy.compareNode = this.compareNode;
        copy.gradNode = this.gradNode;
        return copy;
    }
}

/**
 * Creates an {@link OutputTextureNode} bound to the given owner and texture.
 */
export const outputTexture = (owner: NodeT, texture: Texture): OutputTextureNode =>
    new OutputTextureNode(owner, texture);
