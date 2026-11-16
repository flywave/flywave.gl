/* Copyright (C) 2025 flywave.gl contributors */

import { type Tiles3DLoaderOptions } from "./Loader";
import parse3DTilesSubtree, { loadExplicitBitstream } from "./parsers/helpers/Parse3DTileSubtree";
import type { Availability, Subtree } from "./types";
import { VERSION } from "./utils/version";

/**
 * Loader for 3D Tiles Subtree
 */
export const Tile3DSubtreeLoader = {
    dataType: null as unknown as Subtree,
    batchType: null as never,
    id: "3d-tiles-subtree",
    name: "3D Tiles Subtree",
    module: "3d-tiles",
    version: VERSION,
    extensions: ["subtree"],
    mimeTypes: ["application/octet-stream"],
    tests: ["subtree"],
    parse: parse3DTilesSubtree,
    options: {}
} as const;

function getBaseUrl(url: string): string {
    const index = url.lastIndexOf("/");
    return index === -1 ? "" : url.substring(0, index);
}

function looksLikeJson(data: ArrayBuffer): boolean {
    const bytes = new Uint8Array(data);
    for (let i = 0; i < bytes.length; i++) {
        const code = bytes[i];
        // Skip ASCII whitespace
        if (code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
            continue;
        }
        return code === 0x7b; // "{"
    }
    return false;
}

async function loadAvailabilityBitstreams(
    subtree: Subtree,
    internalBinaryBuffer: ArrayBuffer,
    context: any
): Promise<void> {
    if (!subtree.tileAvailability) {
        return;
    }

    await loadExplicitBitstream(subtree, subtree.tileAvailability, internalBinaryBuffer, context);

    const contentAvailability = Array.isArray(subtree.contentAvailability)
        ? subtree.contentAvailability
        : subtree.contentAvailability
        ? [subtree.contentAvailability]
        : [];
    for (const availability of contentAvailability as Availability[]) {
        if (availability) {
            await loadExplicitBitstream(subtree, availability, internalBinaryBuffer, context);
        }
    }

    if (subtree.childSubtreeAvailability) {
        await loadExplicitBitstream(
            subtree,
            subtree.childSubtreeAvailability,
            internalBinaryBuffer,
            context
        );
    }
}

/**
 * Parses a subtree in the JSON format (3D Tiles 1.1 allows both the binary and json formats).
 */
async function parseJsonSubtree(json: Subtree, context: any): Promise<Subtree> {
    await loadAvailabilityBitstreams(json, new ArrayBuffer(0), context);
    return json;
}

/** Load 3D Tiles Subtree data */
export async function loadSubtree(
    url: string,
    loader: typeof Tile3DSubtreeLoader = Tile3DSubtreeLoader,
    options: Tiles3DLoaderOptions = {},
    context?: any
): Promise<Subtree> {
    const fetchFn = context?.fetch || globalThis.fetch;

    if (!fetchFn) {
        throw new Error("Fetch function is required to load subtree");
    }

    try {
        const response = await fetchFn(url, {
            headers: options.headers
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch subtree: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const contentType = response.headers?.get?.("content-type") || "";
        const resolvedContext = context || {
            baseUrl: getBaseUrl(url),
            fetch: fetchFn
        };

        if (/json/i.test(contentType) || looksLikeJson(arrayBuffer)) {
            const text = new TextDecoder("utf-8").decode(arrayBuffer);
            return await parseJsonSubtree(JSON.parse(text) as Subtree, resolvedContext);
        }

        return await loader.parse(arrayBuffer as any, options, resolvedContext);
    } catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
