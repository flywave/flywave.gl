/* Copyright (C) 2025 flywave.gl contributors */

import { OnBeforeObjectUpdate, OnObjectUpdate } from "three/tsl";
import { NodeUpdateType } from "three/webgpu";
import type { Node, NodeFrame } from "three/webgpu";

/**
 * Creates a node that executes a callback once per frame update.
 */
export function OnFrameUpdate(callback: (frame: NodeFrame) => void): Node {
    const node = OnObjectUpdate(callback);
    node.updateType = NodeUpdateType.NONE;
    return node;
}

/**
 * Creates a node that executes a callback before each frame update.
 */
export function OnBeforeFrameUpdate(callback: (frame: NodeFrame) => void): Node {
    const node = OnBeforeObjectUpdate(callback);
    node.updateBeforeType = NodeUpdateType.FRAME;
    return node;
}
