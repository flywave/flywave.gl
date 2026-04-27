import { type TilingScheme, TileEncoding, TileKey } from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { type ITerrainSource, type TerrainResourceTile } from "./TerrainSource";
import { type ITileResource } from "./TileResourceManager";
/**
 * Configuration options for ResourceProvider
 * @interface ResourceProviderOptions
 */
export interface ResourceProviderOptions {
    /**
     * The tiling scheme used for tile loading and coordinate transformations
     */
    tilingScheme?: TilingScheme;
    /**
     * Minimum tile level that can be loaded by this provider
     * @default 0
     */
    minLevel?: number;
    /**
     * Maximum tile level that can be loaded by this provider
     * @default 22
     */
    maxLevel?: number;
}
/**
 * Represents a loading stage with its level range for progressive loading
 * @interface LoadingStage
 */
export interface LoadingStage {
    /** Minimum level for this stage */
    minLevel: number;
    /** Maximum level for this stage */
    maxLevel: number;
    /** Stage number (lower number means higher priority) */
    stage: number;
    isLast: boolean;
}
export interface IResourceProvider {
    hasResource(tileKey: TileKey): boolean;
}
export declare enum ResourceProviderEvents {
    onResourceLoaded = "onResourceLoaded",
    onResourceError = "onResourceError"
}
export type ResourceProviderEventMap = {
    [K in ResourceProviderEvents]: {
        tileKey: TileKey;
        resourceKey: string;
        resource: ITileResource;
    };
};
/**
 * Abstract base class for progressive tile resource loading with multi-stage support
 *
 * This provider implements a progressive loading strategy where resources are loaded
 * in stages from lower to higher resolution levels. This ensures that users get
 * progressively better quality data as it becomes available.
 *
 * @template T - Type of resource being loaded (e.g., textures, terrain data)
 * @template TileType - Type extending TerrainResourceTile for specific tile implementations
 * @template TTerrainSource - Type extending TerrainSource for terrain data management
 * @abstract
 */
export declare abstract class ResourceProvider<T extends ITileResource, TTerrainSource extends ITerrainSource = ITerrainSource> extends DataProvider<T> implements IResourceProvider {
    protected readonly options: ResourceProviderOptions;
    /** Unique identifier for this provider instance */
    readonly uuid: string;
    /** The tiling scheme used by this provider for coordinate calculations */
    tilingScheme?: TilingScheme;
    /** Number of loading stages for progressive loading */
    protected loadingStages: number;
    /** Minimum tile level supported by this provider */
    minLevel: number;
    /** Maximum tile level supported by this provider */
    maxLevel: number;
    /** Reference to the terrain source for resource management */
    protected terrainSource?: TTerrainSource;
    protected get mortonCodeType(): TileEncoding;
    /**
     * Creates a new ResourceProvider instance
     * @param options - Configuration options for the resource provider
     */
    constructor(options: ResourceProviderOptions);
    /**
     * Registers the terrain source client with this provider
     * @param client - The terrain source client to register
     * @returns Promise that resolves when registration is complete
     */
    register(client: TTerrainSource): Promise<void>;
    /**
     * Checks if a resource for the given tile key is already cached
     * @param tileKey - The tile key to check
     * @returns True if the resource is cached, false otherwise
     */
    hasResource(tileKey: TileKey): boolean;
    /**
     * Loads resources progressively through all applicable stages up to the target level
     * This ensures that lower resolution data is loaded first, then progressively higher resolution
     *
     * @param tileKey - The target tile key to load resources for
     * @param terrainTile - The terrain tile that will receive the loaded resources
     * @param abortSignal - Abort signal for cancellation support
     * @returns Promise that resolves when all progressive loading is complete
     */
    loadProgressiveTileResources(terrainTile: TerrainResourceTile, abortSignal: AbortSignal): Promise<void>;
    /**
     * Loads resources at a specific level for a tile key
     * Manages the loading queue and resource caching
     *
     * @param tileKey - The target tile key
     * @param ownerTerrainTileKey - The owner terrain tile key
     * @param level - The specific level to load resources for
     * @param abortSignal - Abort signal for cancellation support
     * @returns Promise with loaded resource info, boolean status, or false if already loading
     */
    loadResourcesAtLevel(tileKey: TileKey, level: number, abortSignal: AbortSignal): Promise<{
        value: T;
        memoryUsed: number;
    }> | boolean;
    /**
     * Gets a precise resource for the exact tile key if available
     *
     * @param tileKey - The tile key to get resource for
     * @returns The resource if available, undefined otherwise
     */
    getPreciseResource(tileKey: TileKey): T | undefined;
    /**
     * Gets the best available resource for a tile by searching parent levels
     * This implements a fallback strategy where lower resolution data is used
     * when higher resolution data is not yet available
     *
     * @param tileKey - The target tile key
     * @returns Object containing the best available tile key and resource, or undefined
     */
    getBestAvailableResourceTile(tileKey: TileKey, keepCached?: boolean): {
        tileKey: TileKey;
        resource: T;
    } | undefined;
    /**
     * Updates the stage configuration for progressive loading
     *
     * @param loadingStages - New number of loading stages
     * @param minLevel - New minimum level (optional)
     * @param maxLevel - New maximum level (optional)
     */
    updateConfig(minLevel?: number, maxLevel?: number): void;
    /**
     * Gets the unique resource key for this provider instance
     * Used for resource identification and caching
     *
     * @returns The unique resource key
     */
    getResourceKey(): string;
    /**
     * Sets the tiling scheme for this provider
     *
     * @param tilingScheme - The tiling scheme to use
     */
    setTilingScheme(tilingScheme: TilingScheme): void;
    /**
     * Disposes the provider and cleans up all resources
     * Removes cached resources and marks dependent tiles as dirty
     */
    protected dispose(): void;
}
