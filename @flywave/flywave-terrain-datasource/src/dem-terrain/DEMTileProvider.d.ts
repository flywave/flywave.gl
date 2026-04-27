import { type GeoBox, type TileKey } from "@flywave/flywave-geoutils";
import { type GroundModificationEventParams, type GroundModificationManager, type SerializedGroundModificationPolygon } from "../ground-modification-manager";
import { ResourceProvider } from "../ResourceProvider";
import { type ITerrainSource } from "../TerrainSource";
import { TileValidResource } from "../TileResourceManager";
import DEMData, { type DEMEncoding } from "./dem/DemData";
import { type DEMTerrainSource } from "./DEMTerrainSource";
/**
 * Constant identifier for DEM data resources
 */
export declare const DEMDataResourceType = "demData";
/**
 * Description of a DEM data source
 *
 * This interface describes the structure of a DEM data source, including
 * the tile URL templates, tiling scheme, geographic bounds, zoom levels,
 * and tile size information.
 */
export interface DemSourceDescription {
    /**
     * Array of tile URL templates
     * Supports placeholders like {z}/{x}/{y} or {zoom}/{x}/{y}
     * Example: ['https://example.com/terrain/{z}/{x}/{y}.png']
     */
    tiles: string[];
    /**
     * Tile coordinate system scheme
     * - "xyz": Standard Web Mercator tile scheme (most common)
     * - "tms": TMS tile scheme with flipped Y-axis
     * - "custom": Custom coordinate system
     */
    scheme: "xyz" | "tms" | "custom";
    /**
     * Geographic bounds [west, south, east, north] in degrees
     * Example: [-180, -85.0511, 180, 85.0511] for global coverage
     */
    bounds: [number, number, number, number];
    /**
     * Minimum zoom level (0-22)
     * The minimum zoom level at which tiles are available
     */
    minzoom: number;
    /**
     * Maximum zoom level (0-22)
     * The maximum zoom level at which tiles are available
     */
    maxzoom: number;
    /**
     * Tile size in pixels
     * Typically 256 or 512
     * Modern map services often use 512x512 tiles
     */
    tileSize: number;
    /**
     * Data source type
     * For terrain data, must be set to "raster-dem"
     */
    type: "raster-dem";
    /**
     * Elevation data encoding format
     * - "terrarium": PNG format with RGB-encoded elevation (Red * 256 + Green + Blue / 256 - 32768)
     * - "mapbox": Mapbox custom encoding, optimized compression format
     * - "custom": Custom encoding format
     */
    encoding?: "terrarium" | "mapbox" | "custom";
    /**
     * Data source attribution
     * Copyright information displayed on the map
     */
    attribution?: string;
    /**
     * Volatility flag
     * If true, indicates tile content may change frequently, cache strategy will be more aggressive
     */
    volatile?: boolean;
    /**
     * Tile coordinate system definition
     * Transformation matrix for custom coordinate systems
     * Typically [1, -1, -1, 1] or [1, 0, 0, 1], etc.
     */
    tileSystem?: number[];
    /**
     * CORS cross-origin settings
     * - "anonymous": Anonymous cross-origin requests, no credentials sent
     * - "use-credentials": Cross-origin requests with credentials
     */
    crossOrigin?: "anonymous" | "use-credentials";
    /**
     * Elevation data units
     * - "meters": Meters (default)
     * - "feet": Feet
     */
    units?: "meters" | "feet";
    /**
     * Maximum tile cache size
     * Controls the number of tiles cached in memory, affects performance
     */
    maxCacheSize?: number;
    /**
     * Retry count
     * Number of retries when tile loading fails
     */
    retries?: number;
    /**
     * Minimum tile recognizability
     * Controls the detail level threshold for tile loading
     */
    minimumTileRecognizability?: number;
    /**
     * Request parameters
     * Additional query parameters appended to tile URLs
     */
    queryParameters?: Record<string, string>;
    /**
     * Request headers
     * HTTP headers for tile requests
     */
    headers?: Record<string, string>;
    /**
     * Error handling callback
     * Handler function when tile loading fails
     */
    onError?: (error: Error, tile: {
        z: number;
        x: number;
        y: number;
    }) => void;
    /**
     * Preprocessing function
     * Function to preprocess loaded tile data
     */
    preprocess?: (data: ArrayBuffer, tile: {
        z: number;
        x: number;
        y: number;
    }) => ArrayBuffer | Promise<ArrayBuffer>;
}
/**
 * DEM tile resource representing decoded elevation data for a specific tile
 *
 * This class extends TileValidResource to provide specialized functionality
 * for DEM (Digital Elevation Model) data. It manages the decoded elevation
 * data and handles ground modification updates.
 */
export declare class DemTileResource extends TileValidResource {
    private _demData;
    /**
     * Creates a new DEM tile resource
     *
     * @param geoBox - The geographic bounding box of the tile
     * @param _demData - The DEM data for this tile
     */
    constructor(geoBox: GeoBox, _demData: DEMData);
    /**
     * Disposes of the underlying DEM data resources
     *
     * This method is called when the resource is being cleaned up to ensure
     * that all allocated resources (textures, buffers, etc.) are properly released.
     */
    protected disposeResources(): void;
    /**
     * Gets the memory usage of this resource in bytes
     *
     * @returns The number of bytes used by this resource
     */
    getBytesUsed(): number;
    /**
     * Gets the DEM data for this tile
     */
    get demData(): DEMData;
    /**
     * Handles ground modification changes for this tile
     *
     * When ground modifications change, this method recreates the DEM tile resource
     * with the updated ground modification data applied to the elevation data.
     *
     * @param event - The ground modification event parameters
     * @param modify - The ground modification manager
     * @returns A promise that resolves when the update is complete
     */
    protected handleGroundModificationChange(event: GroundModificationEventParams, modify: GroundModificationManager): Promise<void>;
    /**
     * Creates a DEM tile resource from imagery data
     *
     * This static method processes raw imagery data (typically from a tile request)
     * and converts it into a fully decoded DEM tile resource. It handles image
     * processing, ground modifications, and neighboring tile backfilling.
     *
     * @param imgData - The source image data (Image, ImageBitmap, or ImageData)
     * @param tileKey - The tile key identifying this tile
     * @param terrainSource - The terrain data source
     * @param encoding - The DEM encoding format
     * @param groundModificationPolygons - Optional ground modification polygons
     * @returns A promise that resolves to a new DemTileResource
     */
    static createDemTileResourceFromImageryData(imgData: HTMLImageElement | ImageBitmap | ImageData, tileKey: TileKey, terrainSource: ITerrainSource, encoding: DEMEncoding, groundModificationPolygons?: SerializedGroundModificationPolygon[]): Promise<any>;
}
/**
 * DEM tile provider for loading and decoding digital elevation model data
 *
 * This class extends ResourceProvider to handle the specific requirements
 * of loading DEM data from various sources. It manages the connection to
 * data sources, tile fetching, and progressive loading of elevation data.
 */
export declare class DemTileProvider extends ResourceProvider<DemTileResource, DEMTerrainSource> {
    private readonly dem_options;
    /**
     * Checks if the provider is ready to load tiles
     *
     * @returns True if the source description has been loaded, false otherwise
     */
    ready(): boolean;
    /**
     * Establishes connection to the data source
     *
     * This method loads the source description if it hasn't been loaded yet.
     *
     * @returns A promise that resolves when the connection is established
     */
    protected connect(): Promise<void>;
    /** Transfer manager for handling network requests */
    private readonly _transferManager;
    /** The encoding format for the DEM data */
    private readonly _encoding;
    /** The source description loaded from the data source */
    private m_sourceDescription;
    /** Array of tile URL templates */
    private _tileUriList;
    /** Geographic bounds of the data source */
    private _bounds;
    /**
     * Creates a new DEM tile provider
     *
     * @param dem_options - Configuration options for the DEM provider
     */
    constructor(dem_options: {
        source: string | DemSourceDescription;
        encoding?: DEMEncoding;
    });
    /**
     * Gets the encoding format for the DEM data
     */
    get encoding(): DEMEncoding;
    /**
     * Gets the source description
     */
    get sourceDescription(): DemSourceDescription | null;
    /**
     * Gets the maximum zoom level supported by this provider
     *
     * @returns The maximum zoom level
     */
    getMaxZoom(): number;
    /**
     * Gets the minimum zoom level supported by this provider
     *
     * @returns The minimum zoom level
     */
    getMinZoom(): number;
    /**
     * Checks if the elevation map should be flipped on the Y axis
     *
     * @returns True if the Y axis should be flipped
     */
    isElevationMapFlipY(): boolean;
    /**
     * Sets the data source for this provider
     *
     * This method loads the source description from either a URL or a direct
     * source description object and processes it for use.
     *
     * @param source - The source URL or description
     * @returns A promise that resolves when the source is set
     */
    private setSource;
    /**
     * Checks if a tile is contained within the data source bounds
     *
     * @param tileKey - The tile key to check
     * @returns True if the tile is within bounds
     */
    containsTile(tileKey: TileKey): boolean;
    /**
     * Gets the resource type identifier
     *
     * @returns The DEM data resource type constant
     */
    protected getResourceType(): typeof DEMDataResourceType;
    /**
     * Processes the loaded source description
     *
     * This method extracts information from the source description and
     * configures the provider accordingly.
     */
    private _processSourceDescription;
    /**
     * Gets a tile resource for the specified tile key
     *
     * This method fetches the raw tile data, processes it into an image,
     * and then creates a DEM tile resource from that image data.
     *
     * @param tileKey - The tile key to load
     * @param abortSignal - Optional abort signal for cancellation
     * @returns A promise that resolves to the DEM tile resource
     */
    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<DemTileResource>;
    /**
  * Fetches raw tile data from the data source
  *
  * This method constructs the appropriate URL for the tile and fetches
  * the raw data using the transfer manager.
  *
  * @param tileKey - The tile key to fetch
  * @param abortSignal - Optional abort signal for cancellation
  * @returns A promise that resolves to the raw tile data
  */
    private _fetchTileData;
    /**
     * Checks if a URL is relative
     *
     * @param url - The URL to check
     * @returns True if the URL is relative
     */
    private _isRelativeUrl;
    /**
     * Resolves a relative URL against a base source URL
     *
     * @param relativeUrl - The relative URL to resolve
     * @param sourceUrl - The base source URL
     * @returns The resolved absolute URL
     */
    private _resolveRelativeUrl;
}
