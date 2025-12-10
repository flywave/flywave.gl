/* Copyright (C) 2025 flywave.gl contributors */

import { GL } from "@flywave/flywave-utils";

import Tile3DFeatureTable from "../classes/Tile3DFeatureTable";
import type { Tiles3DLoaderOptions } from "../Loader";
import { type Tiles3DTileContent } from "../types";
import { extractGLTF, GLTF_FORMAT, parse3DTileGLTFViewSync } from "./helpers/Parse3DTileGltfView";
import { parse3DTileHeaderSync } from "./helpers/Parse3DTileHeader";
import { parse3DTileTablesHeaderSync, parse3DTileTablesSync } from "./helpers/Parse3DTileTables";

export async function parseBatchedModel3DTile(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options?: Tiles3DLoaderOptions,
    context?: any
) {
    byteOffset = parseBatchedModel(tile, arrayBuffer, byteOffset, options, context);
    await extractGLTF(tile, GLTF_FORMAT.EMBEDDED, options, context);

    const extensions = tile?.gltf?.extensions;
    if (extensions && extensions.CESIUM_RTC) {
        tile.rtcCenter = extensions.CESIUM_RTC.center;
    }

    return byteOffset;
}

function parseBatchedModel(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options?: Tiles3DLoaderOptions,
    context?: any
) {
    byteOffset = parse3DTileHeaderSync(tile, arrayBuffer, byteOffset);

    byteOffset = parse3DTileTablesHeaderSync(tile, arrayBuffer, byteOffset);
    byteOffset = parse3DTileTablesSync(tile, arrayBuffer, byteOffset, options);

    byteOffset = parse3DTileGLTFViewSync(tile, arrayBuffer, byteOffset, options);

    const featureTable = new Tile3DFeatureTable(tile.featureTableJson, tile.featureTableBinary);
    tile.rtcCenter = featureTable.getGlobalProperty("RTC_CENTER", GL.FLOAT, 3);

    return byteOffset;
}
