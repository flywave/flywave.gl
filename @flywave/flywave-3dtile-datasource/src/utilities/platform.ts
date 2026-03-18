/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Gets base URL for tileset loading, compatible with Web and React Native
 *
 * For absolute URLs: extracts base path without needing window.location.href
 * For relative URLs: uses window.location.href in Web, default value in RN
 *
 * @param url - The tileset URL
 * @returns The base URL path
 */
export function getBaseUrl(url: string): string {
    // Absolute URL: extract base path directly
    if (/^https?:\/\//.test(url)) {
        try {
            const parsed = new URL(url);
            // Remove filename, keep only directory
            const pathname = parsed.pathname.replace(/\/[^/]*$/, "");
            return `${parsed.protocol}//${parsed.host}${pathname}`;
        } catch (error) {
            console.warn("Failed to parse absolute URL:", url, error);
        }
    }

    // Relative URL: needs base URL
    // Web environment: use window.location.href
    if (typeof window !== "undefined" && window.location) {
        const basePath = url.replace(/\/[^/]*$/, "");
        return new URL(basePath, window.location.href).toString();
    }

    // React Native environment: limited relative URL support
    console.warn(
        "React Native environment: Relative URLs are not fully supported. " +
            "Please use absolute URLs like: https://example.com/data/tileset.json"
    );
    // Use default base URL as fallback
    const basePath = url.replace(/\/[^/]*$/, "");
    const defaultBase = "http://localhost/";
    return new URL(basePath, defaultBase).toString();
}

/**
 * Safe performance time getter, compatible with environments without performance.now()
 *
 * @returns Current time in milliseconds
 */
export function getPerformanceNow(): number {
    if (typeof performance !== "undefined" && performance.now) {
        return performance.now();
    }
    // Fallback for environments without performance.now()
    return Date.now();
}
