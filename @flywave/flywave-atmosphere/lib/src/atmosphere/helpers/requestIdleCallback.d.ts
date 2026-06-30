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
export declare const requestIdleCallback: (callback: (deadline: RequestIdleCallbackDeadline) => void, options?: RequestIdleCallbackOptions) => IdleCallbackHandle;
export declare const cancelIdleCallback: (id: IdleCallbackHandle) => void;
export {};
