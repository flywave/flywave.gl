import { TILE3D_TYPE } from "../constants";
import { Tiles3DTileContent } from "../types";
import { getMagicString } from "./helpers/parse-utils";
import { parseBatchedModel3DTile } from "./parse-3d-tile-batched-model";
import { parseComposite3DTile } from "./parse-3d-tile-composite";
import { parseGltf3DTile } from "./parse-3d-tile-gltf";
import { parseInstancedModel3DTile } from "./parse-3d-tile-instanced-model";
import { parsePointCloud3DTile } from "./parse-3d-tile-point-cloud";

// Extracts
export async function parse3DTile(
    arrayBuffer: ArrayBuffer,
    byteOffset = 0,
    options: Tiles3DLoaderOptions | undefined,
    context: LoaderContext | undefined,
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
            throw new Error(`3DTileLoader: unknown type ${tile.type}`); // eslint-disable-line
    }
}
