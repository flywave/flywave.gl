// @ts-nocheck
import { hash, hashString as hashStringFn } from "three/src/nodes/core/NodeUtils.js";
export { hash, hashStringFn as hashString };
export function isWebGPU(target) {
    if (target == null)
        return false;
    const obj = target;
    if (obj.renderer != null && typeof obj.renderer === "object") {
        const backend = obj.renderer.backend;
        return backend?.isWebGPUBackend === true;
    }
    if (obj.backend != null && typeof obj.backend === "object") {
        return obj.backend?.isWebGPUBackend === true;
    }
    return obj?.isWebGPUBackend === true;
}
export function hashValues(...values) {
    return hash(...values.map(value => typeof value === "number"
        ? value
        : typeof value === "boolean"
            ? +value
            : typeof value === "string"
                ? hashStringFn(value)
                : 0x7fffffff));
}
//# sourceMappingURL=utils.js.map