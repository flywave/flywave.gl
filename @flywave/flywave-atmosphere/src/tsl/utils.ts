// @ts-nocheck
import { hash, hashString as hashStringFn } from "three/src/nodes/core/NodeUtils.js";

export { hash, hashStringFn as hashString };

export function isWebGPU(target: unknown): boolean {
    if (target == null) return false;
    const obj = target as Record<string, unknown>;
    if (obj.renderer != null && typeof obj.renderer === "object") {
        const backend = (obj.renderer as Record<string, unknown>).backend;
        return (backend as Record<string, unknown>)?.isWebGPUBackend === true;
    }
    if (obj.backend != null && typeof obj.backend === "object") {
        return (obj.backend as Record<string, unknown>)?.isWebGPUBackend === true;
    }
    return (obj as Record<string, unknown>)?.isWebGPUBackend === true;
}

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
                ? hashStringFn(value)
                : 0x7fffffff
        )
    );
}
