/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type TileKey,
    type TilingScheme,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { type Tile } from "@flywave/flywave-mapview";
import { textureToImageBitmap } from "@flywave/flywave-utils/TextureSerializer";
import { type WebTileDataProvider } from "@flywave/flywave-webtile-datasource";
import * as THREE from "three";

import {
    type GroundModificationEventParams,
    type GroundModificationManager
} from "./ground-modification-manager";
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
class WebImageryTileResource extends TileValidResource {
    protected async handleGroundModificationChange(
        event: GroundModificationEventParams,
        modify: GroundModificationManager
    ): Promise<void> {}

    /**
     * Creates a new web imagery tile resource
     * @param tiles - The web tiles
     */
    constructor(public tiles: WebTile[], geoBox: GeoBox) {
        super(geoBox);
    }

    /**
     * @inheritdoc
     */
    disposeResources(): void {
        this.tiles.forEach(tile => {
            tile.texture.dispose();
        });
    }

    /**
     * @inheritdoc
     */
    getBytesUsed(): number {
        return this.tiles.reduce(
            (acc, cur) => acc + (cur.texture.image || cur.texture.source)?.data?.byteLength || 0,
            0
        );
    }

    /**
     * Get the tiles value
     */
    get value() {
        return this.tiles;
    }
}

/**
 * Provider for web imagery tiles
 */
export class WebImageryTileProvider extends ResourceProvider<
    WebImageryTileResource,
    ITerrainSource
> {
    /**
     * The web tile data provider
     */
    readonly webTileProvider: WebTileDataProvider;

    /**
     * Cache for storing loaded textures
     */
    private readonly textureCache: LRUCache<string, ImageBitmap>;

    /**
     * Map for tracking pending requests to prevent duplicate loads
     */
    private readonly pendingRequests: Map<string, Promise<THREE.Texture>>;

    /**
     * Creates a new web imagery tile provider
     * @param dataProvider - The web tile data provider
     * @param options - The options for the tile provider
     */
    constructor(dataProvider: WebTileDataProvider, options: WebTileLoaderOptions) {
        super({
            tilingScheme: options.tilingScheme ?? webMercatorTerrainTilingScheme,
            minLevel: dataProvider.minDataLevel,
            maxLevel: dataProvider.maxDataLevel
        });

        this.webTileProvider = dataProvider;
        // Initialize cache with capacity of 100 textures
        this.textureCache = new LRUCache<string, ImageBitmap>(100);
        this.pendingRequests = new Map();
    }

    /**
     * Creates a THREE.Texture from an ImageBitmap
     * @param imageBitmap - The ImageBitmap to create texture from
     * @returns The created texture
     */
    private createTextureFromImageBitmap(imageBitmap: ImageBitmap): THREE.Texture {
        const texture = new THREE.Texture(imageBitmap);
        texture.needsUpdate = true;
        this.configureTexture(texture);
        return texture;
    }

    /**
     * Configures texture parameters
     * @param texture - The texture to configure
     */
    private configureTexture(texture: THREE.Texture) {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.flipY = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    }

    /**
     * Loads texture for a specific tile
     * @param tile - The tile key to load
     * @param noCache - Whether to skip caching
     * @param abortSignal - Optional abort signal to cancel the operation
     * @returns Promise that resolves to the loaded texture
     */
    private async loadTileTexture(
        tile: TileKey,
        noCache?: boolean,
        abortSignal?: AbortSignal
    ): Promise<THREE.Texture> {
        // Generate cache key
        const cacheKey = `${tile.level}-${tile.row}-${tile.column}`;

        // Try to get texture from cache first
        if (!noCache) {
            const cachedImageBitmap = this.textureCache.get(cacheKey);
            if (cachedImageBitmap) {
                return this.createTextureFromImageBitmap(cachedImageBitmap);
            }
        }

        // Check if there's already a pending request for this tile
        if (!noCache && this.pendingRequests.has(cacheKey)) {
            return this.pendingRequests.get(cacheKey)!;
        }

        // Create the loading promise
        const loadPromise = this.executeLoadTileTexture(tile, noCache, abortSignal, cacheKey);
        
        // Store the promise if caching is enabled
        if (!noCache) {
            this.pendingRequests.set(cacheKey, loadPromise);
        }

        try {
            const result = await loadPromise;
            return result;
        } finally {
            // Clean up pending request
            if (!noCache) {
                this.pendingRequests.delete(cacheKey);
            }
        }
    }

    /**
     * Executes the actual texture loading logic
     * @param tile - The tile key to load
     * @param noCache - Whether to skip caching
     * @param abortSignal - Optional abort signal to cancel the operation
     * @param cacheKey - The cache key for the tile
     * @returns Promise that resolves to the loaded texture
     */
    private async executeLoadTileTexture(
        tile: TileKey,
        noCache?: boolean,
        abortSignal?: AbortSignal,
        cacheKey?: string
    ): Promise<THREE.Texture> {
        // Load texture from web tile provider
        const result = await this.webTileProvider.getTexture(
            {
                tileKey: tile
            } as Tile,
            abortSignal
        );

        if (!result || !result[0]) {
            throw new Error("Failed to load web tile texture");
        }

        const texture = result[0]!;
        this.configureTexture(texture);

        // Return directly if caching is disabled
        if (noCache) {
            return texture;
        }

        // Convert texture to ImageBitmap for caching
        const imageBitmap = await textureToImageBitmap(texture);

        // Store in cache
        this.textureCache.set(cacheKey!, imageBitmap);

        // Create and return texture from the cached ImageBitmap
        return this.createTextureFromImageBitmap(imageBitmap);
    }

    /**
     * @inheritdoc
     */
    ready(): boolean {
        return true;
    }

    /**
     * @inheritdoc
     */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<WebImageryTileResource> {
        if (!this.terrainSource!.getTilingScheme().isEqualTilingScheme(this.tilingScheme)) {
            const geoBox = this.terrainSource!.getTilingScheme().getGeoBox(tileKey);
            const tileKeys = this.tilingScheme.getTileKeys(geoBox, tileKey.level);

            const inputs: WebTile[] = [];
            const texturePromises = tileKeys.map(async tileKey => {
                return {
                    tileKey,
                    texture: await this.loadTileTexture(tileKey, false, abortSignal)
                };
            });

            const textures = await Promise.all(texturePromises);

            // Process textures
            await Promise.all(
                textures.map(async textureObj => {
                    const geoBox = this.tilingScheme.getGeoBox(textureObj.tileKey);
                    inputs.push({
                        texture: textureObj.texture,
                        geoBox
                    });
                })
            );

            return new WebImageryTileResource(inputs, geoBox);
        }

        const texture = await this.loadTileTexture(tileKey, true, abortSignal);

        const geoBox = this.tilingScheme.getGeoBox(tileKey);
        (texture as unknown as { geoBox: GeoBox }).geoBox = geoBox;
        return new WebImageryTileResource([{ geoBox, texture }], geoBox);
    }

    /**
     * @inheritdoc
     */
    protected connect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Clears the texture cache
     */
    clearCache(): void {
        this.textureCache.clear();
        this.pendingRequests.clear();
    }

    /**
     * Gets the current cache size
     * @returns The number of items in the cache
     */
    getCacheSize(): number {
        return this.textureCache.size;
    }

    /**
     * Gets the number of pending requests
     * @returns The number of pending requests
     */
    getPendingRequestsCount(): number {
        return this.pendingRequests.size;
    }
}