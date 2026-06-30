import { TempNode, type NodeBuilder } from "three/webgpu";
import type { Node } from "../tsl/node";
export declare class SunNode extends TempNode {
    static get type(): string;
    rayDirectionECEF: Node | null;
    angularRadius: import("three/webgpu").UniformNode<"float", number>;
    intensity: import("three/webgpu").UniformNode<"float", number>;
    constructor();
    setup(builder: NodeBuilder): unknown;
}
