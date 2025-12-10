/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox, type Projection } from "@flywave/flywave-geoutils";
import { type MapView, MapViewEventNames } from "@flywave/flywave-mapview";
import { type ITilesRenderer } from "@flywave/flywave-mapview/ITilesRenderer";
import { type Raycaster, Matrix4, Object3D, Vector3 } from "three";

import { type ITile, type Tile, type TileInternal } from "./base/Tile";
import { type Tiles3DTileContent } from "./loader";
import { type Observe3DTileChange } from "./ObserveTileChange";
import { type TileIntersection } from "./renderer/raycastTraverse";
import { TilesRenderer as ThreeTilesRenderer } from "./renderer/TilesRenderer";

/**
 * Event name for TilesRenderer update events
 */
export const TilesRendererUpdateEvent = "update";

/**
 * Event name for root node loaded events
 */
export const TilesRendererRootOnLoadedEvent = "onRootNodeLoaded";

/**
 * Configuration options for the TilesRenderer
 */
export interface TilesRendererOptions {
    /**
     * The URL to the 3D Tiles tileset.json file
     */
    url: string;

    /**
     * Optional HTTP headers for tile requests
     */
    headers?: HeadersInit;

    /**
     * Transform matrix for the tileset
     */
    transform?: Matrix4;

    /**
     * Whether to enable debug visualization of bounding volumes
     */
    debugBoundingVolume?: boolean;


     /**
     * Size of points in the point cloud
     */
    pointSize?: number;
}

/**
 * 3D Tiles renderer that integrates with flywave.gl's MapView system
 *
 * This class extends the base Three.js TilesRenderer to provide integration
 * with flywave.gl's MapView, including:
 * - MapView camera integration
 * - Scene management
 * - Raycasting for picking
 * - Tile lifecycle management
 * - Geographic extent calculation
 * - Debug visualization support
 */
export class TilesRenderer extends ThreeTilesRenderer implements ITilesRenderer {
    private observeTileChange?: Observe3DTileChange[] = [];
    private rootTile?: ITile;
    public object: Object3D;
    private geoExtent?: GeoBox;
    private mapView?: MapView; 

    /**
     * Creates a new TilesRenderer instance
     * @param options - Configuration options for the renderer
     */
    constructor(private readonly options: TilesRendererOptions) {
        super(options.url);

        this.fetchOptions.headers = options.headers;

        this.object = new Object3D();

        this.object.add(this.group);
        this.errorTarget = 100;

        // Set debug visualization option
        this.debugBoundingVolume = options.debugBoundingVolume || false;

        // Set point size option
        this.pointSize = options.pointSize || 0.5;
    }

    protected get dracoPath() {
        return this.mapView?.uriResolver.resolveUri("resources/libs/draco");
    }

    /**
     * Performs the actual update of the 3D tiles
     * This method is called internally by the update() method
     */
    protected doUpdate() {
        const cameras = this.cameras;

        if (cameras.length === 0) {
            // console.warn("TilesRenderer: no cameras defined. Cannot update 3d tiles.");
            return;
        }

        super.update();

        this.activeTiles.forEach(tile => {
            if (tile.cached.boundingVolume.region) {
                if (!this.geoExtent) {
                    this.geoExtent = tile.cached.boundingVolume.region.clone();
                }
                this.geoExtent = this.geoExtent.merge(tile.cached.boundingVolume.region);
            }
        });
    }

    /**
     * Sets the visibility of the 3D tiles
     * @param visible - Whether the tiles should be visible
     */
    setVisible(visible: boolean) {
        this.object.visible = visible;
    }

    /**
     * Updates the 3D tiles renderer
     * This method should be called every frame to update the tiles
     */
    update(): void {
        if (this.object.visible && !this.mapView?.lockVisibleTileSet) this.doUpdate();
    }

    /**
     * Gets the maximum geometry height of the tileset
     * @returns The maximum geometry height in meters
     */
    getMaxGeometryHeight(): number {
        if (this.geoExtent) {
            return this.geoExtent.maxAltitude;
        }
        return 0;
    }

    /**
     * Gets the minimum geometry height of the tileset
     * @returns The minimum geometry height in meters
     */
    getMinGeometryHeight(): number {
        if (this.geoExtent) {
            return this.geoExtent.minAltitude;
        }
        return 0;
    }

    /**
     * Connects the renderer to a MapView
     * @param mapView - The MapView instance to connect to
     */
    connectMapView(mapView: MapView) {
        this.mapView = mapView;
        this.setCamera(mapView.camera);
        this.setResolutionFromRenderer(mapView.camera, mapView.renderer);
        mapView.addEventListener(MapViewEventNames.WillRender, this.update3DTileSource);

        mapView.scene.add(this.object);
    }

    /**
     * Disconnects the renderer from the MapView
     */
    disconnectMapView() {
        if (this.mapView) {
            this.mapView.scene.remove(this.object);
            this.mapView.removeEventListener(MapViewEventNames.WillRender, this.update3DTileSource);
        }
    }
 

    /**
     * Gets the projection used by the connected MapView
     * @returns The projection or undefined if not connected
     */
    protected getProjection(): Projection {
        return this.mapView?.projection;
    }

    /**
     * Adds an observer for tile change events
     * @param observeTileChange - The observer to add
     */
    addObserveTileChange = (observeTileChange: Observe3DTileChange) => {
        this.observeTileChange.push(observeTileChange);
        this.activeTiles.forEach(tile => {
            observeTileChange.watchTileChange(tile, this.activeTiles, true);
        });
    };

    /**
     * Removes an observer for tile change events
     * @param observeTileChange - The observer to remove
     */
    removeObserveTileChange = (observeTileChange: Observe3DTileChange) => {
        this.observeTileChange = this.observeTileChange.filter(item => item !== observeTileChange);
        observeTileChange.dispose();
    };

    /**
     * Sets the active state of a tile
     * @param tile - The tile to update
     * @param active - Whether the tile should be active
     */
    setTileActive(tile: Tile, active: boolean): void {
        super.setTileActive(tile, active);
        if (this.observeTileChange) {
            this.observeTileChange.forEach(item => {
                item.watchTileChange(tile, this.activeTiles, active);
            });
        }
    }

    /**
     * Performs raycasting for picking operations
     * @param raycaster - The raycaster to use
     * @param intersects - Array to store intersection results
     */
    raycast = (raycaster: Raycaster, intersects: TileIntersection[]): void => {
        const oldRayOrigin = new Vector3();
        oldRayOrigin.copy(raycaster.ray.origin);
        raycaster.ray.origin.copy(this.mapView.camera.position);
        this.object.position.set(0, 0, 0);
        this.object.updateMatrixWorld();

        const _intersects: TileIntersection[] = [];
        try {
            super.raycast(raycaster, _intersects);
        } catch (e) {
            // console.error("Raycast error:", e);
        }

        _intersects.forEach(e => {
            // Ensure each intersection object has a tile property
            if (!e.tile) {
                // If no tile property, try to get tile info from the object
                let obj = e.object;
                while (obj && !obj.userData?.tile) {
                    obj = obj.parent;
                }
                if (obj?.userData?.tile) {
                    e.tile = obj.userData.tile;
                }
            }
            e.point.sub(this.mapView.camera.position);
            intersects.push(e);
        });

        raycaster.ray.origin.copy(oldRayOrigin);
    };

    /**
     * Update callback for the 3D tile source
     * This method is called every frame to update the tile positions
     */
    private readonly update3DTileSource = (): void => {
        this.object.position.copy(this.mapView.camera.position.clone().negate());

        this.update();
        this.dispatchEvent({ type: TilesRendererUpdateEvent });
    };

    /**
     * Gets the bounding volume region of the root tile
     * @returns Promise that resolves to the GeoBox of the root tile's bounding volume
     */
    async getRootTileBoundingVolumeRegion(): Promise<GeoBox> {
        const tile = await this.getRootTile();
        if (!tile || !tile.cached.boundingVolume.region) return;

        return tile.cached.boundingVolume.region;
    }

    private readyPromise: Promise<ITile> | null = null;
    private readyPromiseResolve: ((value: ITile) => void) | null = null;

    /**
     * Gets the root tile of the tileset
     * @returns Promise that resolves to the root tile
     */
    getRootTile(): Promise<ITile> {
        if (this.rootTile) {
            return Promise.resolve(this.rootTile);
        } else {
            if (!this.readyPromise) {
                this.readyPromise = new Promise<ITile>(resolve => {
                    this.readyPromiseResolve = resolve;
                });
            }
            return this.readyPromise;
        }
    }

    /**
     * Pre-processes a tile node during loading
     * @param tile - The tile to preprocess
     * @param tileSetDir - The directory of the tileset
     * @param parentTile - The parent tile or null if this is the root
     */
    preprocessNode(tile: TileInternal, tileSetDir: string, parentTile: TileInternal | null): void {
        if (!parentTile) {
            this.dispatchEvent({ type: TilesRendererRootOnLoadedEvent });
            this.rootTile = tile;

            if (this.options.transform)
                new Matrix4()
                    .fromArray(this.rootTile.transform || new Matrix4().toArray())
                    .multiply(this.options.transform)
                    .toArray(this.rootTile.transform);
            if (this.readyPromiseResolve) this.readyPromiseResolve(tile);
        }

        super.preprocessNode(tile, tileSetDir, parentTile);

        this.mapView.update();
    }

    /**
     * Parses a tile during loading
     * @param metadata - The tile metadata
     * @param tile - The tile to parse
     * @param extension - The file extension
     * @param uri - The URI of the tile
     * @param abortSignal - Signal to abort the parsing
     * @returns Promise that resolves when parsing is complete
     */
    async parseTile(
        metadata: Tiles3DTileContent,
        tile: Tile,
        extension: string,
        uri: string,
        abortSignal: AbortSignal
    ): Promise<void> {
        await super.parseTile(metadata, tile, extension, uri, abortSignal);
        this.mapView.update();
    }

    /**
     * Disposes of the renderer and cleans up resources
     */
    dispose(): void {
        this.mapView.removeEventListener(MapViewEventNames.Render, this.update3DTileSource);
        super.dispose();
    }
}
