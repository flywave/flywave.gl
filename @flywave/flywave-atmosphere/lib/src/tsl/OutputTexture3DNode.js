/* Copyright (C) 2025 flywave.gl contributors */
import { Texture3DNode } from "three/webgpu";
import { reinterpretType } from "./types";
/**
 * A Texture3DNode that triggers the owner node's build when accessed.
 *
 * 3D counterpart to {@link OutputTextureNode}, used for volumetric textures
 * such as the atmospheric scattering LUT.
 */
export class OutputTexture3DNode extends Texture3DNode {
    static get type() {
        return "OutputTexture3DNode";
    }
    constructor(owner, texture) {
        super(texture);
        this.owner = owner;
        reinterpretType(this);
        this.setUpdateMatrix(false);
    }
    setup(builder) {
        this.owner.build(builder);
        return super.setup(builder);
    }
    clone() {
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
export const outputTexture3D = (owner, texture) => new OutputTexture3DNode(owner, texture);
//# sourceMappingURL=OutputTexture3DNode.js.map