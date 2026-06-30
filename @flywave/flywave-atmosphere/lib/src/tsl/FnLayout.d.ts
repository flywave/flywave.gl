import type { Node, NodeType } from "./node";
type FnLayoutType = NodeType | (new (...args: never[]) => unknown) | ((...args: never[]) => unknown);
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
        inputs: {
            name: string;
            type: string;
        }[];
    }) => ShaderFn<Args>;
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
export declare function FnLayout<Args extends readonly unknown[]>({ typeOnly, ...layout }: FnLayoutSpec): (callback: (...args: Args) => unknown) => ShaderFn<Args>;
export {};
