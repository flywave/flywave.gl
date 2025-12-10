/* Copyright (C) 2025 flywave.gl contributors */

import { TILE3D_TYPE } from "../constants";
import { type Tiles3DLoaderOptions } from "../Loader";
import { type Tiles3DTileContent } from "../types";
import { getMagicString } from "./helpers/ParseUtils";
import { parseBatchedModel3DTile } from "./Parse3DTileBatchedModel";
import { parseComposite3DTile } from "./Parse3DTileComposite";
import { parseGltf3DTile } from "./Parse3DTileGltf";
import { parseInstancedModel3DTile } from "./Parse3DTileInstancedModel";
import { parsePointCloud3DTile } from "./Parse3DTilePointCloud";

// Extracts
export async function parse3DTile(
    arrayBuffer: ArrayBuffer,
    byteOffset = 0,
    options: Tiles3DLoaderOptions | undefined,
    context: any | undefined,
    tile: Tiles3DTileContent = { shape: "tile3d" }
): Promise<number> {
    tile.byteOffset = byteOffset;
    tile.type = getMagicString(arrayBuffer, byteOffset);

    switch (tile.type) {
        case TILE3D_TYPE.COMPOSITE:
            // Note: We pass this function as argument so that embedded tiles can be parsed recursively
            return await parseComposite3DTile(
                tile,
                arrayBuffer,
                byteOffset,
                options,
                context,
                parse3DTile
            );

        case TILE3D_TYPE.BATCHED_3D_MODEL:
            return await parseBatchedModel3DTile(tile, arrayBuffer, byteOffset, options, context);

        case TILE3D_TYPE.GLTF:
            return await parseGltf3DTile(tile, arrayBuffer, options, context);

        case TILE3D_TYPE.INSTANCED_3D_MODEL:
            return await parseInstancedModel3DTile(tile, arrayBuffer, byteOffset, options, context);

        case TILE3D_TYPE.POINT_CLOUD:
            return await parsePointCloud3DTile(tile, arrayBuffer, byteOffset, options, context);

        default:
            //is gltf model
            tile.type = TILE3D_TYPE.GLTF;
            return await parseGltf3DTile(tile, arrayBuffer, options, context);
    }
}
