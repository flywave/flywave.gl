/* Copyright (C) 2025 flywave.gl contributors */

// Updated TileDecoderWorker.ts
import {
    type DecodedTile,
    type DecoderOptions,
    type ITileDecoder,
    type OptionsMap,
    type RequestController,
    type TileInfo
} from "@flywave/flywave-datasource-protocol";
import { type GeoBoxArray, type Projection, type TileKey, GeoBox } from "@flywave/flywave-geoutils";
import { TileDecoderService } from "@flywave/flywave-mapview-decoder/TileDecoderService";
import { WorkerServiceManager } from "@flywave/flywave-mapview-decoder/WorkerServiceManager";

import { TaskType, TERRAIN_TILE_DECODER_ID } from "./Constants";
import { type SerializedDEMData } from "./dem-terrain/dem/DemData"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { type DecodeTileParams, processDEMTile } from "./dem-terrain/TileWorkerDecoder";
import { type GroundOverlayTextureJSON } from "./ground-overlay-provider/GroundOverlayTexture";
import { processGroundOverlayTile } from "./ground-overlay-provider/TileWorkerDecoder";
import { type QuantizedMeshClipperOptions } from "./quantized-terrain/quantized-mesh/QuantizedMeshClipper";
import { type QuantizedMeshLoaderOptions } from "./quantized-terrain/quantized-mesh/QuantizedMeshLoader";
import { type QuantizedTerrainMeshData } from "./quantized-terrain/quantized-mesh/QuantizedTerrainMesh";
import { type DecodedStratumTileData } from "./quantized-terrain/quantized-stratum-mesh/stratum-tile/StratumTileData";
import {
    type DecodeStratumTileParams,
    processQuantizedMesh,
    processReProjectTileGeometry,
    processStratumTile,
    processUpsampledMesh,
    TileGeometryReprojectionData,
    TileGeometryReprojectionParams
} from "./quantized-terrain/TileWorkerDecoder";

/**
 * Represents a decoded terrain tile with additional terrain data
 * This extends the base DecodedTile interface to include specific terrain data
 * that can be one of several formats:
 * - QuantizedTerrainMeshData: For quantized mesh terrain
 * - StratumTileData: For stratum-based terrain
 * - DEMData: For digital elevation model data
 * - ImageBitmap: For raster terrain data
 */
export type DecodedTerrainTile = DecodedTile & {
    /**
     * The terrain mesh data for this tile, either quantized mesh or stratum tile data
     * This property contains the actual terrain geometry and elevation information
     * that will be used for rendering the 3D terrain
     */
    tileTerrain:
    | QuantizedTerrainMeshData
    | DecodedStratumTileData
    | TileGeometryReprojectionData
    | SerializedDEMData
    | ImageBitmap
    | ImageData;
};

/**
 * Factory function to create a decoded tile with terrain data
 * This function creates a minimal DecodedTile structure with empty techniques and geometries
 * arrays, and attaches the provided terrain data to it
 *
 * @template T - The type of terrain data (QuantizedTerrainMeshData, StratumTileData, DEMData, or ImageBitmap)
 * @param tileTerrain - The terrain data to attach to the decoded tile
 * @returns A DecodedTile object with the terrain data attached
 */
const createDecodedTile = <
    T extends
    | QuantizedTerrainMeshData
    | TileGeometryReprojectionData
    | DecodedStratumTileData
    | SerializedDEMData
    | ImageBitmap
    | ImageData
>(
    tileTerrain: T
): DecodedTile & { tileTerrain: T } => {
    return {
        techniques: [], // Empty array as we're only dealing with terrain data
        geometries: [], // Empty array as geometry is contained in tileTerrain
        tileTerrain // Attach the terrain data
    };
};

/**
 * Terrain tile decoder implementation
 * This class handles decoding of various terrain data formats in a web worker context
 * It supports multiple terrain formats including quantized meshes, stratum tiles, and DEM data
 *
 * The decoder implements the ITileDecoder interface which is part of the mapview decoder system
 */
export class TerrainTileDecoder implements ITileDecoder {
    /**
     * Establishes connection for the decoder
     * This is a placeholder implementation that immediately resolves
     * In more complex decoders, this might establish connections to external services
     *
     * @returns A promise that resolves when the connection is established
     */
    public connect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Disposes of the decoder and cleans up resources
     * This is a placeholder implementation as this decoder doesn't hold any resources
     * that need explicit cleanup
     */
    public dispose(): void {
        // No cleanup required for this decoder implementation
    }

    /**
     * Retrieves information about a tile without fully decoding it
     * This implementation returns undefined as we don't currently extract tile info
     *
     * @param data - The raw tile data as an ArrayBuffer
     * @param tileKey - The key identifying the tile to get info for
     * @param projection - The projection used for the tile
     * @returns A promise that resolves to TileInfo or undefined
     */
    public getTileInfo(
        data: ArrayBufferLike,
        tileKey: TileKey,
        projection: Projection
    ): Promise<TileInfo | undefined> {
        // Not implemented - return undefined
        return Promise.resolve(undefined);
    }

    /**
     * Configures the decoder with options
     * This is a placeholder implementation as this decoder doesn't require configuration
     *
     * @param options - General decoder options
     * @param customOptions - Custom options map
     */
    public configure(options?: DecoderOptions, customOptions: OptionsMap = {}): void {
        // No configuration needed for this decoder
    }

    /**
     * Decodes a terrain tile based on its type
     * This is the main decoding function that handles different terrain data formats
     * It dispatches to specialized processing functions based on the task type
     *
     * @param data - The data to decode, including the task type and format-specific data
     * @param tileKey - The key identifying the tile being decoded
     * @param projection - The projection used for the tile
     * @param requestController - Optional controller for managing the decode request
     * @returns A promise that resolves to a DecodedTile or undefined
     * @throws Error if the task type is not supported
     */
    public async decodeTile(
        data: {
            type: TaskType;
        } & Record<string, unknown>,
        tileKey: TileKey,
        projection: Projection,
        requestController?: RequestController
    ): Promise<DecodedTile | undefined> {
        // Variable to hold the processed terrain data
        let tileTerrain:
            | QuantizedTerrainMeshData
            | DecodedStratumTileData
            | TileGeometryReprojectionData
            | SerializedDEMData
            | ImageBitmap
            | ImageData;

        // Dispatch to appropriate processing function based on task type
        switch (data.type) {
            // Handle quantized mesh terrain data
            case TaskType.QuantizedMesh:
                tileTerrain = processQuantizedMesh(
                    data as unknown as { buffer: ArrayBuffer } & QuantizedMeshLoaderOptions,
                    projection
                );
                break;

            // Handle upsampled quantized mesh data (for LOD transitions)
            case TaskType.QuantizedUpsample:
                tileTerrain = processUpsampledMesh(
                    data as unknown as {
                        quantizedTerrainMeshData: QuantizedTerrainMeshData;
                        tileKey: ArrayLike<number>;
                        parentTileKey: ArrayLike<number>;
                    } & QuantizedMeshClipperOptions,
                    projection
                );
                break;

            // Handle quantized stratum initialization data
            case TaskType.QuantizedStratumInit:
                tileTerrain = processStratumTile({
                    ...data,
                    geoBox: GeoBox.fromArray(data.geoBox as GeoBoxArray),
                    projection
                } as unknown as DecodeStratumTileParams) as DecodedStratumTileData;
                break;

            // Handle raster DEM (Digital Elevation Model) data
            case TaskType.RasterDEM: {
                const { dem } = await processDEMTile(data as unknown as DecodeTileParams);
                tileTerrain = dem.serialize();
                break;
            }

            // Handle ground overlay data
            case TaskType.GroundOverlay: {
                const imageData = processGroundOverlayTile(
                    data as unknown as {
                        overlays: GroundOverlayTextureJSON[];
                        geoBox: GeoBoxArray;
                        flipY: boolean;
                    }
                );
                tileTerrain = imageData;
                break;
            }

            case TaskType.GeometryReprojection:
                let buffer = processReProjectTileGeometry(
                    data as unknown as TileGeometryReprojectionParams,
                    projection
                );

                tileTerrain = buffer;
                break;

            // Handle unsupported task types
            default:
                throw new Error(`Unsupported task type: ${(data as { type: unknown }).type}`);
        }

        // Create and return the decoded tile with the processed terrain data
        return createDecodedTile(tileTerrain);
    }
}

/**
 * Service class for managing the terrain tile decoder
 * This class registers the TerrainTileDecoder with the worker service manager
 * to make it available for processing terrain tiles in web workers
 */
export class TerrainTileDecoderService {
    /**
     * Starts the terrain tile decoder service
     * This method registers the decoder service with the WorkerServiceManager
     * using the TERRAIN_TILE_DECODER_ID identifier
     *
     * The factory function creates a new TileDecoderService with a TerrainTileDecoder instance
     */
    public static start(): void {
        WorkerServiceManager.getInstance().register({
            serviceType: TERRAIN_TILE_DECODER_ID,
            factory: (serviceId: string) => {
                return TileDecoderService.start(serviceId, new TerrainTileDecoder());
            }
        });
    }
}
