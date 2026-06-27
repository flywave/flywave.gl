/* Copyright (C) 2025 flywave.gl contributors */

type RequestIdleCallbackOptions = {
    timeout?: number;
};

type RequestIdleCallbackDeadline = {
    readonly didTimeout: boolean;
    timeRemaining(): number;
};

type IdleCallbackHandle = number;

/**
 * Cross-browser requestIdleCallback polyfill.
 *
 * Reference: https://github.com/behnammodi/polyfill/blob/master/window.polyfill.js
 */
export const requestIdleCallback: (
    callback: (deadline: RequestIdleCallbackDeadline) => void,
    options?: RequestIdleCallbackOptions
) => IdleCallbackHandle =
    typeof window !== "undefined" && window.requestIdleCallback != null
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
              }, relaxation) as unknown as number;
          };

export const cancelIdleCallback: (id: IdleCallbackHandle) => void =
    typeof window !== "undefined" && window.cancelIdleCallback != null
        ? window.cancelIdleCallback.bind(window)
        : id => {
              clearTimeout(id);
          };
