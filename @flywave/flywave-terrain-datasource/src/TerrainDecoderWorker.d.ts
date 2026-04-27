import { type DecodedTile, type DecoderOptions, type ITileDecoder, type OptionsMap, type RequestController, type TileInfo } from "@flywave/flywave-datasource-protocol";
import { type Projection, type TileKey } from "@flywave/flywave-geoutils";
import { TaskType } from "./Constants";
import { type SerializedDEMData } from "./dem-terrain/dem/DemData";
import { type QuantizedTerrainMeshData } from "./quantized-terrain/quantized-mesh/QuantizedTerrainMesh";
import { type DecodedStratumTileData } from "./quantized-terrain/quantized-stratum-mesh/stratum-tile/StratumTileData";
import { TileGeometryReprojectionData } from "./quantized-terrain/TileWorkerDecoder";
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
    tileTerrain: QuantizedTerrainMeshData | DecodedStratumTileData | TileGeometryReprojectionData | SerializedDEMData | ImageBitmap | ImageData;
};
/**
 * Terrain tile decoder implementation
 * This class handles decoding of various terrain data formats in a web worker context
 * It supports multiple terrain formats including quantized meshes, stratum tiles, and DEM data
 *
 * The decoder implements the ITileDecoder interface which is part of the mapview decoder system
 */
export declare class TerrainTileDecoder implements ITileDecoder {
    /**
     * Establishes connection for the decoder
     * This is a placeholder implementation that immediately resolves
     * In more complex decoders, this might establish connections to external services
     *
     * @returns A promise that resolves when the connection is established
     */
    connect(): Promise<void>;
    /**
     * Disposes of the decoder and cleans up resources
     * This is a placeholder implementation as this decoder doesn't hold any resources
     * that need explicit cleanup
     */
    dispose(): void;
    /**
     * Retrieves information about a tile without fully decoding it
     * This implementation returns undefined as we don't currently extract tile info
     *
     * @param data - The raw tile data as an ArrayBuffer
     * @param tileKey - The key identifying the tile to get info for
     * @param projection - The projection used for the tile
     * @returns A promise that resolves to TileInfo or undefined
     */
    getTileInfo(data: ArrayBufferLike, tileKey: TileKey, projection: Projection): Promise<TileInfo | undefined>;
    /**
     * Configures the decoder with options
     * This is a placeholder implementation as this decoder doesn't require configuration
     *
     * @param options - General decoder options
     * @param customOptions - Custom options map
     */
    configure(options?: DecoderOptions, customOptions?: OptionsMap): void;
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
    decodeTile(data: {
        type: TaskType;
    } & Record<string, unknown>, tileKey: TileKey, projection: Projection, requestController?: RequestController): Promise<DecodedTile | undefined>;
}
/**
 * Service class for managing the terrain tile decoder
 * This class registers the TerrainTileDecoder with the worker service manager
 * to make it available for processing terrain tiles in web workers
 */
export declare class TerrainTileDecoderService {
    /**
     * Starts the terrain tile decoder service
     * This method registers the decoder service with the WorkerServiceManager
     * using the TERRAIN_TILE_DECODER_ID identifier
     *
     * The factory function creates a new TileDecoderService with a TerrainTileDecoder instance
     */
    static start(): void;
}
