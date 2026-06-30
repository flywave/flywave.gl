import type { Texture } from "three";
import { Texture3DNode } from "three/webgpu";
import type { NodeBuilder } from "three/webgpu";
import type { Node as NodeT } from "./node";
/**
 * A Texture3DNode that triggers the owner node's build when accessed.
 *
 * 3D counterpart to {@link OutputTextureNode}, used for volumetric textures
 * such as the atmospheric scattering LUT.
 */
export declare class OutputTexture3DNode extends Texture3DNode {
    static get type(): string;
    readonly owner: NodeT;
    constructor(owner: NodeT, texture: Texture);
    setup(builder: NodeBuilder): NodeT<unknown>;
    clone(): this;
}
export declare const outputTexture3D: (owner: NodeT, texture: Texture) => OutputTexture3DNode;
