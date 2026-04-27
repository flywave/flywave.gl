import { type FlatTheme, type Theme } from "@flywave/flywave-datasource-protocol";
import { type GeoBox, type TileAvailability, TileKey, TilingScheme } from "@flywave/flywave-geoutils";
import { DataSource, type ElevationProvider, ElevationRange, type ElevationRangeSource, type MapView, TerrainDataSource, Tile } from "@flywave/flywave-mapview";
import { type DataProvider, type TileDataSourceOptions, type TileFactory, TileDataSource } from "@flywave/flywave-mapview-decoder";
import { ExtendedFrustum } from "@flywave/flywave-utils/ExtendedFrustum";
import { type WebTileDataProvider } from "@flywave/flywave-webtile-datasource";
import { Object3D } from "three";
import { ExclusionManager } from "./ExclusionManager";
import { GroundModificationManager } from "./ground-modification-manager";
import { type GroundOverlayProviderOptions, GroundOverlayProvider } from "./ground-overlay-provider";
import { type IResourceProvider } from "./ResourceProvider";
import { ProjectionSwitchController, type ProjectionSwitchOptions } from "./ProjectionSwitchController";
import { TileResourceManager } from "./TileResourceManager";
import { type WebTileLoaderOptions, WebImageryTileProvider } from "./WebImageryTileProvider";
import { TileGeometryBuilder } from "@flywave/flywave-geometry";
/**
 * Configuration options for TerrainSource
 */
export interface TerrainSourceOptions<DataProviderType extends DataProvider = DataProvider> extends Omit<TileDataSourceOptions, "tilingScheme" | "dataProvider"> {
    /** The tiling scheme to use (optional) */
    tilingScheme?: TilingScheme;
    /** Maximum number of concurrent jobs */
    maxJobs?: number;
    /** The data provider to use for downloading data (optional) */
    dataProvider?: DataProviderType;
    /** The ground overlay provider to use for loading ground overlays */
    groundOverlayOptions?: GroundOverlayProviderOptions;
    /** Options for projection switching animation */
    projectionSwitchOptions?: ProjectionSwitchOptions;
    /**
     * Number of progressive loading stages to split the loading process
     * Higher stages load higher resolution data progressively
     * @default 0
     */
    loadingStages?: number;
    /** Whether to debug tile boxes */
    showDebugInfo?: boolean;
}
/**
 * Interface for terrain data sources that manage terrain tiles and resources
 */
export interface ITerrainSource<ProviderType extends DataProvider = DataProvider> extends TileDataSource<TerrainResourceTile, ProviderType> {
    /** Checks if a specific tile resource is cached */
    isTileResourceCached(tileKey: TileKey, resourceKey: string): boolean;
    /** Retrieves a cached tile if available */
    getCachedTile(tileKey: TileKey, keepCached?: boolean): TerrainResourceTile | undefined;
    /** Adds a tile to the cache */
    cacheTile(tile: TerrainResourceTile): boolean;
    /** Enqueues a task for loading tile data asynchronously */
    enqueueTileLoadingTask(tile: TerrainResourceTile, task: (tile: TerrainResourceTile) => Promise<any>, abortSignal?: AbortSignal): Promise<any> | false;
    /** Updates the memory usage statistics for a tile */
    updateMemoryUsage(tile: TerrainResourceTile): any;
    /** Updates the overlays for a specific tile or all tiles */
    updateTileOverlays(geoBox?: GeoBox): void;
    /** Removes a specific resource from the cache */
    unCacheResource(resourceKey: string): any;
    /** Gets all web tile data sources used by this terrain source */
    getWebTileDataSources(): WebImageryTileProvider[];
    /** Gets the ground modification manager */
    getGroundOverlayProvider(): GroundOverlayProvider;
    getGroundModificationManager(): GroundModificationManager;
    getElevationProvider(): ElevationProvider;
    get showDebugInfo(): boolean;
    get debugObject(): Object3D;
}
/**
 * Base class for terrain resource tiles with additional state tracking
 */
export declare class TerrainResourceTile extends Tile {
    _lastFrameVisited: number;
    _isInFrustum: boolean;
    _isUsed: boolean;
    _distanceFromCamera: number;
    private readonly _resourceManager;
    get resourceManager(): TileResourceManager;
    /**
     * Remove web tile textures from a specific source
     * @param resourceKey - The resource identifier to remove
     */
    removeTileResource(resourceKey: string): void;
    /**
     * Update the tile's visibility state
     * @param mapView - The current map view
     * @param frustum - The view frustum (optional)
     */
    updateVisibilityState(mapView: MapView, frustum?: ExtendedFrustum): void;
    /**
     * Marks the tile as being used in the current frame
     * @param mapView - The current map view
     */
    markUsedTile(mapView: MapView): void;
    /**
     * Disposes of the tile resources
     * @param fromLru - Whether the disposal is from LRU cache eviction
     */
    dispose(fromLru?: boolean): void;
}
export declare class ShadowTerrainResourceTile extends TerrainResourceTile {
    private resTile;
    constructor(dataSource: DataSource, tileKey: TileKey, resTile: TerrainResourceTile);
    get resourceManager(): TileResourceManager;
    removeTileResource(resourceKey: string): void;
    updateVisibilityState(mapView: MapView, frustum?: ExtendedFrustum): void;
    markUsedTile(mapView: MapView): void;
    private m_orientedBoxHelper?;
    set elevationRange(elevationRange: ElevationRange);
    dispose(): void;
}
export interface LoadingStage {
    /** Minimum level for this stage */
    minLevel: number;
    /** Maximum level for this stage */
    maxLevel: number;
    /** Stage number (lower number means higher priority) */
    stage: number;
    isLast: boolean;
}
/**
 * Abstract base class for terrain data sources
 */
export declare abstract class TerrainSource<DataProviderType extends DataProvider & IResourceProvider, TileType extends TerrainResourceTile = TerrainResourceTile> extends TileDataSource<TileType, DataProviderType> implements ITerrainSource<DataProviderType>, TerrainDataSource {
    protected options: TerrainSourceOptions<DataProviderType>;
    protected readonly m_elevationRangeSource?: ElevationRangeSource;
    protected readonly m_elevationProvider?: ElevationProvider;
    protected m_materialProviders: WebImageryTileProvider[];
    protected m_exclusionManager: ExclusionManager;
    protected m_projectionSwitchController?: ProjectionSwitchController;
    private readonly m_viewFrustum;
    private readonly m_loadingQueue;
    private readonly m_tileCache;
    private readonly m_groundOverlayProvider;
    private readonly m_groundModificationManager;
    private m_tileBaseGeometryBuilder?;
    private m_showDebugInfo;
    private m_debugObject?;
    private stageConfigs;
    /** Number of loading stages for progressive loading */
    protected m_loadingStages: number;
    constructor(tileFactory: TileFactory<TileType>, options: TerrainSourceOptions<DataProviderType>);
    protected abstract createElevationRangeSource(): ElevationRangeSource;
    protected abstract createElevationProvider(): ElevationProvider;
    protected abstract getTerrainLevelRange(): [number, number] | undefined;
    get tileBaseGeometryBuilder(): TileGeometryBuilder;
    setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void>;
    get isYAxisDown(): boolean;
    addExclusionZone(tileAvailability: TileAvailability): string;
    removeExclusionZone(zoneId: string): void;
    set showDebugInfo(value: boolean);
    get showDebugInfo(): boolean;
    get debugObject(): Object3D;
    /**
     * Add a web tile data source
     * @param tileSource - The web tile data provider
     * @param options - Configuration options
     */
    addWebTileDataSource(tileSource: WebTileDataProvider, options?: WebTileLoaderOptions): void;
    /**
     * Remove a web tile data source
     * @param tileSource - The web tile data provider to remove
     */
    removeWebTileDataSource(tileSource: WebTileDataProvider): void;
    /**
     * Get all web tile data sources
     * @returns Array of web imagery tile providers
     */
    getWebTileDataSources(): WebImageryTileProvider[];
    getGroundOverlayProvider(): GroundOverlayProvider;
    getGroundModificationManager(): GroundModificationManager;
    /**
     * Add a tile loading task to the queue
     * @param tile - The tile to load
     * @param task - The loading task
     * @param abortSignal - Optional abort signal
     * @returns Promise or false if tile already in queue
     */
    enqueueTileLoadingTask(tile: TileType, task: (tile: TileType) => Promise<any>, abortSignal?: AbortSignal): any;
    /**
     * Remove a tile loading task from the queue
     * @param tile - The tile whose task should be removed
     */
    dequeueTileLoadingTask(tile: TileType): void;
    /**
     * Update memory usage statistics for a tile
     * @param tile - The tile to update
     */
    updateMemoryUsage(tile: TileType): void;
    /**
     * Add a tile to the LRU cache
     * @param tile - The tile to cache
     * @returns True if successfully cached
     */
    cacheTile(tile: TileType): boolean;
    /**
     * Remove a specific resource from the cache
     * @param resourceKey - The resource identifier to remove
     */
    unCacheResource(resourceKey: string): void;
    /**
     * Check if a tile is cached
     * @param tileKey - The tile key to check
     * @returns True if tile is cached
     */
    isTileCached(tileKey: TileKey): boolean;
    /**
     * Check if a tile resource is cached
     * @param tileKey - The tile key to check
     * @param resourceKey - The resource identifier
     * @returns True if resource is cached
     */
    isTileResourceCached(tileKey: TileKey, resourceKey: string): boolean;
    /**
     * Get a cached tile
     * @param tileKey - The tile key
     * @param markUsed - Whether to mark the tile as used
     * @returns The cached tile or undefined
     */
    getCachedTile(tileKey: TileKey, markUsed?: boolean): TileType | undefined;
    /**
     * Updates the used status of a tile and its parents
     * @param tk - The tile key to update
     */
    private updateTileUsed;
    connect(): Promise<void>;
    /**
     * Called before touching tiles to update view frustum
     */
    onWillTouchTiled(): void;
    /**
     * Called after touching tiles to process queue and cache
     */
    onTouchTiledComplete(): void;
    /**
     * Update tile overlays with debounce
     * @param tile - Optional specific tile to update
     */
    updateTileOverlays: (geoBox?: GeoBox) => void;
    /**
     * Gets the elevation range source
     * @returns The elevation range source or undefined
     */
    getElevationRangeSource(): ElevationRangeSource | undefined;
    /**
     * Gets the elevation data provider
     * @returns The elevation provider or undefined
     */
    getElevationProvider(): ElevationProvider | undefined;
    /**
     * Gets the projection switch controller
     * @returns The projection switch controller or undefined
     */
    getProjectionSwitchController(): ProjectionSwitchController | undefined;
    /**
     * Initializes the loading stages based on the total levels and the specified number of stages
     */
    private initializeStages;
    /**
     * Gets the number of loading stages
     * @returns The number of loading stages
     */
    get loadingStages(): number;
    /**
     * Sets the number of loading stages
     * @param value - The new number of loading stages
     */
    set loadingStages(value: number);
    /**
     * Gets the appropriate loading stage for a given tile level
     * @param tileKey - The tile key to determine stage for
     * @returns The loading stage configuration
     */
    protected getStageForLevel(tileKey: TileKey): LoadingStage;
    /**
     * Determines whether a tile should be subdivided
     * @param zoomLevel - The current zoom level
     * @param tileKey - The tile key to check
     * @returns True if the tile should be subdivided
     */
    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean;
    canGetTile(zoomLevel: number, tileKey: TileKey): boolean;
    /**
     * Cleans up resources and disposes of the terrain source
     */
    dispose(): void;
}
