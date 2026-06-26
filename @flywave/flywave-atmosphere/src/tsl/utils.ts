/* Copyright (C) 2025 flywave.gl contributors */

import { hash, hashString } from "three/src/nodes/core/NodeUtils.js";
import { NodeBuilder, type Renderer } from "three/webgpu";

/**
 * Detects whether the target is using the WebGPU backend.
 */
export function isWebGPU(target: NodeBuilder | Renderer | Renderer["backend"]): boolean {
    const backend =
        target instanceof NodeBuilder
            ? target.renderer.backend
            : "backend" in target
            ? target.backend
            : target;
    return "isWebGPUBackend" in backend && backend.isWebGPUBackend === true;
}

/**
 * Stable hash from a set of values. Used for TSL node cache keys.
 */
export function hashValues(
    ...values: ReadonlyArray<number | boolean | string | null | undefined>
): number {
    return hash(
        ...values.map(value =>
            typeof value === "number"
                ? value
                : typeof value === "boolean"
                ? +value
                : typeof value === "string"
                ? hashString(value)
                : 0x7fffffff
        )
    );
}
