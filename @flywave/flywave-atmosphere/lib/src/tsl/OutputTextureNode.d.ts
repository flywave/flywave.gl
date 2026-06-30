import type { Texture } from "three";
import { TextureNode } from "three/webgpu";
import type { NodeBuilder } from "three/webgpu";
import type { Node as NodeT } from "./node";
/**
 * A TextureNode that triggers the owner node's build when accessed.
 *
 * This enables lazy evaluation: the texture is not computed until the first
 * time a shader samples it, at which point the owner node's `setup()` runs
 * and populates the texture.
 */
export declare class OutputTextureNode extends TextureNode {
    static get type(): string;
    readonly owner: NodeT;
    constructor(owner: NodeT, texture: Texture);
    setup(builder: NodeBuilder): NodeT<unknown>;
    clone(): this;
}
/**
 * Creates an {@link OutputTextureNode} bound to the given owner and texture.
 */
export declare const outputTexture: (owner: NodeT, texture: Texture) => OutputTextureNode;
