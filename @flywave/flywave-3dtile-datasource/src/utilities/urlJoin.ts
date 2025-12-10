/* Copyright (C) 2025 flywave.gl contributors */

import path from "path-browserify";

/**
 * Joins URL path segments while properly handling protocol components like "http://".
 *
 * This function combines multiple URL path segments into a single valid URL,
 * correctly handling protocol prefixes and ensuring forward slashes are used.
 *
 * @param args - Path segments to join
 * @returns Joined URL path with forward slashes
 * @throws Error if an invalid protocol format is detected
 */
export function urlJoin(...args: string[]): string {
    const protocolRegex = /^[a-zA-Z]+:/; //;
    let lastRoot = -1;

    // Find the last argument that contains a protocol
    for (let i = 0, l = args.length; i < l; i++) {
        if (protocolRegex.test(args[i])) {
            lastRoot = i;
        }
    }

    // No protocol found - simple path join
    if (lastRoot === -1) {
        return path.join(...args).replace(/\\/g, "/");
    }

    // Protocol found - handle specially
    const parts = lastRoot <= 0 ? args : args.slice(lastRoot);
    const protocolMatch = parts[0].match(protocolRegex);

    if (!protocolMatch) {
        throw new Error("Invalid protocol format");
    }

    const protocol = protocolMatch[0];
    parts[0] = parts[0].substring(protocol.length);

    return (protocol + path.join(...parts)).replace(/\\/g, "/");
}
