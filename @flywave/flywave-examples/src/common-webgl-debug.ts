/* Copyright (C) 2025 flywave.gl contributors */

// Shared WebGL-compat debugging helpers for examples. The "common" filename
// prefix keeps webpack from treating this module as an example entry.

/**
 * True when the example should force the WebGL2 fallback backend
 * (`?renderer=webgl`), see MapViewOptions.forceWebGL.
 */
export const shouldForceWebGL = (): boolean =>
    new URLSearchParams(location.search).get("renderer") === "webgl";

/**
 * Ring-buffer recent console errors/warnings and uncaught errors into
 * `window.__log` so remote/headless runs can read them back.
 * Returns the log array.
 */
export const installDebugErrorCapture = (): string[] => {
    const logHost = globalThis as unknown as { __log?: string[] };
    const log = (logHost.__log = []);
    const push = (level: string, args: unknown[]) => {
        const line = `${level}: ${args
            .map(a => {
                try {
                    return a instanceof Error ? `${a.message}\n${a.stack}` : String(a);
                } catch {
                    return "[unserializable]";
                }
            })
            .join(" ")}`;
        log.push(line);
        if (log.length > 200) {
            log.shift();
        }
    };
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        push("error", args);
        origError(...args);
    };
    const origWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
        push("warn", args);
        origWarn(...args);
    };
    window.addEventListener("error", e => {
        push("uncaught", [e.message, e.filename, e.lineno]);
    });
    window.addEventListener("unhandledrejection", e => {
        push("rejection", [(e as PromiseRejectionEvent).reason]);
    });
    return log;
};
