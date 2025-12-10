/* Copyright (C) 2025 flywave.gl contributors */

// height-map/DemTileProgressiveLoader.ts
import {
    type GeoBox,
    type TileKey,
    geographicTerrainStandardTiling,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import {
    arrayBufferToImage,
    arrayBufferToImageBitmap,
    browser,
    offscreenCanvasSupported,
    prevPowerOfTwo
} from "@flywave/flywave-utils";
import { Box2, Vector2 } from "three";

import { TaskType } from "../Constants";
import {
    type GroundModificationEventParams,
    type GroundModificationManager,
    type SerializedGroundModificationPolygon,
    serializeGroundModificationPolygon
} from "../ground-modification-manager";
import { ResourceProvider } from "../ResourceProvider";
import type { DecodedTerrainTile } from "../TerrainDecoderWorker";
import { type ITerrainSource } from "../TerrainSource";
import { TileValidResource } from "../TileResourceManager";
import DEMData, { type DEMEncoding, type SerializedDEMData } from "./dem/DemData";
import { type DEMTerrainSource } from "./DEMTerrainSource";

/**
 * Constant identifier for DEM data resources
 */
export const DEMDataResourceType = "demData";

const tempBox = new Box2();
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
    onError?: (error: Error, tile: { z: number; x: number; y: number }) => void;

    /** 
     * Preprocessing function
     * Function to preprocess loaded tile data
     */
    preprocess?: (data: ArrayBuffer, tile: { z: number; x: number; y: number }) => ArrayBuffer | Promise<ArrayBuffer>;
}

/**
 * DEM tile resource representing decoded elevation data for a specific tile
 *
 * This class extends TileValidResource to provide specialized functionality
 * for DEM (Digital Elevation Model) data. It manages the decoded elevation
 * data and handles ground modification updates.
 */
export class DemTileResource extends TileValidResource {
    /**
     * Creates a new DEM tile resource
     *
     * @param geoBox - The geographic bounding box of the tile
     * @param _demData - The DEM data for this tile
     */
    constructor(geoBox: GeoBox, private _demData: DEMData) {
        super(geoBox);
    }

    /**
     * Disposes of the underlying DEM data resources
     *
     * This method is called when the resource is being cleaned up to ensure
     * that all allocated resources (textures, buffers, etc.) are properly released.
     */
    protected disposeResources(): void {
        this.demData.dispose();
    }

    /**
     * Gets the memory usage of this resource in bytes
     *
     * @returns The number of bytes used by this resource
     */
    getBytesUsed(): number {
        return this.demData.getBytesUsed();
    }

    /**
     * Gets the DEM data for this tile
     */
    get demData(): DEMData {
        return this._demData;
    }

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
    protected override handleGroundModificationChange(
        event: GroundModificationEventParams,
        modify: GroundModificationManager
    ): Promise<void> {
        return DemTileResource.createDemTileResourceFromImageryData(
            this.demData.sourceImage,
            this.tileKey,
            this.terrainSource,
            this.demData.encoding,
            event.modifications?.map(serializeGroundModificationPolygon)
        ).then((demTileResource: DemTileResource) => {
            this._demData.dispose();
            this._demData = demTileResource.demData;
        });
    }

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
    static async createDemTileResourceFromImageryData(
        imgData: HTMLImageElement | ImageBitmap | ImageData,
        tileKey: TileKey,
        terrainSource: ITerrainSource,
        encoding: DEMEncoding,
        groundModificationPolygons?: SerializedGroundModificationPolygon[]
    ) {
        const buffer = (imgData.width - prevPowerOfTwo(imgData.width)) / 2;
        const padding = 1 - buffer;
        const borderReady = padding < 1;

        let rawImageData: ImageData;
        if (imgData instanceof ImageData) {
            rawImageData = imgData as ImageData;
        } else {
            const transfer =
                window.ImageBitmap && imgData instanceof ImageBitmap && offscreenCanvasSupported();

            rawImageData = (
                transfer ? imgData : browser.getImageData(imgData, padding)
            ) as ImageData;
        }
        const geoBox = terrainSource.getTilingScheme().getGeoBox(tileKey);

        const polygons =
            groundModificationPolygons ||
            terrainSource
                .getGroundModificationManager()
                .findModificationsInBoundingBox(geoBox)
                .map(serializeGroundModificationPolygon);

        return terrainSource.decoder
            .decodeTile(
                {
                    type: TaskType.RasterDEM,
                    coord: tileKey,
                    rawImageData,
                    encoding,
                    geoBox: geoBox.toArray(),
                    padding,
                    groundModificationPolygons: polygons,
                    height: imgData.height,
                    width: imgData.width,
                    flipY: (terrainSource.dataProvider() as DemTileProvider).isElevationMapFlipY(),
                    krigingOptions: terrainSource.getGroundModificationManager().krigingOptions
                },
                tileKey,
                terrainSource.projection
            )
            .then(({ tileTerrain }: DecodedTerrainTile) => {
                const data = tileTerrain as SerializedDEMData;

                const dem = DEMData.fromSerialized(data);
                dem.sourceImage = imgData;
                // if (polygons?.length)
                //     document.body.appendChild(createCanvasFromImageData(data.data));
                if (!borderReady && !dem.neighboringTiles) {
                    dem.markNeighboringTilesAsBackfilled(
                        tileKey,
                        terrainSource.getTilingScheme().mortonTileEncoding,
                        {
                            getPreciseResource: (tileID: TileKey) =>
                                (
                                    terrainSource.dataProvider() as DemTileProvider
                                ).getPreciseResource(tileID)?.demData
                        }
                    );
                }
                return new DemTileResource(geoBox, dem);
            });
    }
}

/**
 * DEM tile provider for loading and decoding digital elevation model data
 *
 * This class extends ResourceProvider to handle the specific requirements
 * of loading DEM data from various sources. It manages the connection to
 * data sources, tile fetching, and progressive loading of elevation data.
 */
export class DemTileProvider extends ResourceProvider<DemTileResource, DEMTerrainSource> {
    /**
     * Checks if the provider is ready to load tiles
     *
     * @returns True if the source description has been loaded, false otherwise
     */
    ready(): boolean {
        return this.m_sourceDescription !== null;
    }

    /**
     * Establishes connection to the data source
     *
     * This method loads the source description if it hasn't been loaded yet.
     *
     * @returns A promise that resolves when the connection is established
     */
    protected async connect(): Promise<void> {
        if (this.ready()) return;
        // 假设 options.source 可以通过 this.options 访问
        await this.setSource(this.dem_options.source);
    }

    /** Transfer manager for handling network requests */
    private readonly _transferManager = new TransferManager(undefined, 1);
    /** The encoding format for the DEM data */
    private readonly _encoding: DEMEncoding;
    /** The source description loaded from the data source */
    private m_sourceDescription: DemSourceDescription | null = null;
    /** Array of tile URL templates */
    private _tileUriList: string[] = [];
    /** Geographic bounds of the data source */
    private _bounds: Box2 = new Box2(new Vector2(180, 90), new Vector2(-180, -90));

    /**
     * Creates a new DEM tile provider
     *
     * @param dem_options - Configuration options for the DEM provider
     */
    constructor(
        private readonly dem_options: {
            source: string | DemSourceDescription;
            encoding?: DEMEncoding;
        }
    ) {
        super({
            tilingScheme: webMercatorTerrainTilingScheme
        });

        this._encoding = dem_options.encoding || "mapbox";
    }

    /**
     * Gets the encoding format for the DEM data
     */
    get encoding(): DEMEncoding {
        return this._encoding;
    }

    /**
     * Gets the source description
     */
    get sourceDescription(): DemSourceDescription | null {
        return this.m_sourceDescription;
    }

    /**
     * Gets the maximum zoom level supported by this provider
     *
     * @returns The maximum zoom level
     */
    getMaxZoom(): number {
        return this.m_sourceDescription?.maxzoom || 0;
    }

    /**
     * Gets the minimum zoom level supported by this provider
     *
     * @returns The minimum zoom level
     */
    getMinZoom(): number {
        return this.m_sourceDescription?.minzoom || 0;
    }

    /**
     * Checks if the elevation map should be flipped on the Y axis
     *
     * @returns True if the Y axis should be flipped
     */
    isElevationMapFlipY(): boolean {
        return this.terrainSource.getTilingScheme() !== geographicTerrainStandardTiling;
    }

    /**
     * Sets the data source for this provider
     *
     * This method loads the source description from either a URL or a direct
     * source description object and processes it for use.
     *
     * @param source - The source URL or description
     * @returns A promise that resolves when the source is set
     */
    private async setSource(source: string | DemSourceDescription): Promise<void> {
        if (typeof source === "string") {
            this.m_sourceDescription = (await this._transferManager.downloadJson(
                source
            )) as DemSourceDescription;
        } else {
            this.m_sourceDescription = source;
        }

        if (this.m_sourceDescription) {
            this._processSourceDescription();
        }
    }

    /**
     * Checks if a tile is contained within the data source bounds
     *
     * @param tileKey - The tile key to check
     * @returns True if the tile is within bounds
     */
    containsTile(tileKey: TileKey): boolean {
        if (!this.m_sourceDescription) return false;

        const { maxzoom, minzoom } = this.m_sourceDescription;
        const geoBox = this.terrainSource.getTilingScheme().getGeoBox(tileKey);
        const { lng: minLng, lat: minLat } = geoBox.southWest;
        const { lng: maxLng, lat: maxLat } = geoBox.northEast;

        tempBox.set(new Vector2(minLng, minLat), new Vector2(maxLng, maxLat));
        return this._bounds.intersectsBox(tempBox) && tileKey.level >= minzoom && tileKey.level <= maxzoom;
    }

    /**
     * Gets the resource type identifier
     *
     * @returns The DEM data resource type constant
     */
    protected getResourceType(): typeof DEMDataResourceType {
        return DEMDataResourceType;
    }

    /**
     * Processes the loaded source description
     *
     * This method extracts information from the source description and
     * configures the provider accordingly.
     */
    private _processSourceDescription(): void {
        if (!this.m_sourceDescription) return;

        const { tiles, bounds, minzoom, maxzoom } = this.m_sourceDescription;

        this._tileUriList = tiles;
        this._bounds = new Box2(
            new Vector2(bounds[0], bounds[1]),
            new Vector2(bounds[2], bounds[3])
        );

        this.updateConfig(minzoom, maxzoom);
    }

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
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<DemTileResource> {
        const dbuffer = await this._fetchTileData(tileKey, abortSignal);
        const img: HTMLImageElement | ImageBitmap = await new Promise(resolve => {
            if (window.createImageBitmap) {
                arrayBufferToImageBitmap(dbuffer, (err, imgBitmap) => {
                    resolve(imgBitmap);
                });
            } else {
                arrayBufferToImage(dbuffer, (err, img) => {
                    resolve(img);
                });
            }
        });

        if (!img) return await Promise.resolve(undefined);
        return await DemTileResource.createDemTileResourceFromImageryData(
            img,
            tileKey,
            this.terrainSource,
            this.encoding
        );
    }

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
    private async _fetchTileData(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<ArrayBuffer | undefined> {
        if (!this.m_sourceDescription) {
            throw new Error("Source description not loaded");
        }

        if (!this.containsTile(tileKey)) {
            return await Promise.reject({ name: "AbortError" });
        }

        let url =
            this._tileUriList[tileKey.mortonCode(this.mortonCodeType) % this._tileUriList.length];

        // First perform XYZ placeholder replacement
        if (this.m_sourceDescription.scheme === "xyz") {
            // Support various placeholder conventions
            const replacements: Record<string, string> = {
                // Standard XYZ format
                "{x}": String(tileKey.column),
                "{y}": String(tileKey.row),
                "{z}": String(tileKey.level),
                // Other common formats
                "{level}": String(tileKey.level),
                "{zoom}": String(tileKey.level),
                "{col}": String(tileKey.column),
                "{row}": String(tileKey.row),
                // TMS format (Y coordinate needs flipping)
                "{tmsY}": String(Math.pow(2, tileKey.level) - 1 - tileKey.row)
            };

            // Apply all replacements
            for (const [placeholder, value] of Object.entries(replacements)) {
                if (url.includes(placeholder)) {
                    url = url.replace(new RegExp(placeholder, 'g'), value);
                }
            }

            // If no placeholders found, use default XYZ format
            if (!url.includes(String(tileKey.column)) &&
                !url.includes(String(tileKey.row)) &&
                !url.includes(String(tileKey.level))) {
                console.warn(`No placeholder found in URL template: ${url}`);
            }
        }

        // Handle relative path scenarios (after placeholder replacement)
        // If the URL is a relative path and setSource was called with a URL,
        // automatically append the source directory address
        if (this._isRelativeUrl(url) && typeof this.dem_options.source === "string") {
            url = this._resolveRelativeUrl(url, this.dem_options.source);
        }

        return this._transferManager
            .downloadArrayBuffer(url, { signal: abortSignal })
            .catch(e => Promise.resolve(new ArrayBuffer(0)));
    }

    /**
     * Checks if a URL is relative
     * 
     * @param url - The URL to check
     * @returns True if the URL is relative
     */
    private _isRelativeUrl(url: string): boolean {
        return url.startsWith("./") ||
            url.startsWith("../") ||
            (!url.includes("://") && !url.startsWith("/"));
    }

    /**
     * Resolves a relative URL against a base source URL
     * 
     * @param relativeUrl - The relative URL to resolve
     * @param sourceUrl - The base source URL
     * @returns The resolved absolute URL
     */
    private _resolveRelativeUrl(relativeUrl: string, sourceUrl: string): string {
        try {
            // If sourceUrl is an absolute URL
            if (sourceUrl.includes("://")) {
                const baseUrl = new URL(sourceUrl);
                const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf("/") + 1);
                return new URL(relativeUrl, `${baseUrl.origin}${basePath}`).toString();
            } else {
                // If sourceUrl is a relative URL, resolve against current page location
                const baseUrl = new URL(sourceUrl, window.location.href);
                const basePath = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf("/") + 1);
                return new URL(relativeUrl, `${baseUrl.origin}${basePath}`).toString();
            }
        } catch (error) {
            console.warn(`Failed to resolve relative URL: ${relativeUrl} against source: ${sourceUrl}`, error);
            return relativeUrl;
        }
    }
}
