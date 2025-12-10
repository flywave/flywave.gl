/* Copyright (C) 2025 flywave.gl contributors */

import { type FlatTheme, type Theme } from "@flywave/flywave-datasource-protocol";
import {
    type GeoBox,
    type TileAvailability,
    geographicTerrainStandardTiling,
    OrientedBox3,
    OrientedBoxHelper,
    ProjectionType,
    sphereProjection,
    SphereProjection,
    TileKey,
    TilingScheme,
    webMercatorProjection,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import {
    DataSource,
    type ElevationProvider,
    ElevationRange,
    type ElevationRangeSource,
    type MapView,
    TerrainDataSource,
    Tile
} from "@flywave/flywave-mapview";
import {
    type DataProvider,
    type TileDataSourceOptions,
    type TileFactory,
    TileDataSource
} from "@flywave/flywave-mapview-decoder";
import { Math2D } from "@flywave/flywave-utils";
import { ExtendedFrustum } from "@flywave/flywave-utils/ExtendedFrustum";
import { PriorityQueue } from "@flywave/flywave-utils/PriorityQueue";
import { type WebTileDataProvider } from "@flywave/flywave-webtile-datasource";
import debounce from "lodash.debounce";
import { Matrix4, Object3D } from "three";

import { TERRAIN_TILE_DECODER_ID } from "./Constants";
import { ExclusionManager } from "./ExclusionManager";
import { GroundModificationManager } from "./ground-modification-manager";
import {
    type GroundOverlayProviderOptions,
    GroundOverlayProvider
} from "./ground-overlay-provider";
import { type IResourceProvider } from "./ResourceProvider";
import { ProjectionSwitchController, type ProjectionSwitchOptions } from "./ProjectionSwitchController";
import { TileLRUCache, TileResourceManager } from "./TileResourceManager";
import { type WebTileLoaderOptions, WebImageryTileProvider } from "./WebImageryTileProvider";
import { GeographicStandardTilingTileGeometryBuilder, TileGeometryBuilder, WebMercatorTileGeometryBuilder } from "@flywave/flywave-geometry";

/**
 * Configuration options for TerrainSource
 */
export interface TerrainSourceOptions<DataProviderType extends DataProvider = DataProvider>
    extends Omit<TileDataSourceOptions, "tilingScheme" | "dataProvider"> {
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
export interface ITerrainSource<ProviderType extends DataProvider = DataProvider>
    extends TileDataSource<TerrainResourceTile, ProviderType> {
    /** Checks if a specific tile resource is cached */
    isTileResourceCached(tileKey: TileKey, resourceKey: string): boolean;

    /** Retrieves a cached tile if available */
    getCachedTile(tileKey: TileKey, keepCached?: boolean): TerrainResourceTile | undefined;

    /** Adds a tile to the cache */
    cacheTile(tile: TerrainResourceTile): boolean;


    /** Enqueues a task for loading tile data asynchronously */
    enqueueTileLoadingTask(
        tile: TerrainResourceTile,
        task: (tile: TerrainResourceTile) => Promise<any>,
        abortSignal?: AbortSignal
    ): Promise<any> | false;

    /** Updates the memory usage statistics for a tile */
    updateMemoryUsage(tile: TerrainResourceTile);

    /** Updates the overlays for a specific tile or all tiles */
    updateTileOverlays(geoBox?: GeoBox): void;

    /** Removes a specific resource from the cache */
    unCacheResource(resourceKey: string);

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
export class TerrainResourceTile extends Tile {
    _lastFrameVisited: number = 0;
    _isInFrustum: boolean = false;
    _isUsed: boolean = false;
    _distanceFromCamera: number = Number.MAX_SAFE_INTEGER;
    private readonly _resourceManager: TileResourceManager = new TileResourceManager();

    get resourceManager() {
        return this._resourceManager;
    }

    /**
     * Remove web tile textures from a specific source
     * @param resourceKey - The resource identifier to remove
     */
    removeTileResource(resourceKey: string) {
        this._resourceManager.removeResource(resourceKey);
    }

    /**
     * Update the tile's visibility state
     * @param mapView - The current map view
     * @param frustum - The view frustum (optional)
     */
    updateVisibilityState(mapView: MapView, frustum?: ExtendedFrustum) {
        this._distanceFromCamera = this.boundingBox.distanceToPoint(mapView.camera.position);
        this._isInFrustum = frustum ? this.boundingBox.intersects(frustum) : false;
    }

    /**
     * Marks the tile as being used in the current frame
     * @param mapView - The current map view
     */
    markUsedTile(mapView: MapView) {
        this._isUsed = true;
        this._lastFrameVisited = mapView.frameNumber;
    }

    /**
     * Disposes of the tile resources
     * @param fromLru - Whether the disposal is from LRU cache eviction
     */
    dispose(fromLru: boolean = false) {
        if (fromLru) {
            super.dispose();
            this._resourceManager.dispose();
        }
    }
}


export class ShadowTerrainResourceTile extends TerrainResourceTile {
    constructor(dataSource: DataSource, tileKey: TileKey, private resTile: TerrainResourceTile) {
        super(dataSource, tileKey);
        this.forceHasGeometry(true)
    }

    get resourceManager() {
        return this.resTile.resourceManager;
    }

    removeTileResource(resourceKey: string) {
        this.resTile.removeTileResource(resourceKey);
    }


    updateVisibilityState(mapView: MapView, frustum?: ExtendedFrustum) {
        this.resTile.updateVisibilityState(mapView, frustum);
        this._distanceFromCamera = this.resTile._distanceFromCamera;
        this._isInFrustum = this.resTile._isInFrustum;
    }

    markUsedTile(mapView: MapView) {
        this.resTile.markUsedTile(mapView);
        this._lastFrameVisited = this.resTile._lastFrameVisited;
        this._isUsed = this.resTile._isUsed;
    }

    private m_orientedBoxHelper?: OrientedBoxHelper;
    set elevationRange(elevationRange: ElevationRange) {
        super.elevationRange = elevationRange;
        this.projection.projectBox(this.geoBox, this.boundingBox);
        const datasource = this.dataSource as ITerrainSource;
        if (datasource.showDebugInfo) {
            if (this.m_orientedBoxHelper) {
                this.m_orientedBoxHelper.update(this.boundingBox);
            } else {
                this.m_orientedBoxHelper = new OrientedBoxHelper(this.boundingBox);
                datasource.debugObject.add(this.m_orientedBoxHelper);
            }
        }
    }

    dispose() {
        const datasource = this.dataSource as ITerrainSource;
        datasource.debugObject.remove(this.m_orientedBoxHelper);
        super.dispose();
        this.resTile.dispose();
        this.m_orientedBoxHelper?.dispose();
    }
}
/**
 * Priority comparison function for tile loading queue
 */
function tileLoadingPriorityComparator<TileType extends TerrainResourceTile>(
    a: TileType,
    b: TileType
): number {
    let priority = 0;

    // Priority based on distance from camera
    if (a._distanceFromCamera !== b._distanceFromCamera) {
        priority = a._distanceFromCamera > b._distanceFromCamera ? -1 : 100;
    }

    // Priority for tiles currently in use
    if (a._isUsed !== b._isUsed) {
        priority += a._isUsed ? 1 : -1;
    }

    // Priority for tiles in view frustum
    if (a._isInFrustum !== b._isInFrustum) {
        priority += a._isInFrustum ? 1 : -1;
    }

    return priority;
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
 * Priority comparison function for LRU cache eviction
 */
function tileEvictionPriorityComparator(a: TerrainResourceTile, b: TerrainResourceTile): number {
    // Evict least recently used tiles first
    return a._lastFrameVisited > b._lastFrameVisited ? -1 : 1;
}

// const TestTileKey1 = new TileKey(0, 0, 1); // eslint-disable-line @typescript-eslint/no-unused-vars
// const TestTileKey2 = new TileKey(1, 0, 1); // eslint-disable-line @typescript-eslint/no-unused-vars
/**
 * Abstract base class for terrain data sources
 */
export abstract class TerrainSource<
    DataProviderType extends DataProvider & IResourceProvider,
    TileType extends TerrainResourceTile = TerrainResourceTile
>
    extends TileDataSource<TileType, DataProviderType>
    implements ITerrainSource<DataProviderType>, TerrainDataSource {
    protected readonly m_elevationRangeSource?: ElevationRangeSource;
    protected readonly m_elevationProvider?: ElevationProvider;
    protected m_materialProviders: WebImageryTileProvider[] = [];

    protected m_exclusionManager: ExclusionManager = new ExclusionManager();
    protected m_projectionSwitchController?: ProjectionSwitchController;

    private readonly m_viewFrustum: ExtendedFrustum = new ExtendedFrustum();
    private readonly m_loadingQueue = new PriorityQueue<TileType>();
    private readonly m_tileCache = new TileLRUCache<TileType>(this);
    private readonly m_groundOverlayProvider: GroundOverlayProvider;
    private readonly m_groundModificationManager: GroundModificationManager =
        new GroundModificationManager(this);
    private m_tileBaseGeometryBuilder?: TileGeometryBuilder;

    private m_showDebugInfo: boolean = false;
    private m_debugObject?: Object3D = new Object3D();

    private stageConfigs: LoadingStage[] = [];
    /** Number of loading stages for progressive loading */
    protected m_loadingStages: number;


    constructor(
        tileFactory: TileFactory<TileType>,
        protected options: TerrainSourceOptions<DataProviderType>
    ) {
        super(tileFactory, {
            tilingScheme:
                options.tilingScheme ||
                webMercatorTerrainTilingScheme,
            enablePicking: true,
            ...options,
            concurrentDecoderServiceName: TERRAIN_TILE_DECODER_ID
        });

        this.useGeometryLoader = false;

        this.m_elevationRangeSource = this.createElevationRangeSource();
        this.m_elevationProvider = this.createElevationProvider();

        this.m_loadingQueue.priorityCallback = tileLoadingPriorityComparator;
        this.m_tileCache.unloadPriorityCallback = tileEvictionPriorityComparator;
        this.m_tileCache.computeMemoryUsageCallback = (tile: TerrainResourceTile) =>
            tile.resourceManager.getMemoryUsed();

        this.m_loadingQueue.maxJobs = options.maxJobs || 20;

        this.m_groundOverlayProvider = new GroundOverlayProvider(options.groundOverlayOptions, this);

        this.m_groundOverlayProvider.register(this);

        this.m_projectionSwitchController = new ProjectionSwitchController(
            this,
            options.projectionSwitchOptions
        );


        this.m_loadingStages = options.loadingStages ?? 6;

        this.m_showDebugInfo = options.showDebugInfo ?? false;
    }

    protected abstract createElevationRangeSource(): ElevationRangeSource;

    protected abstract createElevationProvider(): ElevationProvider;

    protected abstract getTerrainLevelRange(): [number, number] | undefined;

    public get tileBaseGeometryBuilder(): TileGeometryBuilder {
        if (!this.m_tileBaseGeometryBuilder || this.m_tileBaseGeometryBuilder.sphereProjection !== this.projection) {
            if (this.projection.type === ProjectionType.Spherical) {
                if (this.getTilingScheme() === webMercatorTerrainTilingScheme) {
                    this.m_tileBaseGeometryBuilder = new WebMercatorTileGeometryBuilder(this.projection as SphereProjection);
                }
                else if (this.getTilingScheme() === geographicTerrainStandardTiling) {
                    this.m_tileBaseGeometryBuilder = new GeographicStandardTilingTileGeometryBuilder(this.projection as SphereProjection);
                }
            } else {
                this.m_tileBaseGeometryBuilder = new WebMercatorTileGeometryBuilder(sphereProjection);
            }
        }
        return this.m_tileBaseGeometryBuilder;
    }

    async setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void> { }

    public get isYAxisDown(): boolean {
        return this.getTilingScheme().projection === webMercatorProjection;
    }

    addExclusionZone(tileAvailability: TileAvailability) {
        return this.m_exclusionManager.addExclusionZone(tileAvailability);
    }

    removeExclusionZone(zoneId: string) {
        this.m_exclusionManager.removeExclusionZone(zoneId);
    }

    set showDebugInfo(value: boolean) {
        if (this.m_showDebugInfo === value) return;
        this.m_showDebugInfo = value;

        this.updateTileOverlays();
    }

    get showDebugInfo(): boolean {
        return this.m_showDebugInfo;
    }

    get debugObject(): Object3D {
        return this.m_debugObject;
    }

    /**
     * Add a web tile data source
     * @param tileSource - The web tile data provider
     * @param options - Configuration options
     */
    addWebTileDataSource(tileSource: WebTileDataProvider, options: WebTileLoaderOptions = {}) {
        this.m_materialProviders.push(new WebImageryTileProvider(tileSource, options));
        this.m_materialProviders[this.m_materialProviders.length - 1].register(this);
    }

    /**
     * Remove a web tile data source
     * @param tileSource - The web tile data provider to remove
     */
    removeWebTileDataSource(tileSource: WebTileDataProvider) {
        this.m_materialProviders = this.m_materialProviders.filter(
            provider => provider.webTileProvider !== tileSource
        );
    }

    /**
     * Get all web tile data sources
     * @returns Array of web imagery tile providers
     */
    getWebTileDataSources() {
        return this.m_materialProviders;
    }

    getGroundOverlayProvider(): GroundOverlayProvider {
        return this.m_groundOverlayProvider;
    }

    getGroundModificationManager(): GroundModificationManager {
        return this.m_groundModificationManager;
    }

    /**
     * Add a tile loading task to the queue
     * @param tile - The tile to load
     * @param task - The loading task
     * @param abortSignal - Optional abort signal
     * @returns Promise or false if tile already in queue
     */
    enqueueTileLoadingTask(
        tile: TileType,
        task: (tile: TileType) => Promise<any>,
        abortSignal?: AbortSignal
    ) {
        if (this.m_loadingQueue.has(tile)) {
            return false;
        }

        abortSignal?.addEventListener("abort", () => {
            this.dequeueTileLoadingTask(tile);
        });
        return this.m_loadingQueue.add(tile, task);
    }

    /**
     * Remove a tile loading task from the queue
     * @param tile - The tile whose task should be removed
     */
    dequeueTileLoadingTask(tile: TileType) {
        this.m_loadingQueue.remove(tile);
    }

    /**
     * Update memory usage statistics for a tile
     * @param tile - The tile to update
     */
    updateMemoryUsage(tile: TileType) {
        this.m_tileCache.updateMemoryUsage(tile);
    }

    /**
     * Add a tile to the LRU cache
     * @param tile - The tile to cache
     * @returns True if successfully cached
     */
    cacheTile(tile: TileType) {
        if (
            this.m_tileCache.add(tile, () => {
                this.dequeueTileLoadingTask(tile);
                tile.dispose(true);
            })
        ) {
            this.m_tileCache.setLoaded(tile, true);
            return true;
        }
        return false;
    }

    /**
     * Remove a specific resource from the cache
     * @param resourceKey - The resource identifier to remove
     */
    unCacheResource(resourceKey: string) {
        this.m_tileCache.removeResource(resourceKey);
    }

    /**
     * Check if a tile is cached
     * @param tileKey - The tile key to check
     * @returns True if tile is cached
     */
    isTileCached(tileKey: TileKey): boolean {
        return this.m_tileCache.hasTile(tileKey);
    }

    /**
     * Check if a tile resource is cached
     * @param tileKey - The tile key to check
     * @param resourceKey - The resource identifier
     * @returns True if resource is cached
     */
    isTileResourceCached(tileKey: TileKey, resourceKey: string): boolean {
        return this.m_tileCache.getTile(tileKey)?.resourceManager.hasResource(resourceKey);
    }

    /**
     * Get a cached tile
     * @param tileKey - The tile key
     * @param markUsed - Whether to mark the tile as used
     * @returns The cached tile or undefined
     */
    getCachedTile(tileKey: TileKey, markUsed: boolean = true): TileType | undefined {
        const tile = this.m_tileCache.getTile(tileKey);
        if (tile && markUsed) {
            this.updateTileUsed(tile.tileKey);
        }
        return tile;
    }

    /**
     * Updates the used status of a tile and its parents
     * @param tk - The tile key to update
     */
    private updateTileUsed(tk: TileKey): void {
        while (tk.level >= 0) {
            const tile = this.m_tileCache.getTile(tk);
            tile?.markUsedTile(this.mapView);
            if (tk.level === 0) {
                break;
            }
            tk = tk.parent();
        }
    }

    connect(): Promise<void> {
        return super.connect().then(() => {
            this.initializeStages();
            if (this.showDebugInfo)
                this.mapView.scene.add(this.m_debugObject);
        });
    }

    /**
     * Called before touching tiles to update view frustum
     */
    public override onWillTouchTiled() {
        this.m_viewFrustum.setFromProjectionMatrix(
            new Matrix4().multiplyMatrices(
                this.mapView.camera.projectionMatrix,
                this.mapView.camera.matrixWorldInverse
            )
        );

        this.m_debugObject?.position.setFromMatrixPosition(this.mapView.camera.matrixWorld).negate();

        // Update projection switch controller
        if (this.m_projectionSwitchController) {
            this.m_projectionSwitchController.update();
        }

        this.m_tileCache.scheduleUpdateTile(this.mapView, this.m_viewFrustum);
    }

    /**
     * Called after touching tiles to process queue and cache
     */
    public override onTouchTiledComplete(): void {
        this.m_loadingQueue.scheduleJobRun();
        this.m_tileCache.scheduleUnloadAndUpdateTile();
    }

    /**
     * Update tile overlays with debounce
     * @param tile - Optional specific tile to update
     */
    public updateTileOverlays = debounce((geoBox?: GeoBox): void => {
        if (this.isDetached()) return;

        let filterBoundingBox: Math2D.Box | undefined;
        if (geoBox) {
            const { latitude: minLat, longitude: minLng } = geoBox.southWest;
            const { latitude: maxLat, longitude: maxLng } = geoBox.northEast;
            filterBoundingBox = new Math2D.Box(minLng, minLat, maxLng - minLng, maxLat - minLat);
        }

        this.mapView.clearTileCache(
            this.name,
            geoBox
                ? (tileToCheck: Tile) => {
                    const { latitude: minLat, longitude: minLng } = tileToCheck.geoBox.southWest;
                    const { latitude: maxLat, longitude: maxLng } = tileToCheck.geoBox.northEast;
                    const tileBox = new Math2D.Box(
                        minLng,
                        minLat,
                        maxLng - minLng,
                        maxLat - minLat
                    );
                    return filterBoundingBox ? tileBox.intersects(filterBoundingBox) : false;
                }
                : undefined
        );
        this.mapView.update();
    }, 100) as (geoBox?: GeoBox) => void;

    /**
     * Gets the elevation range source
     * @returns The elevation range source or undefined
     */
    getElevationRangeSource(): ElevationRangeSource | undefined {
        return this.m_elevationRangeSource;
    }

    /**
     * Gets the elevation data provider
     * @returns The elevation provider or undefined
     */
    getElevationProvider(): ElevationProvider | undefined {
        return this.m_elevationProvider;
    }

    /**
     * Gets the projection switch controller
     * @returns The projection switch controller or undefined
     */
    getProjectionSwitchController(): ProjectionSwitchController | undefined {
        return this.m_projectionSwitchController;
    }

    /**
     * Initializes the loading stages based on the total levels and the specified number of stages
     */
    private initializeStages(): void {
        let [minZoom, maxZoom] = this.getTerrainLevelRange();

        const totalLevels = maxZoom - minZoom;
        const levelsPerStage = Math.ceil(totalLevels / this.m_loadingStages);

        this.stageConfigs = [];

        for (let i = 0; i < this.m_loadingStages; i++) {
            const stageMin = minZoom + i * levelsPerStage;
            const stageMax = Math.max(stageMin + levelsPerStage - 1, minZoom);

            this.stageConfigs.push({
                minLevel: stageMin == 0 ? 1 : stageMin,
                maxLevel: stageMax,
                stage: i, // Lower stage numbers have higher priority
                isLast: i === this.m_loadingStages - 1
            });
        }
    }

    /**
     * Gets the number of loading stages
     * @returns The number of loading stages
     */
    get loadingStages(): number {
        return this.m_loadingStages;
    }

    /**
     * Sets the number of loading stages
     * @param value - The new number of loading stages
     */
    set loadingStages(value: number) {
        this.m_loadingStages = value;
        this.initializeStages();
    }

    /**
     * Gets the appropriate loading stage for a given tile level
     * @param tileKey - The tile key to determine stage for
     * @returns The loading stage configuration
     */
    protected getStageForLevel(tileKey: TileKey): LoadingStage {
        for (const stage of this.stageConfigs) {
            if (tileKey.level >= stage.minLevel && tileKey.level <= stage.maxLevel) {
                return stage;
            }
        }
        // Fallback to the last (highest level) stage
        return this.stageConfigs[this.stageConfigs.length - 1];
    }


    /**
     * Determines whether a tile should be subdivided
     * @param zoomLevel - The current zoom level
     * @param tileKey - The tile key to check
     * @returns True if the tile should be subdivided
     */
    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean {
        const [minZoom, maxZoom] = this.getTerrainLevelRange();
        if (tileKey.level < minZoom || tileKey.level == 0) {
            return true;
        }

        const stage = this.getStageForLevel(tileKey);

        const levelOffset = tileKey.level - (stage.isLast ? Math.max(stage.minLevel, tileKey.level) : stage.minLevel);
        const parentKey = TileKey.fromRowColumnLevel(
            tileKey.row >> levelOffset,
            tileKey.column >> levelOffset,
            stage.minLevel
        );
        return (
            (this.dataProvider().hasResource(parentKey) ||
                (tileKey.level > maxZoom && super.shouldSubdivide(zoomLevel, tileKey)))
        );
    }

    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        return !this.m_exclusionManager.shouldExclude(tileKey);
    }

    /**
     * Cleans up resources and disposes of the terrain source
     */
    dispose(): void {
        super.dispose();
        this.m_tileCache.removeAllTiles();
    }
}
