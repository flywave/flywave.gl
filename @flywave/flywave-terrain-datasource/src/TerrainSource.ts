/* Copyright (C) 2025 flywave.gl contributors */

import { type FlatTheme, type Theme } from "@flywave/flywave-datasource-protocol";
import {
    type GeoBox,
    type SphereProjection,
    type TileAvailability,
    type TilingScheme,
    geographicTerrainStandardTiling,
    OrientedBox3,
    OrientedBoxHelper,
    ProjectionType,
    sphereProjection,
    TileKey,
    webMercatorProjection,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import {
    type DataSource,
    type ElevationProvider,
    type ElevationRange,
    type ElevationRangeSource,
    type MapView,
    type TerrainDataSource,
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
import {
    type Intersection,
    type Material,
    type Mesh,
    type Raycaster,
    Matrix4,
    Object3D,
    Sphere,
    Vector3
} from "three/webgpu";

import { TERRAIN_TILE_DECODER_ID } from "./Constants";

// Heightfield hits have no real Object3D to report; this placeholder only
// satisfies the three Intersection contract. This raycast is consumed by
// camera collision only and never enters picking results.
const terrainCollisionObject = new Object3D();

// Scratch matrix for the per-frame view-projection matrix (avoids allocating a
// fresh Matrix4 on every onWillTouchTiled call).
const viewProjectionMatrixScratch = new Matrix4();

import {
    type TileGeometryBuilder,
    GeographicStandardTilingTileGeometryBuilder,
    WebMercatorTileGeometryBuilder
} from "@flywave/flywave-geometry";

import { type TerrainLayerMesh, type TerrainTileState } from "./dem-terrain/TerrainLayerMesh";
import { ExclusionManager } from "./ExclusionManager";
import {
    HeightMapModifierManager,
    serializeHeightMapModifier
} from "./ground-modification-manager";
import {
    type ProjectionSwitchOptions,
    ProjectionSwitchController
} from "./ProjectionSwitchController";
import { DemPatchManager } from "./dem-terrain/dem-patch";
import { type ProjectorImageryProvider, ProjectorOverlayManager } from "./projector-overlay";
import { type IResourceProvider, type ResourceProvider } from "./ResourceProvider";
import { TileLRUCache, TileResourceManager } from "./TileResourceManager";
import { type WebTileLoaderOptions, WebImageryTileProvider } from "./WebImageryTileProvider";

/**
 * Capacity (in tiles) of the warm layer-mesh cache that preserves materials
 * across terrain-LRU eviction. Each entry holds 1-N materials with per-tile
 * uniform nodes (small GPU footprint — the heavy bytes live in the provider
 * LRU / resource manager), so a generous cap is cheap compared to rebuilding
 * the per-material TSL node graphs.
 */
const MAX_PRESERVED_LAYER_MESH_TILES = 4096;

/**
 * Default duration of the in-place imagery / DEM refinement crossfade.
 * Google-Earth-like: long enough to hide the resolution step, short enough
 * that streaming tiles do not all fade at once.
 */
const DEFAULT_TILE_FADE_DURATION = 400;

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

    /**
     * Whether this terrain source participates in camera ground collision:
     * the camera controller raycasts it for the zoom hit-point and ground
     * clamping. Terrain is the ground itself, so unlike other data sources
     * the default is `true`.
     *
     * @default true
     */
    enableCameraCollision?: boolean;

    /**
     * Duration in milliseconds of the in-place crossfade applied when a
     * tile's imagery or DEM is upgraded from an ancestor level to its exact
     * level (the "Google Earth" tile-loading fade). `0` disables it.
     *
     * Only refinements fade; downgrades to an ancestor swap instantly.
     *
     * @default 400
     */
    tileFadeDuration?: number;
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

    /**
     * Gets all per-tile layer providers feeding the resource pipeline:
     * web imagery providers plus the projector overlay provider. Terrain
     * tile loaders iterate this for progressive resource loading.
     */
    getLayerProviders(): Array<ResourceProvider<any, ITerrainSource>>;

    getGroundModificationManager(): HeightMapModifierManager;

    /**
     * Gets the DEM patch (elevation override) manager. Patch layers replace
     * base terrain elevation where they have data, resolved by priority.
     * The layers are consumed by the DEM decode path (DEMTerrainSource);
     * quantized/stratum sources expose the manager but ignore it.
     */
    getDemPatchManager(): DemPatchManager;

    /**
     * Gets the projector overlay manager that owns all ground-projected
     * layers (images, canvas-drawn polylines, polygons, …) for this source.
     */
    getProjectorOverlayManager(): ProjectorOverlayManager;

    getElevationProvider(): ElevationProvider;

    /**
     * Camera-collision raycast (the `ICameraCollidable` contract): marches the
     * caller's ray against this source's elevation data. Output points are in
     * render space; consumers translate with `.add(camera.position)`.
     */
    raycast(raycaster: Raycaster, intersections: Intersection[]): void;

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
    private _cachedMesh: Object3D | null = null;
    private _layerMeshes: Map<string, TerrainLayerMesh> | null = null;
    private _layerTileState: TerrainTileState | null = null;
    /**
     * Lazily cached world bounding sphere of this tile (refreshed whenever the
     * bounding box changes). Used for the per-frame visibility pass; see
     * updateVisibilityState.
     */
    private _visibilitySphere: Sphere | undefined;
    private _visibilitySphereDirty = true;

    /**
     * Track bounding-box changes so the cached visibility sphere is refreshed
     * (covers construction, elevation-range updates and decoded-tile bounds).
     */
    protected override updateBoundingBox(newBoundingBox?: OrientedBox3) {
        super.updateBoundingBox(newBoundingBox);
        this._visibilitySphereDirty = true;
    }

    shouldDisposeObjectGeometry() {
        return false;
    }

    shouldDisposeObjectMaterial() {
        return true;
    }

    shouldDisposeTexture() {
        return false;
    }

    get resourceManager() {
        return this._resourceManager;
    }

    get cachedMesh(): Object3D | null {
        return this._cachedMesh;
    }

    set cachedMesh(mesh: Object3D | null) {
        this._cachedMesh = mesh;
    }

    get layerMeshes(): Map<string, TerrainLayerMesh> {
        if (!this._layerMeshes) {
            this._layerMeshes = new Map();
        }
        return this._layerMeshes;
    }

    get layerTileState(): TerrainTileState | null {
        return this._layerTileState;
    }

    set layerTileState(state: TerrainTileState | null) {
        this._layerTileState = state;
    }

    /**
     * Detach the layer meshes + shared tile state for preservation across LRU
     * eviction (the source-level warm mesh cache re-attaches them when the
     * tile is re-created, avoiding material graph rebuilds). Returns null
     * when there is nothing worth preserving.
     */
    extractLayerMeshes(): {
        meshes: Map<string, TerrainLayerMesh>;
        state: TerrainTileState;
    } | null {
        if (!this._layerMeshes || this._layerMeshes.size === 0 || !this._layerTileState) {
            return null;
        }
        const preserved = { meshes: this._layerMeshes, state: this._layerTileState };
        this._layerMeshes = null;
        this._layerTileState = null;
        return preserved;
    }

    /**
     * Re-attach previously preserved layer meshes + tile state (from the warm
     * mesh cache) onto this (new) tile instance.
     */
    adoptLayerMeshes(preserved: {
        meshes: Map<string, TerrainLayerMesh>;
        state: TerrainTileState;
    }): void {
        this._layerMeshes = preserved.meshes;
        this._layerTileState = preserved.state;
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
     *
     * Runs once per frame for every cached tile, so the per-tile work is kept
     * to a sphere test against a cached bounding sphere (conservative superset
     * of the oriented box, refreshed only when the bound changes). The two
     * fields below feed only the loading-queue priority heuristic
     * ({@link tileLoadingPriorityComparator}); tile visibility itself is driven
     * by the requested-frame counter on {@link Tile.isVisible}.
     *
     * @param mapView - The current map view
     * @param frustum - The view frustum (optional)
     */
    updateVisibilityState(mapView: MapView, frustum?: ExtendedFrustum) {
        let sphere = this._visibilitySphere;
        if (sphere === undefined || this._visibilitySphereDirty) {
            sphere = this.boundingBox.getBoundingSphere(sphere ?? new Sphere());
            this._visibilitySphere = sphere;
            this._visibilitySphereDirty = false;
        }

        const cameraPosition = mapView.camera.position;
        const dx = cameraPosition.x - sphere.center.x;
        const dy = cameraPosition.y - sphere.center.y;
        const dz = cameraPosition.z - sphere.center.z;
        // Conservative lower bound of the distance to the box surface.
        this._distanceFromCamera = Math.max(
            0,
            Math.sqrt(dx * dx + dy * dy + dz * dz) - sphere.radius
        );
        this._isInFrustum = frustum ? frustum.intersectsSphere(sphere) : false;
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
        if (fromLru && this._cachedMesh) {
            const mesh = this._cachedMesh as Mesh;
            if (mesh.material) {
                (mesh.material as Material).dispose();
            }
            this._cachedMesh = null;
        }
        if (this._layerMeshes) {
            this._layerMeshes.forEach(layerMesh => {
                layerMesh.dispose();
            });
            this._layerMeshes = null;
        }
        if (this._layerTileState) {
            this._layerTileState.dispose();
            this._layerTileState = null;
        }
        super.dispose();
        if (fromLru) {
            this._resourceManager.dispose();
        }
    }

    clear() {
        super.clear();
    }
}

export class ShadowTerrainResourceTile extends TerrainResourceTile {
    constructor(
        dataSource: DataSource,
        tileKey: TileKey,
        private readonly resTile: TerrainResourceTile
    ) {
        super(dataSource, tileKey);
        this.forceHasGeometry(true);
    }

    get resourceManager() {
        return this.resTile.resourceManager;
    }

    get cachedMesh(): Object3D | null {
        return this.resTile.cachedMesh;
    }

    set cachedMesh(mesh: Object3D | null) {
        this.resTile.cachedMesh = mesh;
    }

    get layerMeshes(): Map<string, TerrainLayerMesh> {
        return this.resTile.layerMeshes;
    }

    get layerTileState(): TerrainTileState | null {
        return this.resTile.layerTileState;
    }

    set layerTileState(state: TerrainTileState | null) {
        this.resTile.layerTileState = state;
    }

    adoptLayerMeshes(preserved: {
        meshes: Map<string, TerrainLayerMesh>;
        state: TerrainTileState;
    }): void {
        this.resTile.adoptLayerMeshes(preserved);
    }

    shouldDisposeObjectGeometry() {
        return false;
    }

    shouldDisposeObjectMaterial() {
        return false;
    }

    shouldDisposeTexture() {
        return false;
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
    implements ITerrainSource<DataProviderType>, TerrainDataSource
{
    protected readonly m_elevationRangeSource?: ElevationRangeSource;
    protected readonly m_elevationProvider?: ElevationProvider;
    protected m_materialProviders: WebImageryTileProvider[] = [];

    protected m_exclusionManager: ExclusionManager = new ExclusionManager();

    protected m_projectionSwitchController?: ProjectionSwitchController;

    private readonly m_viewFrustum: ExtendedFrustum = new ExtendedFrustum();
    private readonly m_loadingQueue = new PriorityQueue<TileType>();
    /**
     * Tiles currently queued for loading. The per-frame visibility refresh
     * (see TileLRUCache.scheduleUpdateTile) only needs to cover these: the
     * visibility flags' only consumer is the loading-queue priority
     * comparator, which ranks exactly these tiles.
     */
    private readonly m_queuedTiles = new Set<TileType>();
    private readonly m_tileCache = new TileLRUCache<TileType>(this);
    private readonly m_groundModificationManager: HeightMapModifierManager;
    private readonly m_demPatchManager: DemPatchManager;
    private readonly m_projectorOverlayManager: ProjectorOverlayManager;
    private m_tileBaseGeometryBuilder?: TileGeometryBuilder;

    private m_showDebugInfo: boolean = false;
    private readonly m_debugObject?: Object3D = new Object3D();

    /**
     * Warm cache of layer meshes + tile state preserved across terrain-LRU
     * eviction, keyed by tileKey morton code. Bounded FIFO — entries falling
     * off the end are disposed for real.
     */
    private readonly m_layerMeshCache = new Map<
        number,
        { meshes: Map<string, TerrainLayerMesh>; state: TerrainTileState }
    >();

    /**
     * Tiles whose resources are still sampled by an in-flight crossfade.
     * Marked as "used" every frame before the LRU sweep so their textures
     * cannot be disposed mid-fade. Keyed by level:row:column; refcounted
     * because several layers of one tile may fade simultaneously.
     */
    private readonly m_fadePins = new Map<string, { tileKey: TileKey; count: number }>();

    private readonly m_tileFadeDuration: number;

    protected m_disposing: boolean = false;

    private stageConfigs: LoadingStage[] = [];
    /** Number of loading stages for progressive loading */
    protected m_loadingStages: number;

    constructor(
        tileFactory: TileFactory<TileType>,
        protected options: TerrainSourceOptions<DataProviderType>
    ) {
        super(tileFactory, {
            tilingScheme: options.tilingScheme || webMercatorTerrainTilingScheme,
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

        // Create ground modification manager
        this.m_groundModificationManager = new HeightMapModifierManager();

        // DEM patch (elevation override) manager. Created eagerly so callers
        // can add patch layers before connect().
        this.m_demPatchManager = new DemPatchManager();

        // Per-source projector overlay manager. Created eagerly so callers
        // can add layers before connect().
        this.m_projectorOverlayManager = new ProjectorOverlayManager();

        this.m_projectionSwitchController = new ProjectionSwitchController(
            this,
            options.projectionSwitchOptions
        );

        this.m_loadingStages = options.loadingStages ?? 6;

        this.m_showDebugInfo = options.showDebugInfo ?? false;
        this.enableCameraCollision = options.enableCameraCollision ?? true;
        this.m_tileFadeDuration = Math.max(
            0,
            options.tileFadeDuration ?? DEFAULT_TILE_FADE_DURATION
        );
    }

    /**
     * Sets up synchronization of ground modifications to worker
     * This ensures that modifiers are stored locally in worker to avoid
     * repeated serialization for each tile decode operation
     */
    private async setupGroundModificationSync(): Promise<void> {}

    protected abstract createElevationRangeSource(): ElevationRangeSource;

    protected abstract createElevationProvider(): ElevationProvider;

    protected abstract getTerrainLevelRange(): [number, number] | undefined;

    public get tileBaseGeometryBuilder(): TileGeometryBuilder {
        if (
            !this.m_tileBaseGeometryBuilder ||
            this.m_tileBaseGeometryBuilder.sphereProjection !== this.projection
        ) {
            if (this.projection.type === ProjectionType.Spherical) {
                if (this.getTilingScheme() === webMercatorTerrainTilingScheme) {
                    this.m_tileBaseGeometryBuilder = new WebMercatorTileGeometryBuilder(
                        this.projection as SphereProjection
                    );
                } else if (this.getTilingScheme() === geographicTerrainStandardTiling) {
                    this.m_tileBaseGeometryBuilder =
                        new GeographicStandardTilingTileGeometryBuilder(
                            this.projection as SphereProjection
                        );
                }
            } else {
                this.m_tileBaseGeometryBuilder = new WebMercatorTileGeometryBuilder(
                    sphereProjection
                );
            }
        }
        return this.m_tileBaseGeometryBuilder;
    }

    /** Duration of the imagery/DEM refinement crossfade in milliseconds. */
    public get tileFadeDuration(): number {
        return this.m_tileFadeDuration;
    }

    /**
     * Keeps a tile's resources out of the LRU sweep while a layer mesh is
     * still crossfading its textures (called by TerrainTileState).
     */
    public pinFadeResource(tileKey: TileKey): void {
        const key = `${tileKey.level}:${tileKey.row}:${tileKey.column}`;
        const entry = this.m_fadePins.get(key);
        if (entry) {
            entry.count++;
        } else {
            this.m_fadePins.set(key, { tileKey, count: 1 });
        }
        // Also mark it used right away: a fade can start while tiles are being
        // created, i.e. AFTER this frame's onWillTouchTiled pass — the LRU
        // sweep at the end of the same frame must not evict it.
        this.m_tileCache.getTile(tileKey)?.markUsedTile(this.mapView);
    }

    public unpinFadeResource(tileKey: TileKey): void {
        const key = `${tileKey.level}:${tileKey.row}:${tileKey.column}`;
        const entry = this.m_fadePins.get(key);
        if (!entry) return;
        entry.count--;
        if (entry.count <= 0) {
            this.m_fadePins.delete(key);
        }
    }

    async setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void> {}

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
        const providers = this.m_materialProviders.filter(
            provider => provider.webTileProvider !== tileSource
        );
        if (providers.length !== this.m_materialProviders.length) {
            this.m_materialProviders = providers;
            this.updateTileOverlays();
        }
    }

    /**
     * Get all web tile data sources
     * @returns Array of web imagery tile providers
     */
    getWebTileDataSources() {
        return this.m_materialProviders;
    }

    /**
     * Get all per-tile layer providers (web imagery + projector overlay).
     * @returns Array of resource providers
     */
    getLayerProviders(): Array<ResourceProvider<any, ITerrainSource>> {
        return [...this.m_materialProviders, this.m_projectorOverlayManager.provider];
    }

    getGroundModificationManager(): HeightMapModifierManager {
        return this.m_groundModificationManager;
    }

    getDemPatchManager(): DemPatchManager {
        return this.m_demPatchManager;
    }

    /**
     * Snapshot of every tile in the terrain LRU (used by the DEM patch
     * invalidation to find baked resources needing a re-bake).
     */
    protected getCachedTerrainTiles(): TileType[] {
        return this.m_tileCache.getAllTiles();
    }

    getProjectorOverlayManager(): ProjectorOverlayManager {
        return this.m_projectorOverlayManager;
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
        const promise = this.m_loadingQueue.add(tile, task);
        this.m_queuedTiles.add(tile);
        return promise;
    }

    /**
     * Remove a tile loading task from the queue
     * @param tile - The tile whose task should be removed
     */
    dequeueTileLoadingTask(tile: TileType) {
        this.m_queuedTiles.delete(tile);
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
                // Eviction from the terrain LRU destroys the tile's data
                // resources, but its layer meshes / materials are moved into
                // the warm mesh cache first so a later re-creation of the
                // same tileKey re-attaches them without any material graph
                // rebuild (the LRU byte budget counts DEM resources, not
                // materials — the churn of rebuilding per-material TSL graphs
                // on every evict/return cycle caused severe hitches while
                // panning once the byte budget started evicting).
                if (!this.m_disposing) {
                    this.preserveLayerMeshes(tile);
                }
                tile.dispose(true);
            })
        ) {
            this.m_tileCache.setLoaded(tile, true);
            return true;
        }
        return false;
    }

    /**
     * Move a tile's layer meshes + state into the warm mesh cache (FIFO,
     * bounded). Called right before LRU eviction disposes the tile.
     */
    private preserveLayerMeshes(tile: TerrainResourceTile) {
        const preserved = tile.extractLayerMeshes();
        if (!preserved) return;

        // The LRU eviction callback disposes the tile's resources right
        // after this — the DEM height texture becomes invalid. Keep meshes +
        // state (cheap, avoids material churn) but drop texture references
        // so re-adopted tiles never sample a destroyed GPU texture.
        preserved.state.invalidateElevation();

        const key = tile.tileKey.mortonCode(this.getTilingScheme().mortonTileEncoding);
        this.m_layerMeshCache.delete(key);
        this.m_layerMeshCache.set(key, preserved);

        while (this.m_layerMeshCache.size > MAX_PRESERVED_LAYER_MESH_TILES) {
            const oldestKey = this.m_layerMeshCache.keys().next().value as number;
            const oldest = this.m_layerMeshCache.get(oldestKey)!;
            this.m_layerMeshCache.delete(oldestKey);
            oldest.meshes.forEach(mesh => {
                mesh.dispose();
            });
            oldest.state.dispose();
        }
    }

    /**
     * Take preserved layer meshes + state for a tileKey out of the warm mesh
     * cache (if any), for adoption by a newly created tile. Ownership
     * transfers to the caller — the entry is removed from the cache.
     */
    acquireLayerMeshes(tileKey: TileKey) {
        const key = tileKey.mortonCode(this.getTilingScheme().mortonTileEncoding);
        const preserved = this.m_layerMeshCache.get(key);
        if (preserved) {
            this.m_layerMeshCache.delete(key);
        }
        return preserved ?? null;
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

    async connect(): Promise<void> {
        await super.connect();
        this.initializeStages();
        if (this.showDebugInfo) this.mapView.scene.add(this.m_debugObject);
        // Setup ground modification sync after decoder is connected
        await this.setupGroundModificationSync();
        // Register the projector provider with this source so its per-tile
        // resources enter the same pipeline as web imagery.
        await this.m_projectorOverlayManager.provider.register(this);
    }

    /**
     * Called before touching tiles to update view frustum
     */
    public override onWillTouchTiled() {
        this.m_viewFrustum.setFromProjectionMatrix(
            viewProjectionMatrixScratch.multiplyMatrices(
                this.mapView.camera.projectionMatrix,
                this.mapView.camera.matrixWorldInverse
            )
        );

        this.m_debugObject?.position
            .setFromMatrixPosition(this.mapView.camera.matrixWorld)
            .negate();

        // Update projection switch controller
        if (this.m_projectionSwitchController) {
            this.m_projectionSwitchController.update();
        }

        this.m_tileCache.scheduleUpdateTile(this.mapView, this.m_viewFrustum, this.m_queuedTiles);

        // Crossfade pins are marked AFTER scheduleUpdateTile (which resets
        // the used set) so the LRU sweep later this frame cannot unload the
        // ancestor texture an in-flight fade is still sampling.
        if (this.m_fadePins.size > 0) {
            for (const { tileKey } of this.m_fadePins.values()) {
                this.m_tileCache.getTile(tileKey)?.markUsedTile(this.mapView);
            }
        }
    }

    /**
     * Called after touching tiles to process queue and cache
     */
    public override onTouchTiledComplete(): void {
        this.m_loadingQueue.scheduleJobRun();
        // Jobs that finished inside the queue are not seen by
        // dequeueTileLoadingTask; drop them so the queue-following visibility
        // set stays tight.
        for (const tile of this.m_queuedTiles) {
            if (!this.m_loadingQueue.has(tile)) {
                this.m_queuedTiles.delete(tile);
            }
        }
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
     * Camera-collision raycast (the `ICameraCollidable` contract): finds the
     * first point along the caller's ray that reaches the terrain surface
     * (sample altitude drops to the terrain height + 1mm tolerance). The ray
     * arrives in the geo frame (direction is frame-invariant); the output
     * point is render space per the data source contract, translated back by
     * the consumer with `.add(camera.position)`. Below zoom level 13 the
     * elevation grid is too coarse for collision, so the source opts out and
     * the controller falls back to the mathematical surface.
     *
     * The crossing is located with exponential bracketing + bisection instead
     * of a linear march: doubling strides find a below-surface sample, then
     * the bracket is halved to sub-meter precision. This bounds the sample
     * count at ~50 regardless of camera altitude, where the previous linear
     * march (50 m step cap) needed tens of thousands of samples from high
     * altitudes.
     */
    raycast(raycaster: Raycaster, intersections: Intersection[]): void {
        if (!this.enableCameraCollision || this.isDetached()) {
            return;
        }
        const elevationProvider = this.m_elevationProvider;
        if (!elevationProvider || this.mapView.zoomLevel < 13) {
            return;
        }

        const projection = this.mapView.projection;
        const maxDistance = 2 * projection.unitScale; // long enough detection distance
        // Halvings that shrink an earth-scale bracket below the old marcher's
        // 1 m resolution (2 * unitScale / 2^24 < 1 m).
        const bisectionIterations = 24;
        const direction = raycaster.ray.direction;
        const origin = raycaster.ray.origin;
        const currentPos = new Vector3();

        // Altitude of the ray point above the terrain (<= 0 once the ray has
        // reached or penetrated the surface), or null where the point cannot
        // be unprojected.
        const sampleAboveTerrain = (distance: number): number | null => {
            currentPos.copy(origin).addScaledVector(direction, distance);
            const geoPos = projection.unprojectPoint(currentPos);
            if (!geoPos) {
                return null;
            }
            const terrainHeight = elevationProvider.getHeight(geoPos) ?? 0;
            return geoPos.altitude - (terrainHeight + 0.001);
        };

        const emitHit = (distance: number): void => {
            // emit a fresh point (never reuse currentPos — consumers keep the
            // reference)
            currentPos.copy(origin).addScaledVector(direction, distance);
            intersections.push({
                distance,
                point: new Vector3().copy(currentPos).sub(this.mapView.camera.position),
                object: terrainCollisionObject
            });
        };

        // Already at or below the surface at the ray origin: report
        // immediately, same as the old marcher's first iteration.
        const aboveAtOrigin = sampleAboveTerrain(0);
        if (aboveAtOrigin !== null && aboveAtOrigin <= 0) {
            emitHit(0);
            return;
        }

        // Exponential strides to bracket the first penetration.
        let lowDistance = 0;
        let belowDistance = -1;
        for (let distance = 1; distance <= maxDistance; distance *= 2) {
            const above = sampleAboveTerrain(distance);
            if (above !== null && above <= 0) {
                belowDistance = distance;
                break;
            }
            if (above !== null) {
                lowDistance = distance;
            }
        }

        if (belowDistance < 0) {
            return; // ray never reaches the terrain within maxDistance
        }

        // Bisect the bracket down to sub-meter precision.
        for (let i = 0; i < bisectionIterations; i++) {
            const mid = (lowDistance + belowDistance) / 2;
            const aboveMid = sampleAboveTerrain(mid);
            if (aboveMid === null || aboveMid > 0) {
                lowDistance = mid;
            } else {
                belowDistance = mid;
            }
        }

        emitHit(belowDistance);
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
        const [minZoom, maxZoom] = this.getTerrainLevelRange();

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

        const levelOffset =
            tileKey.level -
            (stage.isLast ? Math.max(stage.minLevel, tileKey.level) : stage.minLevel);
        const parentKey = TileKey.fromRowColumnLevel(
            tileKey.row >> levelOffset,
            tileKey.column >> levelOffset,
            stage.minLevel
        );
        return (
            this.dataProvider().hasResource(parentKey) ||
            (tileKey.level > maxZoom && super.shouldSubdivide(zoomLevel, tileKey))
        );
    }

    canGetTile(zoomLevel: number, tileKey: TileKey): boolean {
        return !this.m_exclusionManager.shouldExclude(tileKey);
    }

    /**
     * Cleans up resources and disposes of the terrain source
     */
    dispose(): void {
        this.m_disposing = true;
        super.dispose();
        this.m_fadePins.clear();
        this.m_tileCache.removeAllTiles();
        this.m_layerMeshCache.forEach(preserved => {
            preserved.meshes.forEach(mesh => {
                mesh.dispose();
            });
            preserved.state.dispose();
        });
        this.m_layerMeshCache.clear();
    }
}
