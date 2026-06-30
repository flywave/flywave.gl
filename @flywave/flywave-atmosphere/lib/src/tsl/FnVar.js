/* Copyright (C) 2025 flywave.gl contributors */
import { Fn } from "three/tsl";
/**
 * Creates a TSL function that can optionally access the node builder.
 *
 * The callback may return either:
 * - A direct node value (for simple expressions)
 * - A function `(builder) => Node` (for expressions that need builder context,
 *   such as detecting the renderer backend or accessing uniforms)
 *
 * This is the builder-aware counterpart to {@link FnLayout}.
 *
 * Note: Within callback bodies, TSL operator methods (.sub, .mul, etc.)
 * are available through runtime proxies despite being absent from the
 * `@types/three` type definitions. The callback body operates in a
 * type-loose zone, analogous to GLSL shader strings.
 */
export function FnVar(callback) {
    const fn = Fn((args, builder) => {
        const result = callback(...args);
        return typeof result === "function"
            ? result(builder)
            : result;
    });
    return fn;
}
//# sourceMappingURL=FnVar.js.map