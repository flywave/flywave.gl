/* Copyright (C) 2025 flywave.gl contributors */

import { type DracoMesh, DracoLoader } from "@flywave/flywave-draco";
import { GL } from "@flywave/flywave-utils";
import { Vector3 } from "three";

import Tile3DBatchTable from "../classes/Tile3DBatchTable";
import Tile3DFeatureTable from "../classes/Tile3DFeatureTable";
import { type Tiles3DLoaderOptions } from "../Loader";
import { type Tiles3DTileContent } from "../types";
import { normalize3DTileColorAttribute } from "./helpers/Normalize3DTileColors";
import { normalize3DTileNormalAttribute } from "./helpers/Normalize3DTileNormals";
import { normalize3DTilePositionAttribute } from "./helpers/Normalize3DTilePositions";
import { parse3DTileHeaderSync } from "./helpers/Parse3DTileHeader";
import { parse3DTileTablesHeaderSync, parse3DTileTablesSync } from "./helpers/Parse3DTileTables";

export async function parsePointCloud3DTile(
    tile: Tiles3DTileContent,
    arrayBuffer: ArrayBuffer,
    byteOffset: number,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<number> {
    byteOffset = parse3DTileHeaderSync(tile, arrayBuffer, byteOffset);
    byteOffset = parse3DTileTablesHeaderSync(tile, arrayBuffer, byteOffset);
    byteOffset = parse3DTileTablesSync(tile, arrayBuffer, byteOffset, options);
    initializeTile(tile);

    const { featureTable, batchTable } = parsePointCloudTables(tile);

    const dracoUsed = await parseDraco(tile, featureTable, batchTable, options, context);

    // Parse regular attributes only when Draco is not used
    if (!dracoUsed) {
        parsePositions(tile, featureTable, options);
        parseColors(tile, featureTable, batchTable);
        parseNormals(tile, featureTable);
    }

    return byteOffset;
}

function initializeTile(tile: Tiles3DTileContent): void {
    tile.attributes = {
        positions: null,
        colors: null,
        normals: null,
        batchIds: null
    };
    tile.isQuantized = false;
    tile.isTranslucent = false;
    tile.isRGB565 = false;
    tile.isOctEncoded16P = false;
}

function parsePointCloudTables(tile: Tiles3DTileContent): {
    featureTable: Tile3DFeatureTable;
    batchTable: Tile3DBatchTable | null;
} {
    const featureTable = new Tile3DFeatureTable(tile.featureTableJson, tile.featureTableBinary);

    const pointsLength = featureTable.getGlobalProperty("POINTS_LENGTH");
    if (!Number.isFinite(pointsLength)) {
        throw new Error("POINTS_LENGTH must be defined");
    }
    featureTable.featuresLength = pointsLength;

    tile.featuresLength = pointsLength;
    tile.pointsLength = pointsLength;
    tile.pointCount = pointsLength;

    tile.rtcCenter = featureTable.getGlobalProperty("RTC_CENTER", GL.FLOAT, 3);

    const batchTable = parseBatchIds(tile, featureTable);

    return { featureTable, batchTable };
}

function parsePositions(
    tile: Tiles3DTileContent,
    featureTable: Tile3DFeatureTable,
    options: Tiles3DLoaderOptions | undefined
): void {
    tile.attributes = tile.attributes || {
        positions: null,
        colors: null,
        normals: null,
        batchIds: null
    };

    if (!tile.attributes.positions) {
        if (featureTable.hasProperty("POSITION")) {
            tile.attributes.positions = featureTable.getPropertyArray("POSITION", GL.FLOAT, 3);
        } else if (featureTable.hasProperty("POSITION_QUANTIZED")) {
            const positions = featureTable.getPropertyArray(
                "POSITION_QUANTIZED",
                GL.UNSIGNED_SHORT,
                3
            );

            tile.isQuantized = true;
            tile.quantizedRange = (1 << 16) - 1;

            tile.quantizedVolumeScale = featureTable.getGlobalProperty(
                "QUANTIZED_VOLUME_SCALE",
                GL.FLOAT,
                3
            ) as Vector3;
            if (!tile.quantizedVolumeScale) {
                throw new Error("QUANTIZED_VOLUME_SCALE must be defined for quantized positions.");
            }

            tile.quantizedVolumeOffset = featureTable.getGlobalProperty(
                "QUANTIZED_VOLUME_OFFSET",
                GL.FLOAT,
                3
            ) as Vector3;
            if (!tile.quantizedVolumeOffset) {
                throw new Error("QUANTIZED_VOLUME_OFFSET must be defined for quantized positions.");
            }

            tile.attributes.positions = normalize3DTilePositionAttribute(tile, positions, options);
        }
    }

    if (!tile.attributes.positions) {
        throw new Error("Either POSITION or POSITION_QUANTIZED must be defined.");
    }
}

function parseColors(
    tile: Tiles3DTileContent,
    featureTable: Tile3DFeatureTable,
    batchTable: Tile3DBatchTable | null
): void {
    tile.attributes = tile.attributes || {
        positions: null,
        colors: null,
        normals: null,
        batchIds: null
    };

    if (!tile.attributes.colors) {
        let colors = null;
        if (featureTable.hasProperty("RGBA")) {
            colors = featureTable.getPropertyArray("RGBA", GL.UNSIGNED_BYTE, 4);
            tile.isTranslucent = true;
        } else if (featureTable.hasProperty("RGB")) {
            colors = featureTable.getPropertyArray("RGB", GL.UNSIGNED_BYTE, 3);
        } else if (featureTable.hasProperty("RGB565")) {
            colors = featureTable.getPropertyArray("RGB565", GL.UNSIGNED_SHORT, 1);
            tile.isRGB565 = true;
        }

        tile.attributes.colors = normalize3DTileColorAttribute(tile, colors, batchTable);
    }

    if (featureTable.hasProperty("CONSTANT_RGBA")) {
        tile.constantRGBA = featureTable.getGlobalProperty(
            "CONSTANT_RGBA",
            GL.UNSIGNED_BYTE,
            4
        ) as number[];
    }
}

function parseNormals(tile: Tiles3DTileContent, featureTable: Tile3DFeatureTable): void {
    tile.attributes = tile.attributes || {
        positions: null,
        colors: null,
        normals: null,
        batchIds: null
    };

    if (!tile.attributes.normals) {
        let normals = null;
        if (featureTable.hasProperty("NORMAL")) {
            normals = featureTable.getPropertyArray("NORMAL", GL.FLOAT, 3);
        } else if (featureTable.hasProperty("NORMAL_OCT16P")) {
            normals = featureTable.getPropertyArray("NORMAL_OCT16P", GL.UNSIGNED_BYTE, 2);
            tile.isOctEncoded16P = true;
        }

        tile.attributes.normals = normalize3DTileNormalAttribute(tile, normals);
    }
}

function parseBatchIds(
    tile: Tiles3DTileContent,
    featureTable: Tile3DFeatureTable
): Tile3DBatchTable | null {
    let batchTable: Tile3DBatchTable | null = null;

    if (!tile.batchIds && featureTable.hasProperty("BATCH_ID")) {
        tile.batchIds = featureTable.getPropertyArray("BATCH_ID", GL.UNSIGNED_SHORT, 1);

        if (tile.batchIds) {
            const batchFeatureLength = featureTable.getGlobalProperty("BATCH_LENGTH") as number;
            if (!batchFeatureLength) {
                throw new Error(
                    "Global property: BATCH_LENGTH must be defined when BATCH_ID is defined."
                );
            }
            const { batchTableJson, batchTableBinary } = tile;
            batchTable = new Tile3DBatchTable(batchTableJson, batchTableBinary, batchFeatureLength);
        }
    }
    return batchTable;
}

async function parseDraco(
    tile: Tiles3DTileContent,
    featureTable: Tile3DFeatureTable,
    batchTable: Tile3DBatchTable | null,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<boolean> {
    let dracoBuffer: ArrayBuffer | null = null;
    let dracoFeatureTableProperties: Record<string, number> | null = null;
    let dracoBatchTableProperties: Record<string, number> | null = null;

    const batchTableDraco = tile.batchTableJson?.extensions?.["3DTILES_draco_point_compression"];
    if (batchTableDraco) {
        dracoBatchTableProperties = batchTableDraco.properties;
    }

    const featureTableDraco = featureTable.getExtension("3DTILES_draco_point_compression");
    if (featureTableDraco) {
        dracoFeatureTableProperties = featureTableDraco.properties;
        const dracoByteOffset = featureTableDraco.byteOffset;
        const dracoByteLength = featureTableDraco.byteLength;
        if (!dracoFeatureTableProperties || !Number.isFinite(dracoByteOffset) || !dracoByteLength) {
            throw new Error("Draco properties, byteOffset, and byteLength must be defined");
        }

        dracoBuffer =
            tile.featureTableBinary?.slice(dracoByteOffset, dracoByteOffset + dracoByteLength)
                .buffer || null;

        if (dracoBuffer) {
            tile.hasPositions = Number.isFinite(dracoFeatureTableProperties.POSITION);
            tile.hasColors =
                Number.isFinite(dracoFeatureTableProperties.RGB) ||
                Number.isFinite(dracoFeatureTableProperties.RGBA);
            tile.hasNormals = Number.isFinite(dracoFeatureTableProperties.NORMAL);
            tile.hasBatchIds = Number.isFinite(dracoFeatureTableProperties.BATCH_ID);
            tile.isTranslucent = Number.isFinite(dracoFeatureTableProperties.RGBA);
        }
    }

    if (!dracoBuffer) {
        return false;
    }

    const dracoData = {
        buffer: dracoBuffer,
        properties: { ...dracoFeatureTableProperties, ...dracoBatchTableProperties },
        featureTableProperties: dracoFeatureTableProperties,
        batchTableProperties: dracoBatchTableProperties,
        dequantizeInShader: false
    };

    await loadDraco(tile, dracoData, batchTable, options, context);
    return true;
}

async function loadDraco(
    tile: Tiles3DTileContent,
    dracoData: any,
    batchTable: Tile3DBatchTable | null,
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<void> {
    if (!context) return;

    // Parse Draco data
    const data = await parseFromContext(
        dracoData.buffer,
        DracoLoader,
        {
            ...options,
            draco: {
                ...options?.draco,
                extraAttributes: dracoData.batchTableProperties || {}
            }
        },
        context
    );

    const decodedPositions =
        data.schema.attributes["POSITION"] && data.schema.attributes["POSITION"].array;
    const decodedColors = data.schema.attributes["COLOR"] && data.schema.attributes["COLOR"].array;
    const decodedNormals =
        data.schema.attributes["NORMAL"] && data.schema.attributes["NORMAL"].array;
    const decodedBatchIds =
        data.schema.attributes["BATCH_ID"] && data.schema.attributes["BATCH_ID"].array;
    const isQuantizedDraco =
        decodedPositions && (data.schema.attributes["POSITION"] as any).quantization;
    const isOctEncodedDraco =
        decodedNormals && (data.schema.attributes["NORMAL"] as any).quantization;
    if (isQuantizedDraco) {
        // Draco quantization range == quantized volume scale - size in meters of the quantized volume
        // Internal quantized range is the range of values of the quantized data, e.g. 255 for 8-bit, 1023 for 10-bit, etc
        // @ts-expect-error This doesn't look right
        const quantization = data.POSITION.data.quantization;
        const range = quantization.range;
        tile.quantizedVolumeScale = new Vector3(range, range, range);
        tile.quantizedVolumeOffset = new Vector3(quantization.minValues);
        tile.quantizedRange = (1 << quantization.quantizationBits) - 1.0;
        tile.isQuantizedDraco = true;
    }
    if (isOctEncodedDraco) {
        // @ts-expect-error This doesn't look right
        tile.octEncodedRange = (1 << data.NORMAL.data.quantization.quantizationBits) - 1.0;
        tile.isOctEncodedDraco = true;
    }

    // Extra batch table attributes
    const batchTableAttributes = {};
    if (dracoData.batchTableProperties) {
        for (const attributeName of Object.keys(dracoData.batchTableProperties)) {
            if (
                data.schema.attributes[attributeName] &&
                data.schema.attributes[attributeName].array
            ) {
                batchTableAttributes[attributeName.toLowerCase()] =
                    data.schema.attributes[attributeName].array;
            }
        }
    }

    tile.attributes = {
        positions: decodedPositions,
        colors: normalize3DTileColorAttribute(tile, decodedColors as Uint8ClampedArray, undefined),
        normals: decodedNormals,
        batchIds: decodedBatchIds,
        ...batchTableAttributes
    };
}

// Implement missing parseFromContext function
async function parseFromContext(
    data: ArrayBuffer,
    loader: any,
    options: any,
    context: any
): Promise<DracoMesh> {
    // If there is context, use context's parsing capability
    if (context && context.parse) {
        return context.parse(data, loader, options);
    }
    // Otherwise, directly use loader to parse
    return loader.parse(data, options);
}
