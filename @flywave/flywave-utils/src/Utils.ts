/**
 * constrain n to the given range via min + max
 *
 * @param n value
 * @param min the minimum value to be returned
 * @param max the maximum value to be returned
 * @returns the clamped value
 * @private
 */
export function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
}

/**
 * Returns the first non-null value.
 *
 * @param a The first value.
 * @param b The second value.
 * @returns The first non-null value, or the second value if both are null.
 */
export function defaultValue<T>(a: T, b: T): T {
    return a || b;
}

/**
 * Returns true if the value is defined.
 *
 * @param value The value to check.
 * @returns True if the value is defined, false otherwise.
 */
export function defined<T>(value: T): value is NonNullable<T> {
    return value !== undefined && value !== null;
}
