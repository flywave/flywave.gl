/* Copyright (C) 2025 flywave.gl contributors */

/* eslint-disable no-restricted-globals */
const globals = {
    self: typeof self !== "undefined" && self,
    window: typeof window !== "undefined" && window,
    global: typeof global !== "undefined" && global,
    document: typeof document !== "undefined" && document
};

const self_: Record<string, any> = globals.self || globals.window || globals.global || {};
const window_: Record<string, any> = globals.window || globals.self || globals.global || {};
const global_: Record<string, any> = globals.global || globals.self || globals.window || {};
const document_: Record<string, any> = globals.document || {};

export { self_ as self, window_ as window, global_ as global, document_ as document };

/** true if running in the browser, false if running in Node.js */
export const isBrowser: boolean =
    // @ts-ignore process.browser
    typeof process !== "object" || String(process) !== "[object process]" || process.browser;

/** true if running on a worker thread */
export const isWorker: boolean =
    typeof self !== "undefined" &&
    "WorkerGlobalScope" in globalThis &&
    self instanceof globalThis.WorkerGlobalScope;

/** true if running on a mobile device */
export const isMobile: boolean =
    typeof window !== "undefined" && typeof window.orientation !== "undefined";

// Extract node major version
const matches =
    typeof process !== "undefined" && process.version && /v([0-9]*)/.exec(process.version);

/** Version of Node.js if running under Node, otherwise 0 */
export const nodeVersion: number = (matches && parseFloat(matches[1])) || 0;
