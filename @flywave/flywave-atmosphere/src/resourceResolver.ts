/* Copyright (C) 2025 flywave.gl contributors */

declare global {
    interface Window {
        FLYWAVE_BASE_URL?: string;
    }
}

/**
 * Resolve a resource URI using the global `FLYWAVE_BASE_URL`.
 *
 * If the URI is already an absolute URL, it is returned as-is.
 * Otherwise, it is resolved relative to `window.FLYWAVE_BASE_URL`
 * (or returned unchanged if no base URL is set).
 */
export function resolveResourceUrl(uri: string): string {
    if (
        uri.startsWith("http://") ||
        uri.startsWith("https://") ||
        uri.startsWith("blob:") ||
        uri.startsWith("data:")
    ) {
        return uri;
    }

    const baseUrl = typeof window !== "undefined" ? window.FLYWAVE_BASE_URL : undefined;
    if (baseUrl) {
        let normalizedUri = uri;
        if (normalizedUri.startsWith("/")) {
            normalizedUri = normalizedUri.substring(1);
        }
        const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
        return base + normalizedUri;
    }

    return uri;
}
