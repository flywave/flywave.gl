/* Copyright (C) 2025 flywave.gl contributors */
import { TextureNode } from "three/webgpu";
import { reinterpretType } from "./types";
/**
 * A TextureNode that triggers the owner node's build when accessed.
 *
 * This enables lazy evaluation: the texture is not computed until the first
 * time a shader samples it, at which point the owner node's `setup()` runs
 * and populates the texture.
 */
export class OutputTextureNode extends TextureNode {
    static get type() {
        return "OutputTextureNode";
    }
    constructor(owner, texture) {
        super(texture);
        this.owner = owner;
        // WORKAROUND: setUpdateMatrix exists at runtime but is not declared
        // in @types/three@0.184 TextureNode.
        reinterpretType(this);
        this.setUpdateMatrix(false);
    }
    setup(builder) {
        this.owner.build(builder);
        return super.setup(builder);
    }
    clone() {
        // @ts-expect-error polymorphic constructor with private properties
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
/**
 * Creates an {@link OutputTextureNode} bound to the given owner and texture.
 */
export const outputTexture = (owner, texture) => new OutputTextureNode(owner, texture);
//# sourceMappingURL=OutputTextureNode.js.map