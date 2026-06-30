import { type NodeBuilder, type NodeFrame, type TextureNode } from "three/webgpu";
import { FilterNode } from "./FilterNode";
import type { Node } from "./node";
export declare abstract class SeparableFilterNode extends FilterNode {
    static get type(): string;
    iterations: number;
    private readonly horizontalRT;
    private readonly verticalRT;
    private readonly material;
    private readonly mesh;
    private rendererState?;
    protected readonly inputTexelSize: import("three/webgpu").UniformNode<"float", number>;
    protected readonly direction: import("three/webgpu").UniformNode<"float", number>;
    constructor(inputNode?: TextureNode | null);
    setSize(width: number, height: number): this;
    updateBefore({ renderer }: NodeFrame): void;
    protected abstract setupOutputNode(builder: NodeBuilder): Node;
    setup(builder: NodeBuilder): unknown;
    dispose(): void;
}
