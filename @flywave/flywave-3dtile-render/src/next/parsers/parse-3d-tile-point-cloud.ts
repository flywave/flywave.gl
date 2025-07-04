import { DracoLoader } from "@flywave/flywave-draco";
import { GL } from "@flywave/flywave-utils";
import { Vector3 } from "three";

import Tile3DBatchTable from "../classes/tile-3d-batch-table";
import Tile3DFeatureTable from "../classes/tile-3d-feature-table";
import { Tiles3DLoaderOptions } from "../Loader";
import { Tiles3DTileContent } from "../types";
import { normalize3DTileColorAttribute } from "./helpers/normalize-3d-tile-colors";
import { normalize3DTileNormalAttribute } from "./helpers/normalize-3d-tile-normals";
import { normalize3DTilePositionAttribute } from "./helpers/normalize-3d-tile-positions";
import { parse3DTileHeaderSync } from "./helpers/parse-3d-tile-header";
import { parse3DTileTablesHeaderSync, parse3DTileTablesSync } from "./helpers/parse-3d-tile-tables";

// 添加缺失的类型定义
interface DracoQuantization {
    quantizationBits: number;
    minValues: number[];
    range: number;
}

interface DracoAttribute {
    value: any;
    quantization?: DracoQuantization;
}

interface DracoData {
    attributes: {
        [key: string]: DracoAttribute;
    };
}

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

    // 仅在未使用Draco时解析常规属性
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
            tile.featureTableBinary?.slice(dracoByteOffset, dracoByteOffset + dracoByteLength) ||
            null;

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
    batchTable: Tile3DBatchTable | null, // 新增这个参数
    options?: Tiles3DLoaderOptions,
    context?: any
): Promise<void> {
    if (!context) {
        return;
    }

    const dracoOptions = {
        ...options,
        draco: {
            ...options?.draco,
            extraAttributes: dracoData.batchTableProperties || {}
        }
    };

    // 删除可能过大的选项
    delete dracoOptions["3d-tiles"];

    const data = await parseFromContext(dracoData.buffer, DracoLoader, dracoOptions, context);

    const decodedPositions = data.attributes.POSITION?.value;
    const decodedColors = data.attributes.COLOR_0?.value;
    const decodedNormals = data.attributes.NORMAL?.value;
    const decodedBatchIds = data.attributes.BATCH_ID?.value;

    // 修复属性访问方式
    const isQuantizedDraco = decodedPositions && data.attributes.POSITION.quantization;
    const isOctEncodedDraco = decodedNormals && data.attributes.NORMAL.quantization;

    if (isQuantizedDraco) {
        const quantization = data.attributes.POSITION.quantization;
        const range = quantization.range;
        tile.quantizedVolumeScale = new Vector3(range, range, range);
        tile.quantizedVolumeOffset = new Vector3(
            quantization.minValues[0],
            quantization.minValues[1],
            quantization.minValues[2]
        );
        tile.quantizedRange = (1 << quantization.quantizationBits) - 1.0;
        tile.isQuantizedDraco = true;
    }

    if (isOctEncodedDraco) {
        const quantization = data.attributes.NORMAL.quantization;
        tile.octEncodedRange = (1 << quantization.quantizationBits) - 1.0;
        tile.isOctEncodedDraco = true;
    }

    // 处理额外属性
    const batchTableAttributes: Record<string, any> = {};
    if (dracoData.batchTableProperties) {
        for (const attributeName of Object.keys(dracoData.batchTableProperties)) {
            if (data.attributes[attributeName]?.value) {
                batchTableAttributes[attributeName.toLowerCase()] =
                    data.attributes[attributeName].value;
            }
        }
    }

    // 更新tile属性
    tile.attributes = {
        positions: decodedPositions || tile.attributes.positions,
        colors:
            normalize3DTileColorAttribute(tile, decodedColors, batchTable) ||
            tile.attributes.colors,
        normals: decodedNormals || tile.attributes.normals,
        batchIds: decodedBatchIds || tile.attributes.batchIds,
        ...batchTableAttributes
    };
}

// 实现缺失的parseFromContext函数
async function parseFromContext(
    data: ArrayBuffer,
    loader: any,
    options: any,
    context: any
): Promise<DracoData> {
    // 如果有context，则使用context的解析能力
    if (context && context.parse) {
        return context.parse(data, loader, options);
    }
    // 否则直接使用loader解析
    return loader.parse(data, options);
}
