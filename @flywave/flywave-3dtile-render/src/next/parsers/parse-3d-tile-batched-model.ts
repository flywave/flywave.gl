// This file is derived from the Cesium code base under Apache 2 license
// See LICENSE.md and https://github.com/AnalyticalGraphicsInc/cesium/blob/master/LICENSE.md

import { LoaderContext } from "@loaders.gl/loader-utils";
import { GL } from "@loaders.gl/math"; // math.gl/geometry;

import { Tiles3DLoaderOptions } from "../../tiles-3d-loader";
import Tile3DFeatureTable from "../classes/tile-3d-feature-table";
import { Tiles3DTileContent } from "../types";
import {
    extractGLTF,
    GLTF_FORMAT,
    parse3DTileGLTFViewSync
} from "./helpers/parse-3d-tile-gltf-view";
// import Tile3DBatchTable from '../classes/tile-3d-batch-table';
import { parse3DTileHeaderSync } from "./helpers/parse-3d-tile-header";
import { parse3DTileTablesHeaderSync, parse3DTileTablesSync } from "./helpers/parse-3d-tile-tables";

export async function parseBatchedModel3DTile(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options?: Tiles3DLoaderOptions,
    context?: LoaderContext
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
    context?: LoaderContext
) {
    byteOffset = parse3DTileHeaderSync(tile, arrayBuffer, byteOffset);

    byteOffset = parse3DTileTablesHeaderSync(tile, arrayBuffer, byteOffset);
    byteOffset = parse3DTileTablesSync(tile, arrayBuffer, byteOffset, options);

    byteOffset = parse3DTileGLTFViewSync(tile, arrayBuffer, byteOffset, options);

    const featureTable = new Tile3DFeatureTable(tile.featureTableJson, tile.featureTableBinary);
    tile.rtcCenter = featureTable.getGlobalProperty("RTC_CENTER", GL.FLOAT, 3);

    return byteOffset;
}
