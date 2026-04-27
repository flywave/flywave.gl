import { type GeoBox, type TileKey, type TilingScheme } from "@flywave/flywave-geoutils";
import { type WebTileDataProvider } from "@flywave/flywave-webtile-datasource";
import * as THREE from "three";
import { type GroundModificationEventParams, type GroundModificationManager } from "./ground-modification-manager";
import { ResourceProvider } from "./ResourceProvider";
import { type ITerrainSource } from "./TerrainSource";
import { TileValidResource } from "./TileResourceManager";
/**
 * Options for configuring the WebTileLoader
 */
export interface WebTileLoaderOptions {
    /**
     * The tiling scheme to use for tile loading
     * @default webMercatorTerrainTilingScheme
     */
    tilingScheme?: TilingScheme;
}
/**
 * Represents a web tile with its geographic bounding box and texture
 */
export interface WebTile {
    /**
     * The geographic bounding box of the tile
     */
    geoBox: GeoBox;
    /**
     * The texture of the tile
     */
    texture: THREE.Texture;
}
/**
 * Resource class for web imagery tiles
 */
declare class WebImageryTileResource extends TileValidResource {
    tiles: WebTile[];
    protected handleGroundModificationChange(event: GroundModificationEventParams, modify: GroundModificationManager): Promise<void>;
    /**
     * Creates a new web imagery tile resource
     * @param tiles - The web tiles
     */
    constructor(tiles: WebTile[], geoBox: GeoBox);
    /**
     * @inheritdoc
     */
    disposeResources(): void;
    /**
     * @inheritdoc
     */
    getBytesUsed(): number;
    /**
     * Get the tiles value
     */
    get value(): WebTile[];
}
/**
 * Provider for web imagery tiles
 */
export declare class WebImageryTileProvider extends ResourceProvider<WebImageryTileResource, ITerrainSource> {
    /**
     * The web tile data provider
     */
    readonly webTileProvider: WebTileDataProvider;
    /**
     * Cache for storing loaded textures
     */
    private readonly textureCache;
    /**
     * Map for tracking pending requests to prevent duplicate loads
     */
    private readonly pendingRequests;
    /**
     * Creates a new web imagery tile provider
     * @param dataProvider - The web tile data provider
     * @param options - The options for the tile provider
     */
    constructor(dataProvider: WebTileDataProvider, options: WebTileLoaderOptions);
    /**
     * Creates a THREE.Texture from an ImageBitmap
     * @param imageBitmap - The ImageBitmap to create texture from
     * @returns The created texture
     */
    private createTextureFromImageBitmap;
    /**
     * Configures texture parameters
     * @param texture - The texture to configure
     */
    private configureTexture;
    /**
     * Loads texture for a specific tile
     * @param tile - The tile key to load
     * @param noCache - Whether to skip caching
     * @param abortSignal - Optional abort signal to cancel the operation
     * @returns Promise that resolves to the loaded texture
     */
    private loadTileTexture;
    /**
     * Executes the actual texture loading logic
     * @param tile - The tile key to load
     * @param noCache - Whether to skip caching
     * @param abortSignal - Optional abort signal to cancel the operation
     * @param cacheKey - The cache key for the tile
     * @returns Promise that resolves to the loaded texture
     */
    private executeLoadTileTexture;
    /**
     * @inheritdoc
     */
    ready(): boolean;
    /**
     * @inheritdoc
     */
    getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<WebImageryTileResource>;
    /**
     * @inheritdoc
     */
    protected connect(): Promise<void>;
    /**
     * Clears the texture cache
     */
    clearCache(): void;
    /**
     * Gets the current cache size
     * @returns The number of items in the cache
     */
    getCacheSize(): number;
    /**
     * Gets the number of pending requests
     * @returns The number of pending requests
     */
    getPendingRequestsCount(): number;
}
export {};
