/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TileKey,
    type TilingScheme,
    geographicTerrainStandardTiling,
    TileAvailability,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { defaultValue, defined, formatUrl } from "@flywave/flywave-utils";

/**
 * Creates HTTP request headers for quantized mesh terrain requests
 *
 * This function generates appropriate Accept headers that specify
 * the supported quantized mesh formats and extensions, allowing
 * the server to respond with the requested data types.
 *
 * @param extensionsList - Optional list of requested extensions
 * @returns HTTP headers object with Accept header
 */
function getRequestHeader(extensionsList?: string[]): HeadersInit {
    if (!defined(extensionsList) || extensionsList.length === 0) {
        return {
            Accept: "application/vnd.quantized-mesh,application/octet-stream;q=0.9,*/*;q=0.01"
        };
    }

    const extensions = extensionsList.join("-");
    return {
        Accept:
            "application/vnd.quantized-mesh;extensions=" +
            extensions +
            ",application/octet-stream;q=0.9,*/*;q=0.01"
    };
}

/**
 * Interface defining the structure of layer.json metadata
 * This interface describes the JSON structure returned by terrain providers
 */
interface LayerData {
    /** TileJSON specification version */
    tilejson: string;

    /** Layer name identifier */
    name: string;

    /** Layer version string */
    version: string;

    /** Tile data format specification */
    format: string;

    /** Array of URL templates for tile requests */
    tiles: string[];

    /** Minimum zoom level supported */
    minzoom: number;

    /** Maximum zoom level supported */
    maxzoom: number;

    /** Geographic bounds [west, south, east, north] */
    bounds: [number, number, number, number];

    /** Tiling scheme identifier */
    scheme: "tms" | "xyz" | "slippyMap";

    /** Optional attribution string */
    attribution?: string;

    /** Optional parent layer URL */
    parentUrl?: string;

    /** Projection specification */
    projection: string;

    /** Metadata availability level specification */
    metadataAvailability?: number;

    /** Array of available tile ranges by level */
    available: Array<
        Array<{
            startX: number;
            startY: number;
            endX: number;
            endY: number;
        }>
    >;

    /** Optional list of supported extensions */
    extensions?: string[];
}

/**
 * Constants defining quantized mesh extension identifiers
 * These constants are used to identify supported terrain data extensions
 */
export const QuantizedMeshExtensionIds = {
    /** Vertex normals encoded in octahedral format */
    OCT_VERTEX_NORMALS: 1,

    /** Water mask for ocean/sea area detection */
    WATER_MASK: 2,

    /** Metadata for enhanced terrain information */
    METADATA: 4
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
export class LayerInformation {
    /** Layer version string */
    public readonly version: string;

    /** Whether this layer represents heightmap data */
    public readonly isHeightmap: boolean;

    /** Array of URL templates for tile requests */
    public readonly tileUrlTemplates: string[];

    /** Tile availability information */
    public readonly availability: TileAvailability;

    /** Whether vertex normals are supported */
    public readonly hasVertexNormals: boolean;

    /** Whether water mask data is supported */
    public readonly hasWaterMask: boolean;

    /** Whether metadata is supported */
    public readonly hasMetadata: boolean;

    /** Availability levels specification */
    public readonly availabilityLevels: number;

    /** Availability tiles loaded information */
    public readonly availabilityTilesLoaded: TileAvailability;

    /** Whether extension sizes use little-endian format */
    public readonly littleEndianExtensionSize: boolean;

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
    }) {
        this.version = layer.version;
        this.isHeightmap = layer.isHeightmap;
        this.tileUrlTemplates = layer.tileUrlTemplates;
        this.availability = layer.availability;
        this.hasVertexNormals = layer.hasVertexNormals;
        this.hasWaterMask = layer.hasWaterMask;
        this.hasMetadata = layer.hasMetadata;
        this.availabilityLevels = layer.availabilityLevels;
        this.availabilityTilesLoaded = layer.availabilityTilesLoaded;
        this.littleEndianExtensionSize = layer.littleEndianExtensionSize;
    }
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
export async function createLayerStrategy(options: LayerStrategyOptions): Promise<LayerStrategy> {
    const provider = new LayerStrategy(options);
    await provider.connect();
    return provider;
}

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
class LayerStrategy implements ILayerStrategy {

   private downloadManager = new TransferManager(undefined, 1);


    /**
     * Whether water mask data is requested
     * @private
     */
    private readonly _requestWaterMask: boolean;

    /**
     * Whether metadata is requested
     * @private
     */
    private readonly _requestMetadata: boolean;

    /**
     * Whether vertex normals are requested
     * @private
     */
    private readonly _requestVertexNormals: boolean;

    /**
     * Whether water mask data is available from the source
     * @private
     */
    private _hasWaterMask: boolean = false;

    /**
     * Whether vertex normals are available from the source
     * @private
     */
    private _hasVertexNormals: boolean = false;

    /**
     * Whether metadata is available from the source
     * @private
     */
    private _hasMetadata: boolean = false;

    /**
     * Layer information and metadata container
     * @private
     */
    private layerInformation!: LayerInformation;

    /**
     * Maximum geometric error at level zero
     * @private
     */
    private _levelZeroMaximumGeometricError!: number;

    /**
     * Tiling scheme identifier
     * @private
     */
    private _scheme!: string;

    /**
     * Tiling scheme instance
     * @private
     */
    private _tilingScheme!: TilingScheme;

    /**
     * Standard heightmap width for geometric error calculations
     * @private
     */
    private readonly _heightmapWidth: number = 65;

    /**
     * Base URL for the terrain layer
     * @private
     */
    private readonly _baseUrl: string;

    /**
     * HTTP request configuration
     * @private
     */
    private readonly request: RequestInit;

    /**
     * Attribution string for proper credit display
     */
    public attribution: string = "";

    /**
     * Overall availability information by level
     */
    public overallAvailability: Record<number, number[][]> = {};

    /**
     * Overall maximum zoom level supported
     */
    public overallMaxZoom: number = 0;

    /**
     * Overall minimum zoom level supported
     */
    public overallMinZoom: number = Number.MAX_SAFE_INTEGER;

    /**
     * Creates a new LayerStrategy instance
     *
     * @param options - Configuration options for the layer strategy
     */
    constructor(private readonly options: LayerStrategyOptions) {
        this._requestWaterMask = defaultValue(options.requestWaterMask, false);
        this._requestMetadata = defaultValue(options.requestMetadata, true);
        this._requestVertexNormals = options.requestVertexNormals || false;

        this._baseUrl = options.url.replace("layer.json", "");

        this.request = {
            headers: { ...options.headers, accept: "application/json" }
        };
    }

    /**
     * Gets the maximum geometric error for a specific level
     * Used for level of detail calculations and error-based subdivision
     *
     * @param level - The zoom level to calculate error for
     * @returns Maximum geometric error for the specified level
     */
    public getLevelMaximumGeometricError(level: number): number {
        return this.options.skirtHeight !== undefined
            ? this.options.skirtHeight
            : this._levelZeroMaximumGeometricError / (1 << level);
    }

    /**
     * Gets whether water mask data is requested
     */
    public get requestWaterMask(): boolean {
        return this._requestWaterMask;
    }

    /**
     * Gets whether metadata is requested
     */
    public get requestMetadata(): boolean {
        return this._requestMetadata;
    }

    /**
     * Gets whether vertex normals are requested
     */
    public get requestVertexNormals(): boolean {
        return this._requestVertexNormals;
    }

    /**
     * Gets the tiling scheme used by this layer
     */
    public get tilingScheme(): TilingScheme {
        return this._tilingScheme;
    }

    /**
     * Gets the tiling scheme identifier
     */
    public get scheme(): string {
        return this._scheme;
    }

    /**
     * Gets the base URL for this layer
     */
    public get url(): string {
        return this.options.url;
    }

    /**
     * Gets the processed base URL for this layer
     */
    public get baseUrl(): string {
        return this._baseUrl;
    }

    /**
     * Connects to the terrain data source and downloads metadata
     *
     * This method initializes the layer strategy by downloading and
     * parsing the layer.json metadata file, setting up tiling schemes,
     * availability information, and supported features.
     *
     * @returns Promise that resolves when connection is complete
     */
    public async connect(): Promise<void> {
        let layerUrl = this.url;

        // Ensure proper layer.json URL format
        if (!layerUrl.endsWith("layer.json")) {
            layerUrl = layerUrl.replace(/\/$/, "") + "/layer.json";
        }

        // Download and parse layer metadata
        const data = (await this.downloadManager.downloadJson(`${layerUrl}`, this.request)) as LayerData;

        await this.parseMetadataSuccess(data);
    }

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
    public getTileDataAvailable(tileKey: TileKey): boolean | undefined {
        const { column: x, row: y, level } = tileKey;

        // Check level range constraints
        if (level < this.layerInformation.availability.minimumLevel) {
            return false;
        }

        if (level > this.layerInformation.availability.maximumLevel) {
            return false;
        }

        // Return undefined if no availability information is available
        if (!defined(this.layerInformation.availability)) {
            return undefined;
        }

        // Check direct tile availability
        return this.layerInformation.availability.isTileAvailable(level, x, y);
        // If metadata is supported, check parent tile availability
        if (this._hasMetadata && defined(this.layerInformation.availabilityLevels)) {
            // Check parent tiles for availability information
            let parentTile = this.getAvailabilityTile(this.layerInformation, x, y, level);
            while (defined(parentTile)) {
                if (
                    this.layerInformation.availability.isTileAvailable(
                        parentTile.level,
                        parentTile.x,
                        parentTile.y
                    )
                ) {
                    return true; // Parent available indicates potential data
                }
                parentTile = this.getAvailabilityTile(
                    this.layerInformation,
                    parentTile.x,
                    parentTile.y,
                    parentTile.level
                );
            }
            return false; // No available parent tiles found
        }

        // Return false if no metadata support
        return false;
    }

    /**
     * Gets the layer information and metadata
     *
     * @returns LayerInformation containing detailed layer metadata
     */
    public getLayerInformation(): LayerInformation {
        return this.layerInformation;
    }

    /**
     * Gets the maximum supported zoom level
     *
     * @returns The maximum zoom level supported by this layer
     */
    public getMaxZoom(): number {
        return this.overallMaxZoom;
    }

    /**
     * Gets the minimum supported zoom level
     *
     * @returns The minimum zoom level supported by this layer
     */
    public getMinZoom(): number {
        return this.overallMinZoom;
    }

    /**
     * Gets the tile availability information
     *
     * @returns TileAvailability instance describing data coverage
     */
    public getAvailability(): TileAvailability {
        return this.layerInformation.availability;
    }

    /**
     * Gets the attribution string for this layer
     *
     * @returns Attribution string for proper credit display
     */
    public getAttribution(): string {
        return this.attribution;
    }

    /**
     * Checks if vertex normals are available
     *
     * @returns True if vertex normals are supported, false otherwise
     */
    public hasVertexNormals(): boolean {
        return this._hasVertexNormals;
    }

    /**
     * Checks if water mask data is available
     *
     * @returns True if water mask is supported, false otherwise
     */
    public hasWaterMask(): boolean {
        return this._hasWaterMask;
    }

    /**
     * Checks if metadata is available
     *
     * @returns True if metadata is supported, false otherwise
     */
    public hasMetadata(): boolean {
        return this._hasMetadata;
    }

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
    private getAvailabilityTile(
        layer: LayerInformation,
        x: number,
        y: number,
        level: number
    ): { level: number; x: number; y: number } | undefined {
        if (level === 0 || !defined(layer.availabilityLevels)) {
            return undefined;
        }

        const availabilityLevels = layer.availabilityLevels;
        const parentLevel =
            level % availabilityLevels === 0
                ? level - availabilityLevels
                : Math.floor(level / availabilityLevels) * availabilityLevels;

        const divisor = 1 << (level - parentLevel);
        const parentX = Math.floor(x / divisor);
        const parentY = Math.floor(y / divisor);

        return { level: parentLevel, x: parentX, y: parentY };
    }

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
    private async parseMetadataSuccess(data: LayerData): Promise<void> {
        // Validate required metadata fields
        if (!data.format) {
            throw new Error("The tile format is not specified in the layer.json file.");
        }

        if (!data.tiles || data.tiles.length === 0) {
            throw new Error("The layer.json file does not specify any tile URL templates.");
        }

        if (
            data.format.indexOf("quantized-mesh-1.") !== 0 &&
            data.format.indexOf("stratum-mesh-1.") !== 0
        ) {
            throw new Error(`The tile format "${data.format}" is invalid or not supported.`);
        }

        // Extract basic layer information
        const tileUrlTemplates = data.tiles;
        const maxZoom = data.maxzoom;
        const minZoom = data.minzoom;
        this.overallMinZoom = Math.min(this.overallMinZoom, minZoom);
        this.overallMaxZoom = Math.max(this.overallMaxZoom, maxZoom);

        // Determine and set tiling scheme
        if (!data.projection || data.projection === "EPSG:4326") {
            this._tilingScheme = geographicTerrainStandardTiling;
        } else if (data.projection === "EPSG:3857") {
            this._tilingScheme = webMercatorTerrainTilingScheme;
        } else {
            throw new Error(`The projection "${data.projection}" is invalid or not supported.`);
        }

        // Calculate level zero geometric error
        this._levelZeroMaximumGeometricError = this.getEstimatedLevelZeroGeometricError(
            this._heightmapWidth,
            this._tilingScheme.subdivisionScheme.getLevelDimensionX(0)
        );

        // Validate tiling scheme
        if (data.scheme && data.scheme !== "tms" && data.scheme !== "slippyMap") {
            throw new Error(`The scheme "${data.scheme}" is invalid or not supported.`);
        }
        this._scheme = data.scheme;

        // Parse extension support
        let hasVertexNormals = false;
        let hasWaterMask = false;
        let hasMetadata = false;
        let littleEndianExtensionSize = true;

        if (defined(data.extensions)) {
            if (data.extensions.includes("octvertexnormals")) {
                hasVertexNormals = true;
            } else if (data.extensions.includes("vertexnormals")) {
                hasVertexNormals = true;
                littleEndianExtensionSize = false;
            }
            if (data.extensions.includes("watermask")) {
                hasWaterMask = true;
            }
            if (data.extensions.includes("metadata")) {
                hasMetadata = true;
            }
        }

        // Parse availability information
        const availabilityLevels = data.metadataAvailability;
        const availableTiles = data.available;
        let availability: TileAvailability;
        let availabilityTilesLoaded: TileAvailability;

        // if (defined(availableTiles) && !defined(availabilityLevels)) {
        // Direct availability specification
        availability = TileAvailability.createInitialRanges(
            this._tilingScheme,
            minZoom || 0,
            minZoom + availableTiles.length - 1,
            availableTiles[0]
        );

        for (let level = minZoom || 0; level < minZoom + availableTiles.length; ++level) {
            const index = level - minZoom;
            const rangesAtLevel = availableTiles[index];

            if (!defined(this.overallAvailability[level])) {
                this.overallAvailability[level] = [];
            }

            for (let rangeIndex = 0; rangeIndex < rangesAtLevel.length; ++rangeIndex) {
                const range = rangesAtLevel[rangeIndex];
                const yStart = range.startY;
                const yEnd = range.endY;

                this.overallAvailability[level].push([range.startX, yStart, range.endX, yEnd]);
                availability.addAvailableTileRange(level, range.startX, yStart, range.endX, yEnd);
            }
        }
        // } else if (defined(availabilityLevels)) {
        //     // Hierarchical availability specification
        //     availabilityTilesLoaded = new TileAvailability(this._tilingScheme, minZoom, maxZoom);
        //     availability = TileAvailability.createInitialRanges(
        //         this._tilingScheme,
        //         minZoom,
        //         maxZoom,
        //         availableTiles[0]
        //     );
        //     this.overallAvailability[0] = [[0, 0, 1, 0]];
        //     // availability.addAvailableTileRange(0, 0, 0, 1, 0);
        // }

        // Update extension support flags
        this._hasWaterMask = hasWaterMask;
        this._hasVertexNormals = hasVertexNormals;
        this._hasMetadata = hasMetadata;

        if (defined(data.attribution)) {
            this.attribution = data.attribution;
        }

        // Create layer information container
        this.layerInformation = new LayerInformation({
            version: data.version,
            isHeightmap: false,
            tileUrlTemplates,
            availability,
            hasVertexNormals,
            hasWaterMask,
            hasMetadata,
            availabilityLevels,
            availabilityTilesLoaded,
            littleEndianExtensionSize
        });

        // Handle parent layer metadata if specified
        if (defined(data.parentUrl)) {
            const parentData = (await this.downloadManager.downloadJson(
                `${data.parentUrl}/layer.json`,
                this.request
            )) as LayerData;
            await this.parseMetadataSuccess(parentData);
        }
    }

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
    private getEstimatedLevelZeroGeometricError(
        tileImageWidth: number,
        numberOfTilesAtLevelZero: number
    ): number {
        // Simplified calculation without ellipsoid parameter
        return (2 * Math.PI * 0.25) / (tileImageWidth * numberOfTilesAtLevelZero);
    }

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
    public requestTileBuffer(tileKey: TileKey): Promise<ArrayBuffer> {
        const layerToUse = this.layerInformation;
        if (!defined(layerToUse)) {
            return Promise.reject(new Error("Terrain tile doesn't exist"));
        }

        const { column: x, row: y, level } = tileKey;

        const urlTemplates = layerToUse.tileUrlTemplates;
        if (urlTemplates.length === 0) {
            return Promise.reject(new Error("No tile URL templates available"));
        }

        // Calculate appropriate Y coordinate based on tiling scheme
        let terrainY: number;
        const yTiles = this.tilingScheme.subdivisionScheme.getLevelDimensionY(level);
        if (!this.scheme || this.scheme === "tms") {
            terrainY = y;
        } else {
            terrainY = yTiles - y - 1;
        }

        // Build extension list based on requested and supported extensions
        const extensionList: string[] = [];
        if (this.requestVertexNormals && layerToUse.hasVertexNormals) {
            extensionList.push(
                layerToUse.littleEndianExtensionSize ? "octvertexnormals" : "vertexnormals"
            );
        }
        if (this.requestWaterMask && layerToUse.hasWaterMask) {
            extensionList.push("watermask");
        }
        if (this.requestMetadata && layerToUse.hasMetadata) {
            extensionList.push("metadata");
        }

        // Create appropriate HTTP headers
        const headers = getRequestHeader(extensionList);

        // Select URL template and construct final URL
        const url = this.baseUrl + urlTemplates[(x + terrainY + level) % urlTemplates.length];

        // Perform the download
        const promise = this.downloadManager.downloadArrayBuffer(
            formatUrl(url, {
                version: layerToUse.version,
                z: level,
                x,
                y: terrainY
            }),
            {
                headers: { ...this.request.headers, ...headers }
            }
        );

        if (!defined(promise)) {
            return Promise.reject(new Error("Failed to create download promise"));
        }

        return promise;
    }
}
