import { type GeoBox, type TileKey } from "@flywave/flywave-geoutils";
import { type MapView } from "@flywave/flywave-mapview";
import { type ExtendedFrustum } from "@flywave/flywave-utils/ExtendedFrustum";
import { type RemoveCallback, LRUCache } from "@flywave/flywave-utils/LRUCache";
import { type GroundModificationEventParams, type GroundModificationManager } from "./ground-modification-manager";
import { type ITerrainSource, type TerrainResourceTile } from "./TerrainSource";
/**
 * LRU Cache specialized for terrain tiles with Morton code indexing
 *
 * @template TileType - Type of tile extending TerrainResourceTile
 */
export declare class TileLRUCache<TileType extends TerrainResourceTile> extends LRUCache<TileType> {
    protected terrainSource: ITerrainSource;
    /** Internal map for quick tile lookup by TileKey */
    private readonly _tileMap;
    constructor(terrainSource: ITerrainSource);
    private get mortonTileEncoding();
    /**
     * Adds a tile to the cache
     *
     * @param item - The tile to add
     * @param removeCb - Callback function to call when the tile is removed
     * @returns True if the tile was successfully added
     */
    add(item: TileType, removeCb: RemoveCallback<TileType>): boolean;
    /**
     * Removes a tile from the cache
     *
     * @param item - The tile to remove
     * @returns True if the tile was successfully removed
     */
    remove(item: TileType): boolean;
    /**
     * Removes tile by its TileKey
     *
     * @param tileKey - The key of the tile to remove
     * @returns True if tile was found and removed
     */
    removeByTileKey(tileKey: TileKey): boolean;
    /**
     * Removes resources from all tiles by resource key
     *
     * @param resourceKey - The key of the resource to remove
     */
    removeResource(resourceKey: string): void;
    /**
     * Checks if cache contains a tile with given TileKey
     *
     * @param tileKey - The key to check
     * @returns True if the tile exists in the cache
     */
    hasTile(tileKey: TileKey): boolean;
    /**
     * Gets tile by its TileKey
     *
     * @param tileKey - The key of the tile to retrieve
     * @returns The tile if found, undefined otherwise
     */
    getTile(tileKey: TileKey): TileType | undefined;
    /**
     * Schedules update for all tiles visibility state
     *
     * @param mapView - The MapView instance
     * @param frustum - The frustum for visibility testing (optional)
     */
    scheduleUpdateTile(mapView: MapView, frustum?: ExtendedFrustum): void;
    /**
     * Schedules unloading of unused tiles and updates tile usage
     */
    scheduleUnloadAndUpdateTile(): void;
    /**
     * Removes all tiles from the cache
     */
    removeAllTiles(): void;
}
/**
 * Abstract base class representing a tile resource
 */
export declare abstract class ITileResource {
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
export declare abstract class TileValidResource extends ITileResource {
    geoBox: GeoBox;
    /** Reference to the terrain data source */
    protected terrainSource?: ITerrainSource;
    /** The tile key associated with this resource */
    protected tileKey?: TileKey;
    /** Flag indicating if ground modification is used */
    private _isUsedGroundModification;
    /** Flag indicating if ground modification change is being processed */
    private _isProcessingGroundModification;
    /** Stores the latest pending ground modification event */
    private _latestPendingEvent;
    /**
     * Creates a new TileValidResource instance
     *
     * @param geoBox - The geographic bounding box of the tile
     */
    constructor(geoBox: GeoBox);
    /**
     * Connects the resource to a data source
     *
     * @param dataSource - The terrain data source
     * @param tileKey - The tile key
     */
    connectToDataSource(dataSource: ITerrainSource, tileKey: TileKey): void;
    protected onConnectedToDataSource(): void;
    /**
     * Checks if the resource is valid (always true for TileValidResource)
     *
     * @returns Always returns true
     */
    isValid(): boolean;
    /**
     * Handles ground modification changes
     *
     * @param event - The ground modification event parameters
     * @param modify - The ground modification manager
     * @returns Promise that resolves when handling is complete
     */
    protected handleGroundModificationChange(event: GroundModificationEventParams, modify: GroundModificationManager): Promise<void>;
    /**
     * Resets ground modification changes
     */
    protected resetGroundModificationChange(): void;
    /**
     * Disposes of the resource and releases any allocated resources
     */
    dispose(): void;
    /**
     * Abstract method to dispose of concrete resource implementations
     */
    protected abstract disposeResources(): void;
    /**
     * Callback for ground modification changes
     *
     * @param event - The ground modification event parameters
     */
    private onGroundModificationChanged;
    /**
     * Processes a ground modification event
     *
     * @param event - The ground modification event parameters
     */
    private processGroundModificationEvent;
}
/**
 * Class representing an invalid tile resource
 */
export declare class TileInvalidResource extends ITileResource {
    private readonly _reason;
    /**
     * Creates a new TileInvalidResource instance
     *
     * @param _reason - The reason why the resource is invalid
     */
    constructor(_reason: string);
    /**
     * Gets the reason why the resource is invalid
     */
    get reason(): string;
    /**
     * Disposes of the resource (no-op for invalid resources)
     */
    dispose(): void;
    /**
     * Gets the memory usage of the resource (always 0 for invalid resources)
     *
     * @returns Always returns 0
     */
    getBytesUsed(): number;
    /**
     * Checks if the resource is valid (always false for invalid resources)
     *
     * @returns Always returns false
     */
    isValid(): boolean;
}
/**
 * Manages resources associated with tiles
 */
export declare class TileResourceManager {
    /** Map of loaded resources */
    private _resources;
    /** Map of resources currently being loaded */
    private loadingResources;
    /**
     * Adds a loading resource promise
     *
     * @param resourceKey - The key of the resource
     * @param tileKey - The key of the tile
     * @param promise - The promise that will resolve to the resource
     */
    addLoadingResource(resourceKey: string, tileKey: TileKey, promise: Promise<ITileResource>): void;
    /**
     * Removes a loading resource
     *
     * @param resourceKey - The key of the resource to remove
     */
    removeLoadingResource(resourceKey: string): void;
    /**
     * Checks if a resource is currently loading
     *
     * @param resourceKey - The key of the resource to check
     * @returns True if the resource is loading
     */
    hasLoadingResource(resourceKey: string): boolean;
    /**
     * Checks if a resource exists and is valid
     *
     * @param resourceKey - The key of the resource to check
     * @returns True if the resource exists and is valid
     */
    hasResource(resourceKey: string): boolean;
    /**
     * Gets a resource by its key
     *
     * @template T - Type of the resource extending ITileResource
     * @param resourceKey - The key of the resource
     * @returns The resource if found and valid, undefined otherwise
     */
    getResource<T extends ITileResource>(resourceKey: string): T | undefined;
    /**
     * Gets the total memory used by all resources
     *
     * @returns Total bytes used by all resources
     */
    getMemoryUsed(): number;
    /**
     * Sets a resource
     *
     * @param resourceKey - The key of the resource
     * @param resource - The resource value
     */
    setResource(resourceKey: string, resource: ITileResource): void;
    /**
     * Removes a resource by its key
     *
     * @param resourceKey - The key of the resource to remove
     */
    removeResource(resourceKey: string): void;
    /**
     * Disposes all resources and clears the manager
     */
    dispose(): void;
}
