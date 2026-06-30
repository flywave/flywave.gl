import type { NodeBuilder, TextureNode } from "three/webgpu";
import type { Node } from "./node";
import { SeparableFilterNode } from "./SeparableFilterNode";
export declare class GaussianBlurNode extends SeparableFilterNode {
    static get type(): string;
    private readonly kernelSize;
    constructor(inputNode?: TextureNode | null, kernelSize?: number);
    protected setupOutputNode(builder: NodeBuilder): Node;
}
export declare const gaussianBlur: (...args: ConstructorParameters<typeof GaussianBlurNode>) => GaussianBlurNode;
