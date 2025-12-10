/* Copyright (C) 2025 flywave.gl contributors */

import type { Tiles3DLoaderOptions } from "../Loader";
import { type Tiles3DTileContent } from "../types";
import { parse3DTileHeaderSync } from "./helpers/Parse3DTileHeader";

/** Resolve circulate dependency by passing in parsing function as argument */
type Parse3DTile = (
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options: Tiles3DLoaderOptions | undefined,
    context: any | undefined,
    subtile
) => Promise<number>;

// eslint-disable-next-line max-params
export async function parseComposite3DTile(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options: Tiles3DLoaderOptions | undefined,
    context: any | undefined,
    parse3DTile: Parse3DTile
): Promise<number> {
    byteOffset = parse3DTileHeaderSync(tile, arrayBuffer, byteOffset);

    const view = new DataView(arrayBuffer);

    // Extract number of tiles
    tile.tilesLength = view.getUint32(byteOffset, true);
    byteOffset += 4;

    // extract each tile from the byte stream
    tile.tiles = [];
    while (tile.tiles.length < tile.tilesLength && (tile.byteLength || 0) - byteOffset > 12) {
        const subtile: Tiles3DTileContent = { shape: "tile3d" };
        tile.tiles.push(subtile);
        byteOffset = await parse3DTile(arrayBuffer, byteOffset, options, context, subtile);
        // TODO - do we need to add any padding in between tiles?
    }

    return byteOffset;
}
