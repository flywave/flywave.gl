/* Copyright (C) 2025 flywave.gl contributors */



export type OrderedComparator<T, U = T> = (lhs: T, rhs: U) => number;

export function compareWithTolerance(a: number, b: number, tolerance = 0.1): number {
    if (a < b - tolerance) return -1;
    else if (a > b + tolerance) return 1;
    else return 0;
}

export function compareNumbers(a: number, b: number): number {
    return a - b;
}

export function compareBooleans(a: boolean, b: boolean): number {
    return a !== b ? (a < b ? -1 : 1) : 0;
}

export function compareStrings(a: string, b: string): number {
    return a === b ? 0 : a < b ? -1 : 1;
}

export function comparePossiblyUndefined<T>(
    compareDefined: (lhs: T, rhs: T) => number,
    lhs?: T,
    rhs?: T
): number {
    if (undefined === lhs) return undefined === rhs ? 0 : -1;
    else if (undefined === rhs) return 1;
    else return compareDefined(lhs, rhs);
}

export function compareStringsOrUndefined(lhs?: string, rhs?: string): number {
    return comparePossiblyUndefined(compareStrings, lhs, rhs);
}

export function compareNumbersOrUndefined(lhs?: number, rhs?: number): number {
    return comparePossiblyUndefined(compareNumbers, lhs, rhs);
}

export function compareBooleansOrUndefined(lhs?: boolean, rhs?: boolean): number {
    return comparePossiblyUndefined(compareBooleans, lhs, rhs);
}

export function areEqualPossiblyUndefined<T, U>(
    t: T | undefined,
    u: U | undefined,
    areEqual: (t: T, u: U) => boolean
): boolean {
    if (undefined === t) return undefined === u;
    else if (undefined === u) return false;
    else return areEqual(t, u);
}
