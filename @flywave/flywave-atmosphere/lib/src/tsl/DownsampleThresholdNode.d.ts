import type { NodeBuilder } from "three/webgpu";
import type { Node } from "./node";
import { SingleFilterNode } from "./SingleFilterNode";
export declare class DownsampleThresholdNode extends SingleFilterNode {
    static get type(): string;
    resolutionScale: number;
    thresholdLevel: import("three/webgpu").UniformNode<"float", number>;
    thresholdRange: import("three/webgpu").UniformNode<"float", number>;
    protected setupOutputNode(builder: NodeBuilder): Node;
}
export declare const downsampleThreshold: (...args: ConstructorParameters<typeof DownsampleThresholdNode>) => DownsampleThresholdNode;
