import { DracoLoaderOptions } from "@flywave/flywave-draco";
import { dirname } from "@flywave/flywave-utils";

import { parse3DTile } from "./parsers/parse-3d-tile";
import { normalizeTileHeaders } from "./parsers/parse-3d-tile-header";
import {
    LOD_METRIC_TYPE,
    Tiles3DTileContent,
    Tiles3DTilesetJSON,
    Tiles3DTilesetJSONPostprocessed
} from "./types";
import { VERSION } from "./utils/version";

export type Tiles3DLoaderOptions = DracoLoaderOptions & {
    "3d-tiles"?: {
        /** Whether to parse any embedded glTF binaries (or extract memory for independent glTF parsing) */
        loadGLTF?: boolean;
        /** If renderer doesn't support quantized positions, loader can decode them on CPU */
        decodeQuantizedPositions?: boolean;
        /** Whether this is a tileset or a tile */
        isTileset?: boolean | "auto";
        /** Controls which axis is "up" in glTF files */
        assetGltfUpAxis?: "x" | "y" | "z" | null;
    };
};

/**
 * Loader for 3D Tiles
 */
export const Tiles3DLoader = {
    dataType: null as any,
    batchType: null as never,
    id: "3d-tiles",
    name: "3D Tiles",
    module: "3d-tiles",
    version: VERSION,
    extensions: ["cmpt", "pnts", "b3dm", "i3dm"],
    mimeTypes: ["application/octet-stream"],
    tests: ["cmpt", "pnts", "b3dm", "i3dm"],
    parse,
    options: {
        "3d-tiles": {
            loadGLTF: true,
            decodeQuantizedPositions: false,
            isTileset: "auto",
            assetGltfUpAxis: null
        }
    }
} as const;

/** Parses a tileset or tile */
async function parse(
    data,
    options: Tiles3DLoaderOptions = {},
    context?: any
): Promise<Tiles3DTileContent | Tiles3DTilesetJSONPostprocessed> {
    // auto detect file type
    const loaderOptions = options["3d-tiles"] || {};
    let isTileset;
    if (loaderOptions.isTileset === "auto") {
        isTileset = context?.url && context.url.indexOf(".json") !== -1;
    } else {
        isTileset = loaderOptions.isTileset;
    }

    return isTileset
        ? await parseTileset(data, options, context)
        : await parseTile(data, options, context);
}

/** Parse a tileset */
async function parseTileset(
    data: ArrayBuffer,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<Tiles3DTilesetJSONPostprocessed> {
    const tilesetJson: Tiles3DTilesetJSON = JSON.parse(new TextDecoder().decode(data));

    const tilesetUrl = context?.url || "";
    const basePath = getBaseUri(tilesetUrl);
    const normalizedRoot = await normalizeTileHeaders(tilesetJson, basePath, options || {});
    const tilesetJsonPostprocessed: Tiles3DTilesetJSONPostprocessed = {
        ...tilesetJson,
        shape: "tileset3d",
        loader: Tiles3DLoader,
        url: tilesetUrl,
        queryString: context?.queryString || "",
        basePath,
        root: normalizedRoot || tilesetJson.root,
        type: "TILES3D",
        lodMetricType: LOD_METRIC_TYPE.GEOMETRIC_ERROR,
        lodMetricValue: tilesetJson.root?.geometricError || 0
    };
    return tilesetJsonPostprocessed;
}

/** Parse a tile */
async function parseTile(
    arrayBuffer: ArrayBuffer,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<Tiles3DTileContent> {
    const tile = {
        content: {
            shape: "tile3d",
            featureIds: null
        } as Tiles3DTileContent
    };
    const byteOffset = 0;
    await parse3DTile(arrayBuffer, byteOffset, options, context, tile.content);
    return tile.content;
}

/** Get base name */
function getBaseUri(tilesetUrl: string): string {
    return dirname(tilesetUrl);
}
