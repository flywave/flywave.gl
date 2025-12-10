/* Copyright (C) 2025 flywave.gl contributors */

import { type DracoLoaderOptions } from "@flywave/flywave-draco";
import { LRUCache } from "@flywave/flywave-utils/LRUCache";
import { PriorityQueue } from "@flywave/flywave-utils/PriorityQueue";
import { throttle } from "@flywave/flywave-utils/throttle";

import { load3DTiles, loadSubtree } from "../loader";
import {
    type Subtree,
    type Tiles3DTileContent,
    type Tiles3DTilesetJSONPostprocessed,
    TILE_REFINEMENT
} from "../loader/types";
import { getUrlExtension } from "../utilities/urlExtension";
import { type LoadState, FAILED, LOADED, LOADING, PARSING, UNLOADED } from "./constants";
import { expandSubtree } from "./ResloveSubtree";
import { type ITile, type SubTreeTile, type Tile, type TileInternal, TileSet } from "./Tile";
import {
    type ViewErrorTarget,
    markUsedSetLeaves,
    markUsedTiles,
    markVisibleTiles,
    toggleTiles,
    traverseSet
} from "./traverseFunctions";

/**
 * Statistics object for tracking tile loading and rendering status
 */
interface Stats {
    /**
     * Number of tiles cached since load completion
     */
    inCacheSinceLoad?: number;

    /**
     * Number of tiles currently in cache
     */
    inCache?: number;

    /**
     * Number of tiles currently being parsed
     */
    parsing: number;

    /**
     * Number of tiles currently being downloaded
     */
    downloading: number;

    /**
     * Number of tiles that failed to load
     */
    failed: number;

    /**
     * Number of tiles currently in the camera frustum
     */
    inFrustum: number;

    /**
     * Number of tiles currently used
     */
    used: number;

    /**
     * Number of tiles currently active
     */
    active: number;

    /**
     * Number of tiles currently visible
     */
    visible: number;
}

/**
 * Base class for 3D Tiles renderers with core functionality for loading,
 * managing, and rendering tilesets.
 *
 * This class provides the foundational infrastructure for 3D Tiles rendering,
 * including:
 * - Tile loading and management using LRU cache
 * - Hierarchical tile traversal and refinement
 * - Priority-based downloading and parsing queues
 * - Memory management and resource disposal
 * - Event dispatching for loading progress and errors
 */
export class TilesRendererBase {
    // Internal state
    /**
     * Error threshold for tile loading (deprecated)
     */
    private _errorThreshold: number = Infinity;

    /**
     * Loading state of the root tileset
     */
    private rootLoadingState: LoadState = UNLOADED;

    /**
     * Root tileset object
     */
    protected rootTileSet: TileSet | null = null;

    /**
     * URL of the root tileset
     */
    private readonly rootURL: string | null;

    /**
     * Fetch options for tile requests
     */
    protected fetchOptions: RequestInit = {};

    /**
     * Tiles queued for download
     */
    private readonly queuedTiles: ITile[] = [];

    /**
     * Set of tiles cached since load completion
     */
    private readonly cachedSinceLoadComplete = new Set<ITile>();

    /**
     * Whether the renderer is currently loading tiles
     */
    private isLoading: boolean = false;

    /**
     * Frame counter for tracking updates
     */
    public frameCount: number = 0;

    /**
     * Optional URL preprocessing function
     */
    public preprocessURL?: (url: string, parent?: ITile) => string;

    // Core components
    /**
     * LRU cache for tile management
     */
    public readonly lruCache: LRUCache<ITile>;

    /**
     * Priority queue for tile downloads
     */
    public readonly downloadQueue: PriorityQueue<ITile>;

    /**
     * Priority queue for tile parsing
     */
    public readonly parseQueue: PriorityQueue<ITile>;

    /**
     * Priority queue for node processing
     */
    public readonly processNodeQueue: PriorityQueue<ITile>;

    // Tile tracking sets
    /**
     * Set of currently visible tiles
     */
    public readonly visibleTiles = new Set<ITile>();

    /**
     * Set of currently active tiles
     */
    public readonly activeTiles = new Set<ITile>();

    /**
     * Set of currently used tiles
     */
    public readonly usedSet = new Set<ITile>();

    protected get dracoPath(): string | undefined {
        throw new Error("dracoPath must be implemented in derived classes");
    }

    // Statistics
    /**
     * Statistics object for tracking tile loading and rendering status
     */
    public stats: Stats = {
        inCacheSinceLoad: 0,
        inCache: 0,
        parsing: 0,
        downloading: 0,
        failed: 0,
        inFrustum: 0,
        used: 0,
        active: 0,
        visible: 0
    };

    // Configuration options
    /**
     * Error target for level-of-detail calculations
     */
    public errorTarget: number = 16.0;

    /**
     * Whether to display active tiles
     */
    public displayActiveTiles: boolean = false;

    /**
     * Maximum depth for tile traversal
     */
    public maxDepth: number = Infinity;

    // Throttled event dispatcher
    /**
     * Throttled function for dispatching needs-update events
     */
    private readonly _dispatchNeedsUpdateEvent: () => void;

    /**
     * Gets the root tile of the tileset
     * @returns The root tile or null if not loaded
     */
    get root(): ITile | null {
        const tileSet = this.rootTileSet;
        return tileSet ? tileSet.root : null;
    }

    /**
     * Gets the current loading progress (0 to 1)
     * @returns Loading progress as a value between 0 and 1
     */
    get loadProgress(): number {
        const { stats, isLoading } = this;
        const loading = stats.downloading + stats.parsing;
        const total = stats.inCacheSinceLoad + (isLoading ? 1 : 0);
        return total === 0 ? 1.0 : 1.0 - loading / total;
    }

    /**
     * Gets the error threshold (deprecated)
     * @returns The error threshold value
     */
    get errorThreshold(): number {
        return this._errorThreshold;
    }

    /**
     * Sets the error threshold (deprecated)
     * @param v The new error threshold value
     */
    set errorThreshold(v: number) {
        // warn('TilesRenderer: The "errorThreshold" option has been deprecated.');
        this._errorThreshold = v;
    }

    /**
     * Creates a new TilesRendererBase instance
     * @param url The URL of the root tileset (optional)
     */
    constructor(url: string | null = null) {
        this.rootURL = url;

        // Initialize LRU cache for tile management
        this.lruCache = new LRUCache<Tile>();
        this.lruCache.unloadPriorityCallback = lruPriorityCallback;

        // Initialize queues with different concurrency levels
        this.downloadQueue = new PriorityQueue<Tile>();
        this.downloadQueue.maxJobs = 10;
        this.downloadQueue.priorityCallback = priorityCallback;

        this.parseQueue = new PriorityQueue<Tile>();
        this.parseQueue.maxJobs = 1;
        this.parseQueue.priorityCallback = priorityCallback;

        this.processNodeQueue = new PriorityQueue<Tile>();
        this.processNodeQueue.maxJobs = 25;
        this.processNodeQueue.priorityCallback = priorityCallback;

        // Throttle the needs-update event
        this._dispatchNeedsUpdateEvent = throttle(() => {
            this.dispatchEvent({ type: "needs-update" });
        });
    }

    /**
     * Traverses the tile hierarchy
     * @param beforecb Callback before visiting children
     * @param aftercb Callback after visiting children
     * @param ensureFullyProcessed Whether to ensure children are preprocessed
     */
    traverse(
        beforecb?: (tile: TileInternal, ...args: any[]) => boolean | void,
        aftercb?: (tile: TileInternal, ...args: any[]) => void,
        ensureFullyProcessed: boolean = true
    ): void {
        if (!this.root) return;

        traverseSet(
            this.root as TileInternal,
            (tile, ...args) => {
                if (ensureFullyProcessed) {
                    this.ensureChildrenArePreprocessed(tile, true);
                }
                return beforecb ? beforecb(tile, ...args) : false;
            },
            aftercb
        );
    }

    /**
     * Queues a tile for download
     * @param tile The tile to queue
     */
    queueTileForDownload(tile: TileInternal): void {
        if (tile.__loadingState !== UNLOADED) {
            return;
        }
        this.queuedTiles.push(tile);
    }

    /**
     * Marks a tile as used (preventing it from being unloaded)
     * @param tile The tile to mark
     */
    markTileUsed(tile: ITile): void {
        this.usedSet.add(tile);
        this.lruCache.markUsed(tile);
    }

    /**
     * Main update function that should be called every frame
     *
     * This function performs the core tile loading and rendering logic:
     * - Loads the root tileset if not already loaded
     * - Updates tile states based on camera visibility
     * - Loads queued tiles
     * - Unloads unused tiles
     * - Dispatches events for loading progress
     */
    update(): void {
        const { lruCache, usedSet, stats, root, downloadQueue, parseQueue, processNodeQueue } =
            this;

        // Load root tileset if not already loaded
        if (this.rootLoadingState === UNLOADED) {
            this.rootLoadingState = LOADING;
            this.loadRootTileSet()
                .then((root: TileSet) => {
                    const processedUrl = this.rootURL;
                    if (processedUrl !== null) {
                        this.preprocessURL?.(processedUrl, null);
                    }
                    this.rootLoadingState = LOADED;
                    this.rootTileSet = root;
                    this.dispatchEvent({ type: "needs-update" });
                    this.dispatchEvent({ type: "load-content" });
                    this.dispatchEvent({
                        type: "load-tile-set",
                        tileSet: root,
                        url: processedUrl
                    });
                })
                .catch(error => {
                    this.rootLoadingState = FAILED;
                    // console.error(error);
                    this.rootTileSet = null;
                    this.dispatchEvent({
                        type: "load-error",
                        tile: null,
                        error,
                        url: this.rootURL
                    });
                });
        }

        if (!root) {
            return;
        }

        // Reset frame statistics
        stats.inFrustum = 0;
        stats.used = 0;
        stats.active = 0;
        stats.visible = 0;
        this.frameCount++;

        // Clear used tiles from previous frame
        usedSet.forEach(tile => lruCache.markUnused(tile));
        usedSet.clear();

        // Traverse and update tile states
        markUsedTiles(root as TileInternal, this);
        markUsedSetLeaves(root as TileInternal, this);
        markVisibleTiles(root as TileInternal, this);
        toggleTiles(root as TileInternal, this);

        // Sort and load queued tiles
        const queuedTiles = this.queuedTiles;
        queuedTiles.sort(lruCache.unloadPriorityCallback);
        for (let i = 0, l = queuedTiles.length; i < l && !lruCache.isFull(); i++) {
            this.requestTileContents(queuedTiles[i] as TileInternal);
        }
        queuedTiles.length = 0;

        // Schedule unloading of unused tiles
        lruCache.scheduleUnload();

        // Check if loading has completed
        const runningTasks =
            downloadQueue.running || parseQueue.running || processNodeQueue.running;
        if (runningTasks === false && this.isLoading === true) {
            this.cachedSinceLoadComplete.clear();
            stats.inCacheSinceLoad = 0;
            this.dispatchEvent({ type: "tiles-load-end" });
            this.isLoading = false;
        }
    }

    /**
     * Resets tiles that failed to load
     *
     * This function resets the loading state of failed tiles and the root tileset
     * so they can be retried.
     */
    resetFailedTiles(): void {
        // Reset root tile if it failed
        if (this.rootLoadingState === FAILED) {
            this.rootLoadingState = UNLOADED;
        }

        const stats = this.stats;
        if (stats.failed === 0) {
            return;
        }

        // Traverse and reset failed tiles
        this.traverse(
            tile => {
                if (tile.__loadingState === FAILED) {
                    tile.__loadingState = UNLOADED;
                }
            },
            null,
            false
        );

        stats.failed = 0;
    }

    /**
     * Disposes of all resources
     *
     * This function cleans up all tiles and resets statistics.
     */
    dispose(): void {
        const lruCache = this.lruCache;

        // Collect all tiles for disposal
        const toRemove: ITile[] = [];
        this.traverse(
            t => {
                toRemove.push(t);
                return false;
            },
            null,
            false
        );

        // Remove all tiles from cache
        for (let i = 0, l = toRemove.length; i < l; i++) {
            lruCache.remove(toRemove[i]);
        }

        // Reset statistics
        this.stats = {
            parsing: 0,
            downloading: 0,
            failed: 0,
            inFrustum: 0,
            used: 0,
            active: 0,
            visible: 0
        };
        this.frameCount = 0;
    }

    /**
     * Dispatches an event (to be overridden by subclasses)
     * @param e The event to dispatch
     */
    dispatchEvent(e: any): void {
        // To be overridden for dispatching via an event system
    }

    /**
     * Fetches tileset JSON data from a URL
     * @param url The URL to fetch
     * @param options Fetch options
     * @returns A promise with the tileset data
     */
    fetchTileJson(url: string, fetchOptions: RequestInit): Promise<TileSet> {
        return load3DTiles(
            url,
            {
                draco: {
                    libraryPath: this.dracoPath
                },
                "3d-tiles": {
                    isTileset: true
                }
            },
            fetchOptions
        ).then((json: Tiles3DTilesetJSONPostprocessed) => {
            return new TileSet(json);
        }) as Promise<TileSet>;
    }

    /**
     * Fetches subtree data from a URL
     * @param url The URL to fetch
     * @param options Fetch options
     * @returns A promise with the subtree data
     */
    fetchSubtreeTile(url: string, fetchOptions: RequestInit): Promise<Subtree> {
        return loadSubtree(url);
    }

    /**
     * Fetches tile content from a URL
     * @param url The URL to fetch
     * @param options Fetch options
     * @returns A promise with the tile content
     */
    fetchTileContent(url: string, fetchOptions: RequestInit): Promise<Tiles3DTileContent> {
        return load3DTiles(
            url,
            {
                draco: {
                    libraryPath: this.dracoPath
                },
                "3d-tiles": {
                    loadGLTF: true
                }
            },
            fetchOptions
        ).then((json: Tiles3DTileContent) => {
            return json;
        }) as Promise<Tiles3DTileContent>;
    }

    /**
     * Parses tile content
     * @param content The content to parse
     * @param tile The tile being parsed
     * @param extension The file extension
     * @param uri The URI of the content
     * @param signal Abort signal for cancellation
     * @returns A promise that resolves when parsing is complete
     */
    parseTile(
        content: Tiles3DTileContent,
        tile: Tile,
        extension: string,
        uri: string,
        signal: AbortSignal
    ): Promise<void> {
        let promise: Promise<void> = this.parseTileSubtree(content, tile, extension, uri, signal);
        if (promise) {
            promise = Promise.resolve();
        }

        return promise;
    }

    /**
     * Parses subtree tile content
     * @param content The content to parse
     * @param tile The tile being parsed
     * @param extension The file extension
     * @param uri The URI of the content
     * @param signal Abort signal for cancellation
     * @returns A promise that resolves when parsing is complete, or undefined if not applicable
     */
    protected parseTileSubtree(
        content: Tiles3DTileContent,
        tile: ITile,
        extension: string,
        uri: string,
        signal: AbortSignal
    ): Promise<void> | undefined {
        if (/^subtree$/i.test(extension)) {
            return loadSubtree(uri).then((subtree: Subtree) => {
                expandSubtree(tile as SubTreeTile, subtree);
                return Promise.resolve();
            });
        }
    }

    /**
     * Disposes of tile resources
     * @param tile The tile to dispose
     */
    disposeTile(tile: ITile): void {
        // Hide tile if visible
        if (tile.__visible) {
            this.setTileVisible(tile, false);
            tile.__visible = false;
        }

        // Deactivate tile if active
        if (tile.__active) {
            this.setTileActive(tile, false);
            tile.__active = false;
        }
    }

    /**
     * Preprocesses a tile node
     *
     * This function initializes tile properties and prepares the tile for rendering.
     * @param tile The tile to preprocess
     * @param tileSetDir The base directory of the tileset
     * @param parentTile The parent tile (optional)
     */
    preprocessNode(
        tile: TileInternal,
        tileSetDir: string,
        parentTile: TileInternal | null = null
    ): void {
        if (tile.content) {
            // Fix old file formats
            if (!tile.content.uri && tile.content.url) {
                tile.content.uri = tile.content.url;
                delete tile.content.url;
            }

            // Fix cases where bounding volume is present but empty
            if (
                tile.content.boundingVolume &&
                !(
                    "box" in tile.content.boundingVolume ||
                    "sphere" in tile.content.boundingVolume ||
                    "region" in tile.content.boundingVolume
                )
            ) {
                delete tile.content.boundingVolume;
            }
        }

        tile.parent = parentTile;

        // Determine content type
        if (tile.content?.uri) {
            const extension = getUrlExtension(tile.content.uri);
            tile.__hasContent = true;
            tile.__hasUnrenderableContent = Boolean(extension && /json$/.test(extension));
            tile.__hasRenderableContent = !tile.__hasUnrenderableContent;
        } else {
            tile.__hasContent = false;
            tile.__hasUnrenderableContent = false;
            tile.__hasRenderableContent = false;
        }

        // Initialize tile state
        tile.__childrenProcessed = 0;
        if (parentTile) {
            parentTile.__childrenProcessed++;
        }

        tile.__distanceFromCamera = Infinity;
        tile.__error = Infinity;
        tile.__inFrustum = false;
        tile.__isLeaf = false;
        tile.__usedLastFrame = false;
        tile.__used = false;
        tile.__wasSetVisible = false;
        tile.__visible = false;
        tile.__childrenWereVisible = false;
        tile.__allChildrenLoaded = false;
        tile.__wasSetActive = false;
        tile.__active = false;
        tile.__loadingState = UNLOADED;

        // Set depth and refine mode
        if (parentTile === null) {
            tile.__depth = 0;
            tile.__depthFromRenderedParent = tile.__hasRenderableContent ? 1 : 0;
            tile.refine = tile.refine || TILE_REFINEMENT.REPLACE;
        } else {
            tile.__depth = parentTile.__depth + 1;
            tile.__depthFromRenderedParent =
                parentTile.__depthFromRenderedParent + (tile.__hasRenderableContent ? 1 : 0);
            tile.refine = tile.refine || parentTile.refine;
        }

        tile.__basePath = tileSetDir;
        tile.__lastFrameVisited = -1;

        // Allow plugins to preprocess the node
        this.preprocessSubtreeNode(tile as SubTreeTile);
    }

    /**
     * Preprocesses a subtree node
     * @param tile The subtree tile to preprocess
     */
    private preprocessSubtreeNode(tile: SubTreeTile) {
        if (tile.implicitTiling) {
            tile.__hasUnrenderableContent = true;
            tile.__hasRenderableContent = false;

            // Declare some properties
            tile.__subtreeIdx = 0; // Idx of the tile in its subtree
            tile.__implicitRoot = tile; // Keep this tile as an Implicit Root Tile

            // Coords of the tile
            tile.__x = 0;
            tile.__y = 0;
            tile.__z = 0;
            tile.__level = 0;
        } else if (/.subtree$/i.test(tile.content?.uri)) {
            // Handling content uri pointing to a subtree file
            tile.__hasUnrenderableContent = true;
            tile.__hasRenderableContent = false;
        }
    }

    /**
     * Sets a tile's active state
     * @param tile The tile to update
     * @param active Whether the tile is active
     */
    setTileActive(tile: ITile, active: boolean): void {
        active ? this.activeTiles.add(tile) : this.activeTiles.delete(tile);
    }

    /**
     * Sets a tile's visibility state
     * @param tile The tile to update
     * @param visible Whether the tile is visible
     */
    setTileVisible(tile: ITile, visible: boolean): void {
        visible ? this.visibleTiles.add(tile) : this.visibleTiles.delete(tile);
    }

    /**
     * Calculates the screen space error for a tile
     * @param tile The tile to calculate for
     * @param target The target error value
     */
    calculateTileViewError(tile: ITile, target: ViewErrorTarget): void {
        // To be implemented by subclasses
    }

    /**
     * Ensures children tiles are preprocessed
     * @param tile The parent tile
     * @param immediate Whether to process immediately
     */
    ensureChildrenArePreprocessed(tile: TileInternal, immediate: boolean = false): void {
        const children = tile.children || [];
        for (let i = 0, l = children.length; i < l; i++) {
            const child = children[i];
            if ("__depth" in child) {
                // Child already processed
                break;
            } else if (immediate) {
                // Process immediately
                this.processNodeQueue.remove(child);
                this.preprocessNode(child, tile.__basePath || "", tile);
            } else {
                // Queue for processing
                if (!this.processNodeQueue.has(child)) {
                    this.processNodeQueue.add(child, (child: TileInternal) => {
                        this.preprocessNode(child, tile.__basePath || "", tile);
                        this._dispatchNeedsUpdateEvent();
                    });
                }
            }
        }
    }

    /**
     * Preprocesses a tileset JSON
     * @param json The tileset JSON
     * @param url The tileset URL
     * @param parent The parent tile (optional)
     */
    private preprocessTileSet(
        json: TileSet,
        url: string,
        parent: TileInternal | null = null
    ): void {
        const version = json.asset?.version;
        if (version) {
            const [major, minor] = version.split(".").map(v => parseInt(v));
            console.assert(
                major <= 1,
                "TilesRenderer: asset.version is expected to be a 1.x or a compatible version."
            );

            if (major === 1 && minor > 0) {
                console.warn(
                    "TilesRenderer: tiles versions at 1.1 or higher have limited support. Some new extensions and features may not be supported."
                );
            }
        }

        // Determine base path
        let basePath = url.replace(/\/[^/]*$/, "");
        basePath = new URL(basePath, window.location.href).toString();
        this.preprocessNode(json.root as TileInternal, basePath, parent);
    }

    /**
     * Preprocesses a subtree URL
     * @param url The URL to preprocess
     * @param tile The subtree tile
     * @returns The preprocessed URL
     */
    private preprocessSubtreeURL(url: string, tile: SubTreeTile) {
        if (tile && tile.implicitTiling) {
            const implicitUri = tile.implicitTiling.subtrees.uri
                .replace("{level}", tile.__level.toString())
                .replace("{x}", tile.__x.toString())
                .replace("{y}", tile.__y.toString())
                .replace("{z}", tile.__z.toString());

            return new URL(implicitUri, tile.__basePath + "/").toString();
        }

        return url;
    }

    /**
     * Loads the root tileset
     * @returns A promise with the loaded tileset
     */
    protected loadRootTileSet(): Promise<TileSet> {
        // Preprocess URL
        let processedUrl = this.rootURL;

        processedUrl =
            this.preprocessSubtreeURL?.(processedUrl, this.root as SubTreeTile) || processedUrl;
        this.preprocessURL?.(processedUrl, null);

        // Load tileset
        const pr = this.fetchTileJson(processedUrl, this.fetchOptions).then((root: TileSet) => {
            if (processedUrl) {
                this.preprocessTileSet(root, processedUrl);
            }
            return root;
        });

        return pr as Promise<TileSet>;
    }

    /**
     * Requests tile contents to be loaded
     *
     * This function manages the tile loading process, including:
     * - Adding tiles to the LRU cache
     * - Downloading tile content
     * - Parsing tile content
     * - Handling loading errors
     * - Dispatching events for loading progress
     * @param tile The tile to load
     */
    private requestTileContents(tile: TileInternal): void {
        if (tile.__loadingState !== UNLOADED || !tile.content?.uri) {
            return;
        }

        let isExternalTileSet = false;
        let externalTileset: TileSet | null = null;
        let uri = new URL(tile.content.uri, tile.__basePath + "/").toString();

        uri = this.preprocessSubtreeURL(uri, tile as SubTreeTile) || uri;
        if (this.preprocessURL) {
            uri = this.preprocessURL(uri, tile);
        }

        const stats = this.stats;
        const lruCache = this.lruCache;
        const downloadQueue = this.downloadQueue;
        const parseQueue = this.parseQueue;
        const extension = getUrlExtension(uri);

        // Set up abort controller for cancellation
        const controller = new AbortController();
        const signal = controller.signal;
        const addedSuccessfully = lruCache.add(tile, (t: TileInternal) => {
            // Cleanup when tile is unloaded
            controller.abort();

            if (isExternalTileSet) {
                t.children.length = 0;
                t.__childrenProcessed = 0;
            } else {
                this.disposeTile(t);
            }

            // Update stats
            stats.inCache--;
            if (this.cachedSinceLoadComplete.has(tile)) {
                this.cachedSinceLoadComplete.delete(tile);
                stats.inCacheSinceLoad--;
            }

            if (t.__loadingState === LOADING) {
                stats.downloading--;
            } else if (t.__loadingState === PARSING) {
                stats.parsing--;
            }

            t.__loadingState = UNLOADED;
            parseQueue.remove(t);
            downloadQueue.remove(t);
        });

        if (!addedSuccessfully) {
            return;
        }

        // Notify loading start
        if (!this.isLoading) {
            this.isLoading = true;
            this.dispatchEvent({ type: "tiles-load-start" });
        }

        this.cachedSinceLoadComplete.add(tile);
        stats.inCacheSinceLoad++;
        stats.inCache++;
        stats.downloading++;
        tile.__loadingState = LOADING;

        // Start download process
        downloadQueue
            .add(
                tile,
                async (
                    downloadTile: Tile
                ): Promise<TileSet | Tiles3DTileContent | Subtree | undefined> => {
                    if (signal.aborted) {
                        return await Promise.resolve(undefined);
                    }

                    let res: TileSet | Tiles3DTileContent | Subtree | undefined;
                    if (extension === "json") {
                        res = await this.fetchTileJson(uri, { ...this.fetchOptions, signal });
                    } else {
                        if (extension === "subtree") {
                            res = await this.fetchSubtreeTile(uri, {
                                ...this.fetchOptions,
                                signal
                            });
                        } else {
                            res = await this.fetchTileContent(uri, {
                                ...this.fetchOptions,
                                signal
                            });
                        }
                    }
                    this.dispatchEvent({ type: "tile-download-start", tile });
                    return res;
                }
            )
            .then((content: TileSet | Tiles3DTileContent | Subtree | undefined) => {
                if (signal.aborted) {
                    return;
                }

                stats.downloading--;
                stats.parsing++;
                tile.__loadingState = PARSING;

                return parseQueue.add(tile, (parseTile: Tile) => {
                    if (signal.aborted) {
                        return Promise.resolve();
                    }

                    if (extension === "json" && (content as TileSet).root) {
                        this.preprocessTileSet(content as TileSet, uri, tile);
                        tile.children.push((content as TileSet).root as TileInternal);
                        externalTileset = content as TileSet;
                        isExternalTileSet = true;
                        return Promise.resolve();
                    } else {
                        return this.parseTile(
                            content as Tiles3DTileContent,
                            parseTile,
                            extension,
                            uri,
                            signal
                        );
                    }
                });
            })
            .then(() => {
                if (signal.aborted) {
                    return;
                }

                stats.parsing--;
                tile.__loadingState = LOADED;
                lruCache.setLoaded(tile, true);

                // Check memory usage
                if (lruCache.getMemoryUsage(tile) === null) {
                    if (lruCache.isFull() && lruCache.computeMemoryUsageCallback(tile) > 0) {
                        lruCache.remove(tile);
                    } else {
                        lruCache.updateMemoryUsage(tile);
                    }
                }

                // Dispatch events
                this.dispatchEvent({ type: "needs-update" });
                this.dispatchEvent({ type: "load-content" });
                if (isExternalTileSet) {
                    this.dispatchEvent({
                        type: "load-tile-set",
                        tileSet: externalTileset,
                        url: uri
                    });
                }
                if (tile.cached?.scene) {
                    this.dispatchEvent({
                        type: "load-model",
                        scene: tile.cached.scene,
                        tile
                    });
                }
            })
            .catch(error => {
                if (signal.aborted) {
                    return;
                }

                if (error.name !== "AbortError") {
                    parseQueue.remove(tile);
                    downloadQueue.remove(tile);

                    if (tile.__loadingState === PARSING) {
                        stats.parsing--;
                    } else if (tile.__loadingState === LOADING) {
                        stats.downloading--;
                    }

                    stats.failed++;

                    // console.error(
                    //     `TilesRenderer : Failed to load tile at url "${tile.content?.uri}".`
                    // );
                    // console.error(error);
                    tile.__loadingState = FAILED;
                    lruCache.setLoaded(tile, true);

                    this.dispatchEvent({
                        type: "load-error",
                        tile,
                        error,
                        url: uri
                    });
                } else {
                    lruCache.remove(tile);
                }
            });
    }
}

/**
 * Priority queue sort function for tile loading
 *
 * This function determines the priority of tiles for loading based on:
 * - Depth from rendered parent (shallower tiles first)
 * - Frustum visibility
 * - Usage status
 * - Error value
 * - Distance from camera
 * @param a First tile to compare
 * @param b Second tile to compare
 * @returns Comparison result (-1, 0, or 1)
 */
function priorityCallback(a: Tile, b: Tile): number {
    if (a.__depthFromRenderedParent !== b.__depthFromRenderedParent) {
        // load shallower tiles first using "depth from rendered parent" to help
        // even out depth disparities caused by non-content parent tiles
        return a.__depthFromRenderedParent > b.__depthFromRenderedParent ? -1 : 1;
    } else if (a.__inFrustum !== b.__inFrustum) {
        // load tiles that are in the frustum at the current depth
        return a.__inFrustum ? 1 : -1;
    } else if (a.__used !== b.__used) {
        // load tiles that have been used
        return a.__used ? 1 : -1;
    } else if (a.__error !== b.__error) {
        // load the tile with the higher error
        return a.__error > b.__error ? 1 : -1;
    } else if (a.__distanceFromCamera !== b.__distanceFromCamera) {
        // and finally visible tiles which have equal error (ex: if geometricError === 0)
        // should prioritize based on distance.
        return a.__distanceFromCamera > b.__distanceFromCamera ? -1 : 1;
    }
    return 0;
}

/**
 * LRU cache sort function for tile unloading
 *
 * This function determines the priority of tiles for unloading based on:
 * - Depth from rendered parent (deeper tiles first)
 * - Loading state
 * - Last frame visited
 * - Content type
 * - Error value
 * @param a First tile to compare
 * @param b Second tile to compare
 * @returns Comparison result (-1, 0, or 1)
 */
function lruPriorityCallback(a: TileInternal, b: TileInternal): number {
    if (a.__depthFromRenderedParent !== b.__depthFromRenderedParent) {
        // dispose of deeper tiles first
        return a.__depthFromRenderedParent > b.__depthFromRenderedParent ? 1 : -1;
    } else if (a.__loadingState !== b.__loadingState) {
        // dispose of tiles that are earlier along in the loading process first
        return a.__loadingState > b.__loadingState ? -1 : 1;
    } else if (a.__lastFrameVisited !== b.__lastFrameVisited) {
        // dispose of least recent tiles first
        return a.__lastFrameVisited > b.__lastFrameVisited ? -1 : 1;
    } else if (a.__hasUnrenderableContent !== b.__hasUnrenderableContent) {
        // dispose of external tile sets last
        return a.__hasUnrenderableContent ? -1 : 1;
    } else if (a.__error !== b.__error) {
        // unload the tile with lower error
        return a.__error > b.__error ? -1 : 1;
    }
    return 0;
}
