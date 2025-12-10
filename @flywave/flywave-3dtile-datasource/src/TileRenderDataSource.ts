/* Copyright (C) 2025 flywave.gl contributors */

import { Style, type FlatTheme, type Theme } from "@flywave/flywave-datasource-protocol";
import {
    type GeoBox,
    quadTreeSubdivisionScheme,
    type TileKey,
    TilingScheme,
    webMercatorProjection,
    webMercatorTilingScheme
} from "@flywave/flywave-geoutils";
import {
    type DataSourceOptions,
    type MapView,
    DataSource,
    Tile
} from "@flywave/flywave-mapview";
import { type IntersectParams } from "@flywave/flywave-mapview/IntersectParams";
import { ThemeLoader } from "@flywave/flywave-mapview/ThemeLoader";
import { Intersection, Raycaster, type Matrix4 } from "three";

import { type TileIntersection } from "./renderer/raycastTraverse";
import { type CustomAttributeConfig, Tiles3DStyleWatcher } from "./theme/Tiles3DStyleWatcher";
import { type TilesRendererOptions, TilesRenderer } from "./TilesRenderer";
import { ITile } from "./ObserveTileChange";

/**
 * Configuration options for batch animation effects
 */
export interface BatchAnimation {
    /**
     * Animation easing function
     * @default "linear"
     */
    easing?: "linear" | "ease-in" | "ease-out" | "ease-in-out";

    /**
     * Animation duration in milliseconds
     */
    duration: number;

}

/**
 * Configuration options for the TileRenderDataSource
 */
export interface TileRenderDataSourceOptions extends DataSourceOptions {
    /**
     * The URL to the 3D Tiles tileset.json file
     */
    url: string;

    /**
     * Transform matrix for server data
     */
    transform?: Matrix4;

    /**
     * Optional HTTP headers for tile requests
     */
    headers?: HeadersInit;

    /**
     * Whether to enable debug visualization
     */
    enableDebug?: boolean;

    /**
     * Custom tiling scheme. Defaults to Web Mercator.
     */
    tilingScheme?: TilingScheme;

    /**
     * Maximum number of concurrent tile requests
     */
    maxConcurrentRequests?: number;

    /**
     * Error threshold for level-of-detail calculations
     */
    errorTarget?: number;

    /**
     * Custom attribute configuration for batch tables
     */
    customAttributeConfig?: CustomAttributeConfig;

    /**
     * 3D Tiles batch animation configuration
     */
    animation?: BatchAnimation;

    /**
     * Whether to enable debug visualization of bounding volumes
     */
    debugBoundingVolume?: boolean;
}

class RootTile extends Tile {
    constructor(tileKey: TileKey, dataSource: TileRenderDataSource) {
        super(dataSource, tileKey);
    }

    raycast(rayCaster: Raycaster, intersects: Intersection[], recursive?: boolean): void {
        (this.dataSource as TileRenderDataSource).raycast(rayCaster, intersects as TileIntersection[]);
    }
}

/**
 * A DataSource implementation for rendering 3D Tiles datasets in flywave.gl
 *
 * This class integrates the 3D Tiles renderer with flywave.gl's MapView system,
 * providing seamless loading and rendering of 3D Tiles content with support for
 * styling, animation, and interaction.
 *
 * The data source handles:
 * - Loading and parsing of 3D Tiles tilesets
 * - Integration with flywave.gl's theme system for styling
 * - Batch rendering for efficient visualization of large datasets
 * - Raycasting and picking for user interaction
 * - Animation effects for batched features
 */
export class TileRenderDataSource extends DataSource {
    private readonly m_tilingScheme: TilingScheme;
    private readonly m_tilesRenderer: TilesRenderer;
    private readonly m_options: TileRenderDataSourceOptions;
    private m_isConnected: boolean = false;
    private m_attachedMapView?: MapView;

    // Theme system related properties
    private m_currentTheme?: Theme;

    private readonly m_animation?: BatchAnimation;

    private m_styleWatcher?: Tiles3DStyleWatcher;

    /**
     * Creates a new TileRenderDataSource instance
     *
     * @param options - Configuration options for the data source
     */
    constructor(options: TileRenderDataSourceOptions) {
        super({
            name: "TileRenderDataSource",
            ...options,
            maxDataLevel: 0
        });

        this.m_options = options;
        this.m_tilingScheme = new TilingScheme(
            quadTreeSubdivisionScheme,
            webMercatorProjection
        );

        // Create the 3D Tiles renderer
        const rendererOptions: TilesRendererOptions = {
            url: options.url,
            headers: options.headers,
            transform: options.transform,
            debugBoundingVolume: options.debugBoundingVolume,
        };

        this.m_tilesRenderer = new TilesRenderer(rendererOptions);

        // Configure renderer settings
        if (options.errorTarget !== undefined) {
            this.m_tilesRenderer.errorTarget = options.errorTarget;
        } 

        // Set up event listeners
        this.setupEventListeners();

        // Configure DataSource properties
        this.cacheable = false; // 3D Tiles handles its own caching
        this.enablePicking = true;
        this.allowOverlappingTiles = true;

        this.m_animation = options.animation;
    }

    /**
     * Gets the batch animation configuration
     */
    get animation() {
        return this.m_animation;
    }

    /**
     * Sets the visibility of the 3D Tiles content
     * @param visible - Whether the content should be visible
     */
    setVisible(visible: boolean) {
        this.m_tilesRenderer.setVisible(visible);
    }

    /**
     * Returns the tiling scheme used by this data source
     * @returns The tiling scheme
     */
    getTilingScheme(): TilingScheme {
        return this.m_tilingScheme;
    }

    /**
     * Gets a tile for the given tile key
     *
     * Note: 3D Tiles uses its own tile management system, so this method
     * returns undefined as tiles are managed internally by the TilesRenderer.
     *
     * @param tileKey - The tile key identifying the requested tile
     * @param delayLoad - Whether to delay loading the tile
     * @returns undefined as 3D Tiles manages its own tiles
     */
    getTile(tileKey: TileKey, delayLoad?: boolean): Tile | undefined {
        // 3D Tiles uses its own tile management system
        // The actual tile rendering is handled by the TilesRenderer
        return new RootTile(tileKey, this);
    }

    /**
     * Called when the data source is attached to a MapView
     * @returns Promise that resolves when connection is complete
     */
    async connect(): Promise<void> {
        if (this.m_isConnected) {
            return;
        }

        // Wait for the MapView to be available
        await this.waitForMapView();

        if (this.m_attachedMapView) {
            // Connect the tiles renderer to the map view
            this.m_tilesRenderer.connectMapView(this.m_attachedMapView);

            // Wait for the root tile to load to get geometry bounds
            await this.updateGeometryBounds();

            this.m_isConnected = true;

            // Request initial update
            this.requestUpdate();
        }
    }

    /**
     * Called when the data source is attached to a MapView
     * @param mapView - The MapView instance
     */
    attach(mapView: MapView): void {
        super.attach(mapView);
        this.m_attachedMapView = mapView;
    }

    /**
     * Called when the data source is detached from a MapView
     * @param mapView - The MapView instance
     */
    detach(mapView: MapView): void {
        if (this.m_isConnected) {
            this.m_tilesRenderer.disconnectMapView();
            this.m_isConnected = false;
        }

        this.m_attachedMapView = undefined;
        super.detach(mapView);
    }

    /**
     * Disposes of the data source and cleans up resources
     */
    dispose(): void {
        if (this.m_isConnected) {
            this.m_tilesRenderer.disconnectMapView();
        }

        // Clean up the tiles renderer
        this.m_tilesRenderer.dispose();

        super.dispose();
    }

    /**
     * Returns whether the data source is ready to provide tiles
     * @returns True if the data source is ready
     */
    ready(): boolean {
        // Check if connected and tiles renderer is ready
        return this.m_isConnected && this.m_tilesRenderer.getRootTile() !== null;
    }

    /**
     * Apply the theme to this data source.
     *
     * This method integrates with flywave.gl's theme system to support
     * declarative styling of 3D Tiles content.
     *
     * @param theme - The Theme to be applied
     * @param languages - Optional languages for localization
     * @returns Promise that resolves when theme is applied
     */
    async setTheme(theme: Theme | FlatTheme, languages?: string[]): Promise<void> {
        // Load and resolve theme using ThemeLoader
        let loadedTheme: Theme;

        if (typeof theme === "string" || !this.isThemeLoaded(theme)) {
            loadedTheme = (await ThemeLoader.load(theme));
        } else {
            loadedTheme = theme as Theme;
        }
        // Store current theme
        this.m_currentTheme = loadedTheme;

        // Apply theme to existing tiles
        await this.applyThemeToExistingTiles();

        // Update languages if provided
        if (languages !== undefined) {
            this.setLanguages(languages);
        }

        // Clear tile cache to force re-rendering with new styles
        if (this.m_attachedMapView) {
            this.m_attachedMapView.clearTileCache(this.name);
        }

        // Request update
        this.requestUpdate();
    }


    /**
     * Add a new style to the style set.
     *
     * @param style - The style to add.
     * @returns The added style with generated identifier if needed.
     */
    addStyle(style: Style): Style {
        return this.m_styleWatcher.addStyle(style);
    }


    /**
     * Remove style by its identifier.
     *
     * @param id - The style identifier.
     * @returns `true` if style was found and removed, `false` otherwise.
     */
    removeStyleById(id: string): boolean {
        return this.m_styleWatcher.removeStyleById(id);
    }


    /**
     * Update style properties by its identifier.
     *
     * @param id - The style identifier.
     * @param updates - The style properties to update.
     * @returns `true` if style was found and updated, `false` otherwise.
     */
    updateStyleById(id: string, updates: Partial<Style>): boolean {
        return this.m_styleWatcher.updateStyleById(id, updates);
    }
    /**
     * Sets the theme from the base theme.
     *
     * This method is used to set the theme from the base theme.
     *
     * @param theme - The base theme to be applied
     * @param languages - Optional languages for localization
     * @returns Promise that resolves when theme is applied
     */
    async setThemeFromBase(theme: Theme, languages?: string[]): Promise<void> {
        await this.setTheme(this.m_currentTheme ? ThemeLoader["mergeThemes"](theme, this.m_currentTheme) : theme, languages);
    }

    /**
     * Gets the 3D Tiles renderer instance
     * @returns The TilesRenderer instance
     */
    get tilesRenderer(): TilesRenderer {
        return this.m_tilesRenderer;
    }

    /**
     * Gets the geographic extent of the tileset
     * @returns Promise that resolves to the GeoBox extent or undefined
     */
    async getGeoExtent(): Promise<GeoBox | undefined> {
        try {
            return await this.m_tilesRenderer.getRootTileBoundingVolumeRegion();
        } catch (error) {
            // console.warn("Failed to get geo extent:", error);
            return undefined;
        }
    } 
    /**
     * Sets up event listeners for the tiles renderer
     */
    private setupEventListeners(): void {
        // Listen for tile updates
        this.m_tilesRenderer.addEventListener("update", () => {
            this.requestUpdate();
            this.updateGeometryBounds();
        });

        // Listen for root tile loaded
        this.m_tilesRenderer.addEventListener("onRootNodeLoaded", () => {
            this.requestUpdate();
        });
    }

    /**
     * Waits for the MapView to be available
     * @returns Promise that resolves when MapView is available
     */
    private async waitForMapView(): Promise<void> {
        await new Promise<void>(resolve => {
            const checkMapView = () => {
                if (this.m_attachedMapView) {
                    resolve();
                } else {
                    setTimeout(checkMapView, 10);
                }
            };
            checkMapView();
        });
    }

    /**
     * Updates the geometry bounds based on the loaded tileset
     * @returns Promise that resolves when bounds are updated
     */
    private updateGeometryBounds(): void {
        try {
            const maxHeight = this.m_tilesRenderer.getMaxGeometryHeight();
            const minHeight = this.m_tilesRenderer.getMinGeometryHeight();

            if (maxHeight > 0) {
                this.maxGeometryHeight = maxHeight;
            }

            if (minHeight < 0) {
                this.minGeometryHeight = minHeight;
            }
        } catch (error) {
            // console.warn("Failed to update geometry bounds:", error);
        }
    }

    /**
     * Requests an update of the MapView
     */
    requestUpdate(): void {
        this.dispatchEvent({
            type: "update"
        });
    }

    /**
     * Check if theme is fully loaded
     * @param theme - The theme to check
     * @returns True if the theme is fully loaded
     */
    private isThemeLoaded(theme: any): boolean {
        return theme.extends === undefined && !Array.isArray(theme.styles);
    }

    /**
     * Apply theme to existing loaded tiles
     * @returns Promise that resolves when theme is applied
     */
    private async applyThemeToExistingTiles(): Promise<void> {
        if (!this.m_isConnected) {
            return;
        }

        if (!this.m_styleWatcher) {
            // Set up the style watcher to handle future tile loads
            this.setupStyleWatcher();
        } else {
            this.m_styleWatcher.updateTheme(this.m_currentTheme as Theme);
        }
    }

    /**
     * Set up style watcher for newly loaded tiles
     */
    private setupStyleWatcher(): void {
        if (!this.m_styleWatcher) {
            // Create a style watcher that applies styles to tiles as they load
            // Select style set and 3D Tiles configuration through styleSetName
            const styleWatcher = new Tiles3DStyleWatcher(
                this.m_currentTheme,
                this.styleSetName,
                this.mapView.mapRenderingManager,
                this.m_options.customAttributeConfig,
                this.m_animation
            );
            // Add the watcher to the tiles renderer
            // Note: This requires ObserveTileChange interface
            if (this.m_tilesRenderer.addObserveTileChange) {
                this.m_tilesRenderer.addObserveTileChange(styleWatcher);
            }

            this.m_styleWatcher = styleWatcher;
        }
    }

    /**
     * Performs raycasting for picking operations
     * @param raycaster - The raycaster to use
     * @param intersections - Array to store intersection results
     */
    raycast(raycaster: Raycaster, intersections: TileIntersection[]): void {
        this.m_tilesRenderer.raycast(raycaster, intersections);
    }

    /**
     * Intersects map objects at the given screen coordinates
     * @param x - Screen x coordinate
     * @param y - Screen y coordinate
     * @param parameters - Optional intersection parameters
     * @returns Array of tile intersections
     */
    intersectMapObjects(x: number, y: number, parameters?: IntersectParams): TileIntersection[] {
        const rayCaster = this.mapView.pickHandler.setupRaycaster(x, y);
        const intersects: TileIntersection[] = [];
        this.m_tilesRenderer.raycast(rayCaster, intersects);

        return intersects;
    }

    /**
     * Get the root tile of the tileset
     * @returns The root tile
     */
    async getRootTile(): Promise<ITile> {
        return this.m_tilesRenderer.getRootTile();
    }
}
