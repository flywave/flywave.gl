/* Copyright (C) 2025 flywave.gl contributors */
import { Fn } from "three/tsl";
import { StructTypeNode } from "three/webgpu";
function transformType(type) {
    if (typeof type === "string") {
        return type;
    }
    if ("layout" in type && type.layout instanceof StructTypeNode) {
        if (type.layout.name == null) {
            throw new Error("Struct name is required.");
        }
        return type.layout.name;
    }
    throw new Error(`Unsupported layout type: ${String(type)}`);
}
/**
 * Creates a TSL function with explicit input/output type layout information.
 *
 * This is necessary for WGSL struct generation and function overloading.
 * Without explicit layouts, the WGSL compiler cannot resolve struct member
 * types in forward-declared functions.
 *
 * The returned function can be called with TSL node arguments at the call site,
 * and the layout metadata guides the shader compiler's code generation.
 *
 * @param spec - Layout specification containing name, return type, and inputs.
 * @returns A factory that wraps a callback into a layout-aware shader function.
 */
export function FnLayout({ typeOnly = false, ...layout }) {
    return (callback) => {
        const fn = Fn(
        // Fn() expects (args[], builder) signature; our callback uses spread args.
        // This is the three.js TSL type boundary — the runtime contract is compatible.
        callback);
        if (typeOnly) {
            return fn;
        }
        return fn.setLayout({
            name: layout.name,
            type: transformType(layout.type),
            inputs: layout.inputs?.map(input => ({
                name: input.name,
                type: transformType(input.type)
            })) ?? []
        });
    };
}
//# sourceMappingURL=FnLayout.js.map