/* Copyright (C) 2025 flywave.gl contributors */

import type { Texture } from "three";
import { Texture3DNode } from "three/webgpu";
import type { NodeBuilder } from "three/webgpu";

import { reinterpretType } from "./types";
import type { Node as NodeT } from "./node";

/**
 * A Texture3DNode that triggers the owner node's build when accessed.
 *
 * 3D counterpart to {@link OutputTextureNode}, used for volumetric textures
 * such as the atmospheric scattering LUT.
 */
export class OutputTexture3DNode extends Texture3DNode {
    static get type(): string {
        return "OutputTexture3DNode";
    }

    readonly owner: NodeT;

    constructor(owner: NodeT, texture: Texture) {
        super(texture);
        this.owner = owner;

        reinterpretType<
            OutputTexture3DNode & {
                setUpdateMatrix: (value: boolean) => void;
            }
        >(this);
        this.setUpdateMatrix(false);
    }

    setup(builder: NodeBuilder) {
        this.owner.build(builder);
        return super.setup(builder);
    }

    clone(): this {
        // @ts-expect-error polymorphic constructor
        const copy = new this.constructor(this.owner, this.value);
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

export const outputTexture3D = (owner: NodeT, texture: Texture): OutputTexture3DNode =>
    new OutputTexture3DNode(owner, texture);
