import type { NodeBuilder, TextureNode } from "three/webgpu";
import { DualMipmapFilterNode } from "./DualMipmapFilterNode";
import type { Node } from "./node";
export declare class MipmapSurfaceBlurNode extends DualMipmapFilterNode {
    static get type(): string;
    resolutionScale: number;
    blendAmount: import("three/webgpu").UniformNode<"float", number>;
    constructor(inputNode?: TextureNode | null, levels?: number);
    protected setupDownsampleNode(builder: NodeBuilder): Node;
    protected setupUpsampleNode(builder: NodeBuilder): Node;
}
export declare const mipmapSurfaceBlur: (...args: ConstructorParameters<typeof MipmapSurfaceBlurNode>) => MipmapSurfaceBlurNode;
