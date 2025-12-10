/* Copyright (C) 2025 flywave.gl contributors */

import { type Tiles3DLoaderOptions } from "./Loader";
import parse3DTilesSubtree from "./parsers/helpers/Parse3DTileSubtree";
import type { Subtree } from "./types";
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

        return await loader.parse(arrayBuffer as any, options, context);
    } catch (error) {
        throw new Error(`Subtree loading failed: ${error.message}`);
    }
}
