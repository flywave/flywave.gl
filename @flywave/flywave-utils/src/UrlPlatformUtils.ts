/* Copyright (C) 2025 flywave.gl contributors */

import { baseUrl } from "./UrlUtils";

/**
 * Get base URL for from where relative URLs will be loaded.
 *
 * * In browser, it resolves to `baseUrl(location.href)` i.e document's base URL
 * (see: https://www.w3.org/TR/WD-html40-970917/htmlweb.html#h-5.1.2).
 *
 * * In node, it resolves to `file://${process.cwd()}`.
 */
export function getAppBaseUrl() {
    if (typeof window === "undefined") {
        return `file://${process.cwd()}/`;
    }
    return baseUrl(window.location.href);
}
