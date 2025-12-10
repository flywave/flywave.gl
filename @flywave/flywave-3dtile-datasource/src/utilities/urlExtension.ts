/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Returns the file extension of the path component of a URL
 * @param url The URL to parse
 * @returns The file extension (without dot) or null if no extension found
 */
export function getUrlExtension(url: string): string | null {
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url, "http://fakehost.com/");
    } catch (_) {
        // Ignore invalid URLs
        return null;
    }

    const filename = parsedUrl.pathname.split("/").pop() || "";
    const dotIndex = filename.lastIndexOf(".");

    // Check for no extension or trailing dot
    if (dotIndex === -1 || dotIndex === filename.length - 1) {
        return null;
    }

    return filename.substring(dotIndex + 1);
}
