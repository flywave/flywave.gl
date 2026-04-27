import { type TileKey, type TilingScheme, TileAvailability } from "@flywave/flywave-geoutils";
/**
 * Constants defining quantized mesh extension identifiers
 * These constants are used to identify supported terrain data extensions
 */
export declare const QuantizedMeshExtensionIds: {
    /** Vertex normals encoded in octahedral format */
    OCT_VERTEX_NORMALS: number;
    /** Water mask for ocean/sea area detection */
    WATER_MASK: number;
    /** Metadata for enhanced terrain information */
    METADATA: number;
};
/**
 * Interface defining the contract for layer strategy implementations
 *
 * This interface provides a standardized way to interact with different
 * terrain layer implementations, abstracting the underlying data source
 * and providing consistent access to terrain metadata and data.
 */
export interface ILayerStrategy {
    /**
     * Checks if terrain data is available for a specific tile
     *
     * @param tileKey - The tile key to check availability for
     * @returns True if available, false if not, undefined if unknown
     */
    getTileDataAvailable(tileKey: TileKey): boolean | undefined;
    /**
     * Gets the maximum supported zoom level
     *
     * @returns The maximum zoom level supported by this layer
     */
    getMaxZoom(): number;
    /**
     * Gets the minimum supported zoom level
     *
     * @returns The minimum zoom level supported by this layer
     */
    getMinZoom(): number;
    /**
     * Gets the tile availability information
     *
     * @returns TileAvailability instance describing data coverage
     */
    getAvailability(): TileAvailability;
    /**
     * Gets layer information and metadata
     *
     * @returns LayerInformation containing detailed layer metadata
     */
    getLayerInformation(): LayerInformation;
    /**
     * Gets the attribution string for this layer
     *
     * @returns Attribution string for proper credit display
     */
    getAttribution(): string;
    /**
     * Checks if vertex normals are available
     *
     * @returns True if vertex normals are supported, false otherwise
     */
    hasVertexNormals(): boolean;
    /**
     * Checks if water mask data is available
     *
     * @returns True if water mask is supported, false otherwise
     */
    hasWaterMask(): boolean;
    /**
     * Checks if metadata is available
     *
     * @returns True if metadata is supported, false otherwise
     */
    hasMetadata(): boolean;
    /**
     * Gets the maximum geometric error for a specific level
     * Used for level of detail calculations
     *
     * @param level - The zoom level to get error for
     * @returns Maximum geometric error for the specified level
     */
    getLevelMaximumGeometricError(level: number): number;
    /**
     * Requests terrain data buffer for a specific tile
     *
     * @param tileKey - The tile key identifying the requested tile
     * @returns Promise resolving to the terrain data buffer
     */
    requestTileBuffer(tileKey: TileKey): Promise<ArrayBuffer>;
    /** Whether water mask data is requested */
    readonly requestWaterMask: boolean;
    /** Whether metadata is requested */
    readonly requestMetadata: boolean;
    /** Whether vertex normals are requested */
    readonly requestVertexNormals: boolean;
    /** The tiling scheme used by this layer */
    readonly tilingScheme: TilingScheme;
    /** The tiling scheme identifier */
    readonly scheme: string;
    /** The base URL for this layer */
    readonly url: string;
}
/**
 * Container class for layer information and metadata
 *
 * This class encapsulates all the metadata information about a terrain layer,
 * including availability information, supported features, and configuration
 * details needed for proper terrain rendering and data management.
 */
export declare class LayerInformation {
    /** Layer version string */
    readonly version: string;
    /** Whether this layer represents heightmap data */
    readonly isHeightmap: boolean;
    /** Array of URL templates for tile requests */
    readonly tileUrlTemplates: string[];
    /** Tile availability information */
    readonly availability: TileAvailability;
    /** Whether vertex normals are supported */
    readonly hasVertexNormals: boolean;
    /** Whether water mask data is supported */
    readonly hasWaterMask: boolean;
    /** Whether metadata is supported */
    readonly hasMetadata: boolean;
    /** Availability levels specification */
    readonly availabilityLevels: number;
    /** Availability tiles loaded information */
    readonly availabilityTilesLoaded: TileAvailability;
    /** Whether extension sizes use little-endian format */
    readonly littleEndianExtensionSize: boolean;
    /**
     * Creates a new LayerInformation instance
     *
     * @param layer - Object containing layer information properties
     */
    constructor(layer: {
        version: string;
        isHeightmap: boolean;
        tileUrlTemplates: string[];
        availability: TileAvailability;
        hasVertexNormals: boolean;
        hasWaterMask: boolean;
        hasMetadata: boolean;
        availabilityLevels: number;
        availabilityTilesLoaded: TileAvailability;
        littleEndianExtensionSize: boolean;
    });
}
/**
 * Configuration options for creating a LayerStrategy instance
 */
export interface LayerStrategyOptions {
    /** Whether to request water mask data */
    requestWaterMask?: boolean;
    /** Whether to request metadata */
    requestMetadata?: boolean;
    /** Whether to request vertex normals */
    requestVertexNormals?: boolean;
    /** Base URL for the terrain layer */
    url: string;
    /** Optional custom HTTP headers */
    headers?: HeadersInit;
    /** Optional query string parameters */
    queryString?: string;
    /** Optional skirt height for geometric error calculations */
    skirtHeight?: number;
}
/**
 * Creates and initializes a new LayerStrategy instance
 *
 * This factory function handles the asynchronous initialization
 * of a LayerStrategy by connecting to the terrain data source
 * and downloading the required metadata.
 *
 * @param options - Configuration options for the layer strategy
 * @returns Promise resolving to the initialized LayerStrategy instance
 */
export declare function createLayerStrategy(options: LayerStrategyOptions): Promise<LayerStrategy>;
/**
 * Layer strategy implementation for quantized mesh terrain data
 *
 * This class provides a complete implementation for accessing and managing
 * quantized mesh terrain data, including:
 * - Metadata parsing and validation
 * - Tile availability checking
 * - Data format and extension support
 * - HTTP request management
 * - Tiling scheme handling
 *
 * The strategy handles both direct tile access and parent-child relationships
 * for proper terrain data loading and fallback mechanisms.
 */
declare class LayerStrategy implements ILayerStrategy {
    private readonly options;
    private downloadManager;
    /**
     * Whether water mask data is requested
     * @private
     */
    private readonly _requestWaterMask;
    /**
     * Whether metadata is requested
     * @private
     */
    private readonly _requestMetadata;
    /**
     * Whether vertex normals are requested
     * @private
     */
    private readonly _requestVertexNormals;
    /**
     * Whether water mask data is available from the source
     * @private
     */
    private _hasWaterMask;
    /**
     * Whether vertex normals are available from the source
     * @private
     */
    private _hasVertexNormals;
    /**
     * Whether metadata is available from the source
     * @private
     */
    private _hasMetadata;
    /**
     * Layer information and metadata container
     * @private
     */
    private layerInformation;
    /**
     * Maximum geometric error at level zero
     * @private
     */
    private _levelZeroMaximumGeometricError;
    /**
     * Tiling scheme identifier
     * @private
     */
    private _scheme;
    /**
     * Tiling scheme instance
     * @private
     */
    private _tilingScheme;
    /**
     * Standard heightmap width for geometric error calculations
     * @private
     */
    private readonly _heightmapWidth;
    /**
     * Base URL for the terrain layer
     * @private
     */
    private readonly _baseUrl;
    /**
     * HTTP request configuration
     * @private
     */
    private readonly request;
    /**
     * Attribution string for proper credit display
     */
    attribution: string;
    /**
     * Overall availability information by level
     */
    overallAvailability: Record<number, number[][]>;
    /**
     * Overall maximum zoom level supported
     */
    overallMaxZoom: number;
    /**
     * Overall minimum zoom level supported
     */
    overallMinZoom: number;
    /**
     * Creates a new LayerStrategy instance
     *
     * @param options - Configuration options for the layer strategy
     */
    constructor(options: LayerStrategyOptions);
    /**
     * Gets the maximum geometric error for a specific level
     * Used for level of detail calculations and error-based subdivision
     *
     * @param level - The zoom level to calculate error for
     * @returns Maximum geometric error for the specified level
     */
    getLevelMaximumGeometricError(level: number): number;
    /**
     * Gets whether water mask data is requested
     */
    get requestWaterMask(): boolean;
    /**
     * Gets whether metadata is requested
     */
    get requestMetadata(): boolean;
    /**
     * Gets whether vertex normals are requested
     */
    get requestVertexNormals(): boolean;
    /**
     * Gets the tiling scheme used by this layer
     */
    get tilingScheme(): TilingScheme;
    /**
     * Gets the tiling scheme identifier
     */
    get scheme(): string;
    /**
     * Gets the base URL for this layer
     */
    get url(): string;
    /**
     * Gets the processed base URL for this layer
     */
    get baseUrl(): string;
    /**
     * Connects to the terrain data source and downloads metadata
     *
     * This method initializes the layer strategy by downloading and
     * parsing the layer.json metadata file, setting up tiling schemes,
     * availability information, and supported features.
     *
     * @returns Promise that resolves when connection is complete
     */
    connect(): Promise<void>;
    /**
     * Checks if terrain data is available for a specific tile
     *
     * This method implements a comprehensive availability checking strategy:
     * 1. First checks direct tile availability
     * 2. If metadata is available, checks parent tile availability
     * 3. Returns appropriate availability status
     *
     * @param tileKey - The tile key to check availability for
     * @returns True if available, false if not, undefined if unknown
     */
    getTileDataAvailable(tileKey: TileKey): boolean | undefined;
    /**
     * Gets the layer information and metadata
     *
     * @returns LayerInformation containing detailed layer metadata
     */
    getLayerInformation(): LayerInformation;
    /**
     * Gets the maximum supported zoom level
     *
     * @returns The maximum zoom level supported by this layer
     */
    getMaxZoom(): number;
    /**
     * Gets the minimum supported zoom level
     *
     * @returns The minimum zoom level supported by this layer
     */
    getMinZoom(): number;
    /**
     * Gets the tile availability information
     *
     * @returns TileAvailability instance describing data coverage
     */
    getAvailability(): TileAvailability;
    /**
     * Gets the attribution string for this layer
     *
     * @returns Attribution string for proper credit display
     */
    getAttribution(): string;
    /**
     * Checks if vertex normals are available
     *
     * @returns True if vertex normals are supported, false otherwise
     */
    hasVertexNormals(): boolean;
    /**
     * Checks if water mask data is available
     *
     * @returns True if water mask is supported, false otherwise
     */
    hasWaterMask(): boolean;
    /**
     * Checks if metadata is available
     *
     * @returns True if metadata is supported, false otherwise
     */
    hasMetadata(): boolean;
    /**
     * Gets the availability tile (parent) for a given tile coordinate
     *
     * This method calculates the parent tile coordinates based on
     * availability levels configuration for hierarchical availability checking.
     *
     * @param layer - Layer information containing availability levels
     * @param x - Tile column coordinate
     * @param y - Tile row coordinate
     * @param level - Tile zoom level
     * @returns Parent tile coordinates or undefined if at root level
     * @private
     */
    private getAvailabilityTile;
    /**
     * Parses and processes successful metadata download
     *
     * This method handles the parsing of layer.json metadata,
     * setting up tiling schemes, availability information,
     * supported extensions, and other layer configuration.
     *
     * @param data - The downloaded layer metadata
     * @returns Promise that resolves when parsing is complete
     * @private
     */
    private parseMetadataSuccess;
    /**
     * Calculates the estimated level zero geometric error
     *
     * This method estimates the maximum geometric error at the base level
     * which is used to calculate error thresholds for all other levels.
     *
     * @param tileImageWidth - Width of the tile image in pixels
     * @param numberOfTilesAtLevelZero - Number of tiles at level zero
     * @returns Estimated geometric error at level zero
     * @private
     */
    private getEstimatedLevelZeroGeometricError;
    /**
     * Requests terrain data buffer for a specific tile
     *
     * This method constructs the appropriate URL and HTTP headers
     * for requesting terrain data, including requested extensions,
     * and performs the actual download operation.
     *
     * @param tileKey - The tile key identifying the requested tile
     * @returns Promise resolving to the terrain data buffer
     */
    requestTileBuffer(tileKey: TileKey): Promise<ArrayBuffer>;
}
export {};
