/* Copyright (C) 2025 flywave.gl contributors */

/**
 * TEMPORARY ambient module declarations for `react` and `react-dom/client`.
 *
 * Why this file exists: react@19.2.4 / react-dom@19.2.4 ship no type
 * declarations, and this package does not yet have `@types/react` /
 * `@types/react-dom` devDependencies — so `import ... from "react"` cannot
 * type-check and the full `tsc` run fails with TS2307.
 *
 * TO REMOVE: install the real type packages and delete this file:
 *   pnpm --filter @flywave/flywave-examples add -D @types/react@19 @types/react-dom@19
 *
 * Scope is intentionally minimal (only what this example imports); everything
 * inside `@flywave/flywave-react`'s own .d.ts files is covered by the
 * tsconfig's `skipLibCheck: true`.
 */

declare module "react" {
    /** Minimal React style-prop shape (real type: React.CSSProperties). */
    export type CSSProperties = Record<string, string | number | undefined>;
    /** Anything renderable (real type: React.ReactNode). */
    export type ReactNode = unknown;
    /** useEffect / hook dependency array (real type: React.DependencyList). */
    export type DependencyList = readonly unknown[];

    /**
     * Create a React element (real signature is generic over the component's
     * prop type; this minimal declaration intentionally types props loosely).
     */
    export function createElement(
        type: unknown,
        props?: Record<string, unknown> | null,
        ...children: unknown[]
    ): object;

    /** Stateful value plus its setter (real type: [S, Dispatch<SetStateAction<S>>]). */
    export function useState<S>(initialState: S): [S, (value: S) => void];
}

declare module "react-dom/client" {
    /** Minimal react-dom/client root handle (real type: ReactRoot). */
    export interface Root {
        render(node: unknown): void;
        unmount(): void;
    }
    /** Create a root for a DOM container (real signature mirrors this). */
    export function createRoot(container: Element | DocumentFragment): Root;
}
