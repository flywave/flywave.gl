import { TempNode, type NodeBuilder, type NodeFrame, type TextureNode } from "three/webgpu";
export declare class LensHaloNode extends TempNode {
    static get type(): string;
    inputNode: TextureNode | null;
    intensity: import("three/webgpu").UniformNode<"float", number>;
    chromaticAberration: import("three/webgpu").UniformNode<"float", number>;
    private readonly aspectRatio;
    constructor(inputNode?: TextureNode | null);
    updateBefore({ renderer }: NodeFrame): void;
    setup(builder: NodeBuilder): unknown;
}
