/* Copyright (C) 2025 flywave.gl contributors */

import { Fn } from "three/tsl";
import { StructTypeNode } from "three/webgpu";

import type { Node, NodeType } from "./node";

type FnLayoutType =
    | NodeType
    | (new (...args: never[]) => unknown)
    | ((...args: never[]) => unknown);

export interface FnLayoutInput {
    name: string;
    type: FnLayoutType;
}

export interface FnLayoutSpec {
    typeOnly?: boolean;
    name: string;
    type: FnLayoutType;
    inputs?: FnLayoutInput[];
}

/**
 * A callable TSL shader function with layout metadata.
 * When invoked with node arguments, it produces a shader call node.
 */
export interface ShaderFn<Args extends readonly unknown[]> {
    (...args: Args): Node;
    setLayout: (layout: {
        name: string;
        type: string;
        inputs: { name: string; type: string }[];
    }) => ShaderFn<Args>;
}

function transformType(type: FnLayoutType): string {
    if (typeof type === "string") {
        return type;
    }
    const name = (type as { name?: string }).name;
    if (typeof name === "string" && name.length > 0) {
        return name;
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
export function FnLayout<Args extends readonly unknown[]>({
    typeOnly = false,
    ...layout
}: FnLayoutSpec): (callback: (...args: Args) => unknown) => ShaderFn<Args> {
    return (callback: (...args: Args) => unknown): ShaderFn<Args> => {
        const fn = Fn(
            // Fn() expects (args[], builder) signature; our callback uses spread args.
            // This is the three.js TSL type boundary — the runtime contract is compatible.
            callback as unknown as (args: readonly unknown[], builder: unknown) => unknown
        );
        if (typeOnly) {
            return fn as unknown as ShaderFn<Args>;
        }
        return fn.setLayout({
            name: layout.name,
            type: transformType(layout.type),
            inputs:
                layout.inputs?.map(input => ({
                    name: input.name,
                    type: transformType(input.type)
                })) ?? []
        }) as unknown as ShaderFn<Args>;
    };
}
