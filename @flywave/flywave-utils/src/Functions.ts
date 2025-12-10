/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Chains two functions for further assigning as one wrapped callback function
 */
export function chainCallbacks<T extends (this: unknown, ...args: any[]) => any>(
    f1: T | null | undefined,
    f2: T
): T {
    return function (this: any, ...args: any[]): ReturnType<T> {
        if (f1) {
            f1.apply(this, args);
        }
        return f2.apply(this, args);
    } as T;
}
