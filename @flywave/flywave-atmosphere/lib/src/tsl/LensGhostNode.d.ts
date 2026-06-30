import { TempNode, type NodeBuilder, type TextureNode } from "three/webgpu";
export declare class LensGhostNode extends TempNode {
    static get type(): string;
    inputNode: TextureNode | null;
    intensity: import("three/webgpu").UniformNode<"float", number>;
    constructor(inputNode?: TextureNode | null);
    setup(builder: NodeBuilder): unknown;
}
