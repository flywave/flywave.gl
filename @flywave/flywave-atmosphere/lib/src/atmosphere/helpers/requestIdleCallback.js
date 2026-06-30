/* Copyright (C) 2025 flywave.gl contributors */
/**
 * Cross-browser requestIdleCallback polyfill.
 *
 * Reference: https://github.com/behnammodi/polyfill/blob/master/window.polyfill.js
 */
export const requestIdleCallback = typeof window !== "undefined" && window.requestIdleCallback != null
    ? window.requestIdleCallback.bind(window)
    : (callback, options = {}) => {
        const relaxation = 1;
        const timeout = options.timeout ?? relaxation;
        const start = performance.now();
        return setTimeout(() => {
            callback({
                get didTimeout() {
                    return options.timeout != null
                        ? false
                        : performance.now() - start - relaxation > timeout;
                },
                timeRemaining() {
                    return Math.max(0, relaxation + (performance.now() - start));
                }
            });
        }, relaxation);
    };
export const cancelIdleCallback = typeof window !== "undefined" && window.cancelIdleCallback != null
    ? window.cancelIdleCallback.bind(window)
    : id => {
        clearTimeout(id);
    };
//# sourceMappingURL=requestIdleCallback.js.map