import type { NodeBuilder, TextureNode } from "three/webgpu";
import { DualMipmapFilterNode } from "./DualMipmapFilterNode";
import type { Node } from "./node";
export declare class KawaseBlurNode extends DualMipmapFilterNode {
    static get type(): string;
    resolutionScale: number;
    constructor(inputNode?: TextureNode | null, levels?: number);
    protected setupDownsampleNode(builder: NodeBuilder): Node;
    protected setupUpsampleNode(builder: NodeBuilder): Node;
}
export declare const kawaseBlur: (...args: ConstructorParameters<typeof KawaseBlurNode>) => KawaseBlurNode;
