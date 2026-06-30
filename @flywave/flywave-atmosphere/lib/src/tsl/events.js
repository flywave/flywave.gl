/* Copyright (C) 2025 flywave.gl contributors */
import { OnBeforeObjectUpdate, OnObjectUpdate } from "three/tsl";
import { NodeUpdateType } from "three/webgpu";
/**
 * Creates a node that executes a callback once per frame update.
 */
export function OnFrameUpdate(callback) {
    const node = OnObjectUpdate(callback);
    node.updateType = NodeUpdateType.NONE;
    return node;
}
/**
 * Creates a node that executes a callback before each frame update.
 */
export function OnBeforeFrameUpdate(callback) {
    const node = OnBeforeObjectUpdate(callback);
    node.updateBeforeType = NodeUpdateType.FRAME;
    return node;
}
//# sourceMappingURL=events.js.map