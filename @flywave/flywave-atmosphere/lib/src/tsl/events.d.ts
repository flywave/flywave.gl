import type { Node, NodeFrame } from "three/webgpu";
/**
 * Creates a node that executes a callback once per frame update.
 */
export declare function OnFrameUpdate(callback: (frame: NodeFrame) => void): Node;
/**
 * Creates a node that executes a callback before each frame update.
 */
export declare function OnBeforeFrameUpdate(callback: (frame: NodeFrame) => void): Node;
