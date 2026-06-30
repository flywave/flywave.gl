import { TempNode, type NodeBuilder, type SampleNode, type TextureNode } from "three/webgpu";
import type { Node } from "../tsl/node";
export declare class MoonNode extends TempNode {
    static get type(): string;
    rayDirectionECEF: Node | null;
    colorNode: TextureNode | SampleNode | null;
    displacementNode: TextureNode | SampleNode | null;
    angularRadius: import("three/webgpu").UniformNode<"float", number>;
    intensity: import("three/webgpu").UniformNode<"float", number>;
    displacementScale: import("three/webgpu").UniformNode<"float", number>;
    constructor();
    setup(builder: NodeBuilder): unknown;
}
