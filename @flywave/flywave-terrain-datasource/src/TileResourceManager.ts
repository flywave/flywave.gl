/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox, type TileKey } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { assert } from "@flywave/flywave-utils";
import { type ExtendedFrustum } from "@flywave/flywave-utils/ExtendedFrustum";
import { type RemoveCallback, LRUCache } from "@flywave/flywave-utils/LRUCache";

import {
    type GroundModificationEventParams,
    type GroundModificationManager
} from "./ground-modification-manager";
import { type ITerrainSource, type TerrainResourceTile } from "./TerrainSource";

/**
 * Type alias for string representation of TileKey
 */
type TileKeyString = number;

/**
 * LRU Cache specialized for terrain tiles with Morton code indexing
 *
 * @template TileType - Type of tile extending TerrainResourceTile
 */
export class TileLRUCache<TileType extends TerrainResourceTile> extends LRUCache<TileType> {
    /** Internal map for quick tile lookup by TileKey */
    private readonly _tileMap = new Map<TileKeyString, TileType>();

    constructor(protected terrainSource: ITerrainSource) {
        super();
    }

    private get mortonTileEncoding() {
        return this.terrainSource.getTilingScheme().mortonTileEncoding;
    }

    /**
     * Adds a tile to the cache
     *
     * @param item - The tile to add
     * @param removeCb - Callback function to call when the tile is removed
     * @returns True if the tile was successfully added
     */
    add(item: TileType, removeCb: RemoveCallback<TileType>): boolean {
        if (
            super.add(item, item => {
                removeCb(item);
                this._tileMap.delete(item.tileKey.mortonCode(this.mortonTileEncoding));
            })
        ) {
            this._tileMap.set(item.tileKey.mortonCode(this.mortonTileEncoding), item);
            return true;
        }
        return false;
    }

    /**
     * Removes a tile from the cache
     *
     * @param item - The tile to remove
     * @returns True if the tile was successfully removed
     */
    remove(item: TileType): boolean {
        if (super.remove(item)) {
            this._tileMap.delete(item.tileKey.mortonCode(this.mortonTileEncoding));
            return true;
        }
        return false;
    }

    /**
     * Removes tile by its TileKey
     *
     * @param tileKey - The key of the tile to remove
     * @returns True if tile was found and removed
     */
    removeByTileKey(tileKey: TileKey): boolean {
        const tile = this._tileMap.get(tileKey.mortonCode(this.mortonTileEncoding));
        return tile ? this.remove(tile) : false;
    }

    /**
     * Removes resources from all tiles by resource key
     *
     * @param resourceKey - The key of the resource to remove
     */
    removeResource(resourceKey: string): void {
        this._tileMap.forEach(tile => {
            tile.removeTileResource(resourceKey);
        });
    }

    /**
     * Checks if cache contains a tile with given TileKey
     *
     * @param tileKey - The key to check
     * @returns True if the tile exists in the cache
     */
    hasTile(tileKey: TileKey): boolean {
        return this._tileMap.has(tileKey.mortonCode(this.mortonTileEncoding));
    }

    /**
     * Gets tile by its TileKey
     *
     * @param tileKey - The key of the tile to retrieve
     * @returns The tile if found, undefined otherwise
     */
    getTile(tileKey: TileKey): TileType | undefined {
        return this._tileMap.get(tileKey.mortonCode(this.mortonTileEncoding));
    }

    /**
     * Schedules update for all tiles visibility state
     *
     * @param mapView - The MapView instance
     * @param frustum - The frustum for visibility testing (optional)
     */
    scheduleUpdateTile(mapView: MapView, frustum?: ExtendedFrustum): void {
        this.markAllUnused();
        this._tileMap.forEach(tile => {
            tile.updateVisibilityState(mapView, frustum);
        //     tile._isUsed = false;
        });
    }

    /**
     * Schedules unloading of unused tiles and updates tile usage
     */
    scheduleUnloadAndUpdateTile(): void {
        this._tileMap.forEach(tile => {
            if (tile.isVisible) this.markUsed(tile);
        });
        super.scheduleUnload();
    }

    /**
     * Removes all tiles from the cache
     */
    removeAllTiles(): void {
        this._tileMap.forEach(tile => {
            this.removeByTileKey(tile.tileKey);
        });
    }
}

/**
 * Abstract base class representing a tile resource
 */
export abstract class ITileResource {
    /**
     * Disposes of the resource and releases any allocated resources
     */
    abstract dispose(): void;

    /**
     * Gets the memory usage of the resource in bytes
     *
     * @returns Number of bytes used by the resource
     */
    abstract getBytesUsed(): number;

    /**
     * Checks if the resource is valid
     *
     * @returns True if the resource is valid
     */
    abstract isValid(): boolean;
}

/**
 * Abstract class representing a valid tile resource
 */
export abstract class TileValidResource extends ITileResource {
    /** Reference to the terrain data source */
    protected terrainSource?: ITerrainSource;

    /** The tile key associated with this resource */
    protected tileKey?: TileKey;

    /** Flag indicating if ground modification is used */
    private _isUsedGroundModification = false;

    /** Flag indicating if ground modification change is being processed */
    private _isProcessingGroundModification = false;

    /** Stores the latest pending ground modification event */
    private _latestPendingEvent: GroundModificationEventParams | null = null;

    /**
     * Creates a new TileValidResource instance
     *
     * @param geoBox - The geographic bounding box of the tile
     */
    constructor(public geoBox: GeoBox) {
        assert(!!geoBox, "GeoBox cannot be null");
        super();
    }

    /**
     * Connects the resource to a data source
     *
     * @param dataSource - The terrain data source
     * @param tileKey - The tile key
     */
    connectToDataSource(dataSource: ITerrainSource, tileKey: TileKey): void {
        this.terrainSource = dataSource;
        this.tileKey = tileKey;

        this.terrainSource
            ?.getGroundModificationManager()
            ?.addEventListener("change", this.onGroundModificationChanged);

        this.onConnectedToDataSource();
    }

    protected onConnectedToDataSource(): void { }

    /**
     * Checks if the resource is valid (always true for TileValidResource)
     *
     * @returns Always returns true
     */
    isValid(): boolean {
        return true;
    }

    /**
     * Handles ground modification changes
     *
     * @param event - The ground modification event parameters
     * @param modify - The ground modification manager
     * @returns Promise that resolves when handling is complete
     */
    protected handleGroundModificationChange(
        event: GroundModificationEventParams,
        modify: GroundModificationManager
    ): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Resets ground modification changes
     */
    protected resetGroundModificationChange(): void { }

    /**
     * Disposes of the resource and releases any allocated resources
     */
    dispose(): void {
        this.terrainSource
            ?.getGroundModificationManager()
            ?.removeEventListener("change", this.onGroundModificationChanged);

        this.disposeResources();
    }

    /**
     * Abstract method to dispose of concrete resource implementations
     */
    protected abstract disposeResources(): void;

    /**
     * Callback for ground modification changes
     *
     * @param event - The ground modification event parameters
     */
    private onGroundModificationChanged = async (event: GroundModificationEventParams): Promise<void> => {
        // If we're already processing an event, just store this one as the latest and return
        if (this._isProcessingGroundModification) {
            this._latestPendingEvent = event;
            return;
        }

        // Mark that we're now processing an event
        this._isProcessingGroundModification = true;

        try {
            // Process the current event
            await this.processGroundModificationEvent(event);

            // If there's a pending event, process it instead of the original
            if (this._latestPendingEvent !== null) {
                const latestEvent = this._latestPendingEvent;
                this._latestPendingEvent = null;
                await this.processGroundModificationEvent(latestEvent);
            }
        } finally {
            // Mark that we're done processing
            this._isProcessingGroundModification = false;
        }
    }

    /**
     * Processes a ground modification event
     *
     * @param event - The ground modification event parameters
     */
    private async processGroundModificationEvent(
        event: GroundModificationEventParams
    ): Promise<void> {
        if (
            !(event.affectedBounds || event.previousBounds) ||
            (event.affectedBounds || event.previousBounds).intersectsBox(this.geoBox)
        ) {
            this._isUsedGroundModification = true;
            await this.handleGroundModificationChange(
                event,
                this.terrainSource.getGroundModificationManager()
            );
            this.terrainSource.updateTileOverlays();
        } else {
            if (this._isUsedGroundModification) {
                this.resetGroundModificationChange();
                this.terrainSource.updateTileOverlays();
            }
        }
    }
}

/**
 * Class representing an invalid tile resource
 */
export class TileInvalidResource extends ITileResource {
    /**
     * Creates a new TileInvalidResource instance
     *
     * @param _reason - The reason why the resource is invalid
     */
    constructor(private readonly _reason: string) {
        super();
    }

    /**
     * Gets the reason why the resource is invalid
     */
    get reason(): string {
        return this._reason;
    }

    /**
     * Disposes of the resource (no-op for invalid resources)
     */
    dispose(): void { }

    /**
     * Gets the memory usage of the resource (always 0 for invalid resources)
     *
     * @returns Always returns 0
     */
    getBytesUsed(): number {
        return 0;
    }

    /**
     * Checks if the resource is valid (always false for invalid resources)
     *
     * @returns Always returns false
     */
    isValid(): boolean {
        return false;
    }
}

/**
 * Manages resources associated with tiles
 */
export class TileResourceManager {
    /** Map of loaded resources */
    private _resources: Record<string, ITileResource> = {};

    /** Map of resources currently being loaded */
    private loadingResources: Record<string, Promise<ITileResource>> = {};

    /**
     * Adds a loading resource promise
     *
     * @param resourceKey - The key of the resource
     * @param tileKey - The key of the tile
     * @param promise - The promise that will resolve to the resource
     */
    addLoadingResource(
        resourceKey: string,
        tileKey: TileKey,
        promise: Promise<ITileResource>
    ): void {
        this.loadingResources[resourceKey] = promise;
    }

    /**
     * Removes a loading resource
     *
     * @param resourceKey - The key of the resource to remove
     */
    removeLoadingResource(resourceKey: string): void {
        if (this.loadingResources[resourceKey]) {
            delete this.loadingResources[resourceKey];
        }
    }

    /**
     * Checks if a resource is currently loading
     *
     * @param resourceKey - The key of the resource to check
     * @returns True if the resource is loading
     */
    hasLoadingResource(resourceKey: string): boolean {
        return this.loadingResources[resourceKey] !== undefined;
    }

    /**
     * Checks if a resource exists and is valid
     *
     * @param resourceKey - The key of the resource to check
     * @returns True if the resource exists and is valid
     */
    hasResource(resourceKey: string): boolean {
        return this._resources[resourceKey] !== undefined;
    }

    /**
     * Gets a resource by its key
     *
     * @template T - Type of the resource extending ITileResource
     * @param resourceKey - The key of the resource
     * @returns The resource if found and valid, undefined otherwise
     */
    getResource<T extends ITileResource>(resourceKey: string): T | undefined {
        return this._resources[resourceKey]?.isValid()
            ? (this._resources[resourceKey] as T)
            : undefined;
    }

    /**
     * Gets the total memory used by all resources
     *
     * @returns Total bytes used by all resources
     */
    getMemoryUsed(): number {
        return Object.values(this._resources).reduce(
            (total, resource) => total + resource.getBytesUsed(),
            0
        );
    }

    /**
     * Sets a resource
     *
     * @param resourceKey - The key of the resource
     * @param resource - The resource value
     */
    setResource(resourceKey: string, resource: ITileResource): void {
        this._resources[resourceKey] = resource;
    }

    /**
     * Removes a resource by its key
     *
     * @param resourceKey - The key of the resource to remove
     */
    removeResource(resourceKey: string): void {
        this._resources[resourceKey]?.dispose();
        delete this._resources[resourceKey];
    }

    /**
     * Disposes all resources and clears the manager
     */
    dispose(): void {
        Object.values(this._resources).forEach(resourceMap => {
            resourceMap?.dispose();
        });
        this._resources = {};
    }
}
