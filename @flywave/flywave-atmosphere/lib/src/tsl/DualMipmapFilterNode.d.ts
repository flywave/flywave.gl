import { type NodeBuilder, type NodeFrame, type TextureNode } from "three/webgpu";
import { FilterNode } from "./FilterNode";
import type { Node } from "./node";
export declare abstract class DualMipmapFilterNode extends FilterNode {
    static get type(): string;
    private readonly downsampleRTs;
    private readonly upsampleRTs;
    private readonly downsampleMaterial;
    private readonly upsampleMaterial;
    private readonly mesh;
    private rendererState?;
    protected readonly inputTexelSize: import("three/webgpu").UniformNode<"float", number>;
    protected readonly downsampleNode: TextureNode<"vec4">;
    constructor(inputNode: TextureNode | null | undefined, levels: number);
    setSize(width: number, height: number): this;
    updateBefore({ renderer }: NodeFrame): void;
    protected abstract setupDownsampleNode(builder: NodeBuilder): Node;
    protected abstract setupUpsampleNode(builder: NodeBuilder): Node;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
