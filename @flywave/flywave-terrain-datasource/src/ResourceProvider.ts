/* Copyright (C) 2025 flywave.gl contributors */

import {
    type TilingScheme,
    halfQuadTreeSubdivisionScheme,
    TileEncoding,
    TileKey
} from "@flywave/flywave-geoutils";
import { DataProvider } from "@flywave/flywave-mapview-decoder";
import { MathUtils } from "three";

import { type ITerrainSource, type TerrainResourceTile } from "./TerrainSource";
import { type ITileResource, TileInvalidResource, TileValidResource } from "./TileResourceManager";

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

export enum ResourceProviderEvents {
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
export abstract class ResourceProvider<
    T extends ITileResource,
    TTerrainSource extends ITerrainSource = ITerrainSource
>
    extends DataProvider<T>
    implements IResourceProvider {
    /** Unique identifier for this provider instance */
    public readonly uuid = MathUtils.generateUUID();

    /** The tiling scheme used by this provider for coordinate calculations */
    tilingScheme?: TilingScheme;

    /** Number of loading stages for progressive loading */
    protected loadingStages: number;

    /** Minimum tile level supported by this provider */
    public minLevel: number;

    /** Maximum tile level supported by this provider */
    public maxLevel: number;

    /** Reference to the terrain source for resource management */
    protected terrainSource?: TTerrainSource;

    protected get mortonCodeType(): TileEncoding {
        return this.terrainSource.getTilingScheme().subdivisionScheme ===
            halfQuadTreeSubdivisionScheme
            ? TileEncoding.HALF_QUAD_TREE
            : TileEncoding.QUAD_TREE;
    }

    /**
     * Creates a new ResourceProvider instance
     * @param options - Configuration options for the resource provider
     */
    constructor(protected readonly options: ResourceProviderOptions) {
        super();
        this.tilingScheme = options.tilingScheme;
        this.minLevel = options.minLevel ?? 0;
        this.maxLevel = options.maxLevel ?? 22;
    }

    /**
     * Registers the terrain source client with this provider
     * @param client - The terrain source client to register
     * @returns Promise that resolves when registration is complete
     */
    public override register(client: TTerrainSource): Promise<void> {
        this.terrainSource = client;
        return super.register(client);
    }

    /**
     * Checks if a resource for the given tile key is already cached
     * @param tileKey - The tile key to check
     * @returns True if the resource is cached, false otherwise
     */
    public hasResource(tileKey: TileKey): boolean {
        return this.terrainSource!.isTileResourceCached(tileKey, this.getResourceKey());
    }

    /**
     * Loads resources progressively through all applicable stages up to the target level
     * This ensures that lower resolution data is loaded first, then progressively higher resolution
     *
     * @param tileKey - The target tile key to load resources for
     * @param terrainTile - The terrain tile that will receive the loaded resources
     * @param abortSignal - Abort signal for cancellation support
     * @returns Promise that resolves when all progressive loading is complete
     */
    public async loadProgressiveTileResources(
        terrainTile: TerrainResourceTile,
        abortSignal: AbortSignal
    ): Promise<void> {
        const tileKey = terrainTile.tileKey;
        const cacheTile = this.terrainSource!.getCachedTile(tileKey);
        if (cacheTile) {
            const resource = cacheTile.resourceManager.getResource<T>(this.getResourceKey());
            if (resource !== undefined) {
                return;
            }
        } 

        // Execute the resource loading
        const loadResult = this.loadResourcesAtLevel(tileKey,  Math.max(Math.min(tileKey.level, this.maxLevel), this.minLevel), abortSignal);

        // If loading returned true, it means loading is complete
        if (loadResult === true) {
            return;
        }
    }

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
    public loadResourcesAtLevel(
        tileKey: TileKey,
        level: number,
        abortSignal: AbortSignal
    ): Promise<{ value: T; memoryUsed: number }> | boolean {
        const levelOffset = tileKey.level - level;
        const parentKey = TileKey.fromRowColumnLevel(
            tileKey.row >> levelOffset,
            tileKey.column >> levelOffset,
            level
        );

        // Get or create the parent terrain tile
        let parentTerrainParent = this.terrainSource!.getCachedTile(parentKey);
        if (!parentTerrainParent) {
            parentTerrainParent = this.terrainSource!.getTile(parentKey, true);
        }

        const resourceKey = this.getResourceKey();

        // Check if resource is already available or loading
        if (
            !parentTerrainParent.resourceManager.hasResource(resourceKey) &&
            !parentTerrainParent.resourceManager.hasLoadingResource(resourceKey) &&
            !parentTerrainParent.resourceManager.getResource(resourceKey)
        ) {
            // Enqueue the loading task
            const promise = this.terrainSource!.enqueueTileLoadingTask(
                parentTerrainParent,
                parentTile => {
                    return this.getTile(parentKey, abortSignal)
                        .then((resource: ITileResource) => {
                            if (resource && resource instanceof TileValidResource) {
                                // Connect the resource to the parent tile
                                resource.connectToDataSource(this.terrainSource!, parentKey);
                                parentTile.resourceManager.setResource(resourceKey, resource);

                                // Update memory usage and overlays
                                this.terrainSource!.updateMemoryUsage(parentTile);
                                this.terrainSource!.updateTileOverlays();

                                this.dispatchEvent({
                                    type: ResourceProviderEvents.onResourceLoaded,
                                    tileKey: parentKey,
                                    resourceKey,
                                    resource
                                });

                                return {
                                    value: resource,
                                    memoryUsed: resource.getBytesUsed()
                                };
                            }
                        })
                        .catch(e => {
                            const errorMessage = e instanceof Error ? e.message : String(e);
                            this.dispatchEvent({
                                type: ResourceProviderEvents.onResourceError,
                                tileKey: parentKey,
                                resourceKey,
                                resource: new TileInvalidResource(errorMessage)
                            });
                            parentTile.resourceManager.setResource(
                                resourceKey,
                                new TileInvalidResource(errorMessage)
                            );
                        });
                },
                abortSignal
            );

            if (!promise) {
                return false;
            }

            // Track the loading resource
            parentTerrainParent.resourceManager.addLoadingResource(
                resourceKey,
                parentKey,
                promise as Promise<ITileResource>
            );

            // Handle promise completion and cleanup
            return promise
                .catch(_error => {
                    // No specific error handling needed, just continue
                    return Promise.resolve();
                })
                .finally(() => {
                    parentTerrainParent!.resourceManager.removeLoadingResource(resourceKey);
                });
        }

        // Return loading status
        return parentTerrainParent.resourceManager.hasLoadingResource(resourceKey);
    }

    /**
     * Gets a precise resource for the exact tile key if available
     *
     * @param tileKey - The tile key to get resource for
     * @returns The resource if available, undefined otherwise
     */
    public getPreciseResource(tileKey: TileKey): T | undefined {
        const cacheTile = this.terrainSource!.getCachedTile(tileKey);
        if (cacheTile) {
            return cacheTile.resourceManager.getResource<T>(this.getResourceKey());
        }
        return undefined;
    }

    /**
     * Gets the best available resource for a tile by searching parent levels
     * This implements a fallback strategy where lower resolution data is used
     * when higher resolution data is not yet available
     *
     * @param tileKey - The target tile key
     * @returns Object containing the best available tile key and resource, or undefined
     */
    public getBestAvailableResourceTile(
        tileKey: TileKey,
        keepCached: boolean = true
    ): { tileKey: TileKey; resource: T } | undefined {
        // Check if requested level is below minimum supported level
        if (tileKey.level < this.minLevel) {
            return undefined;
        }

        if (!this.tilingScheme) {
            throw new Error("Tiling scheme is required for resource retrieval");
        }

        // Search upward from target level to find best available resource
        for (let level = tileKey.level; level >= this.minLevel; level--) {
            const levelOffset = tileKey.level - level;
            const parentKey = TileKey.fromRowColumnLevel(
                tileKey.row >> levelOffset,
                tileKey.column >> levelOffset,
                level
            );

            const cacheTile = this.terrainSource!.getCachedTile(parentKey, keepCached);
            if (!cacheTile) {
                continue;
            }

            const resourceKey = this.getResourceKey();
            const resource = cacheTile.resourceManager.getResource<T>(resourceKey);

            if (resource !== undefined) {
                return { tileKey: parentKey, resource };
            }
        }

        return undefined;
    }

    /**
     * Updates the stage configuration for progressive loading
     *
     * @param loadingStages - New number of loading stages
     * @param minLevel - New minimum level (optional)
     * @param maxLevel - New maximum level (optional)
     */
    public updateConfig( minLevel?: number, maxLevel?: number): void {
        this.minLevel = minLevel ?? this.minLevel;
        this.maxLevel = maxLevel ?? this.maxLevel;
    }
    /**
     * Gets the unique resource key for this provider instance
     * Used for resource identification and caching
     *
     * @returns The unique resource key
     */
    public getResourceKey(): string {
        return this.uuid;
    }

    /**
     * Sets the tiling scheme for this provider
     *
     * @param tilingScheme - The tiling scheme to use
     */
    public setTilingScheme(tilingScheme: TilingScheme): void {
        this.tilingScheme = tilingScheme;
    }

    /**
     * Disposes the provider and cleans up all resources
     * Removes cached resources and marks dependent tiles as dirty
     */
    protected dispose(): void {
        this.terrainSource!.unCacheResource(this.getResourceKey());
        this.terrainSource!.mapView.markTilesDirty(this.terrainSource!);
    }
}
