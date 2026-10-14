/* Copyright (C) 2025 flywave.gl contributors */

import {
    type ElevationProvider as IElevationProvider,
    type ElevationRangeSource as IElevationRangeSource
} from "@flywave/flywave-mapview";
import { type GeoBox, type TileKey } from "@flywave/flywave-geoutils";
import debounce, { type DebouncedFunc } from "lodash.debounce";

import {
    type TerrainSourceOptions,
    TerrainSource,
    type TerrainResourceTile
} from "../TerrainSource";
import { type DemPatchChangeEventParams } from "./dem-patch/DemPatchTypes";
import {
    composeDemTilePixels,
    computeDemTileGrid,
    unionGeoBoxes
} from "./dem-patch/DemPatchComposite";
import { DEMData, type DEMEncoding } from "./dem/DemData";
import { type DemSourceDescription, DemTileProvider, DemTileResource } from "./DEMTileProvider";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { HeightMapTileFactory } from "./TileFactory";

/**
 * Configuration options for DEM terrain source
 *
 * This type extends the base TerrainSourceOptions but omits the dataProvider property
 * since it will be automatically created by the DEMTerrainSource. It adds specific
 * properties for DEM data sources such as the source URL or description and encoding format.
 */
export type DemTerrainSourceOptions = Omit<
    TerrainSourceOptions<DemTileProvider>,
    "dataProvider"
> & {
    /**
     * The source of the DEM data, either a URL string or a detailed source description
     */
    source: string | DemSourceDescription;

    /**
     * The encoding format of the DEM data (e.g., "mapbox", "terrarium")
     * @default "mapbox"
     */
    encoding?: DEMEncoding;
};

/**
 * How long a retired (replaced) DEM resource stays alive before disposal.
 * Render tiles keep referencing the retired resource's texture until their
 * layer state swaps to the replacement — disposing earlier risks sampling a
 * destroyed GPU texture (garbage elevation). 30 frames is far beyond the
 * debounced overlay refresh + re-resolve cycle.
 */
const RETIRED_RESOURCE_FRAMES = 30;

/**
 * Grace period for a re-bake batch: once it passes, whatever landed swaps as
 * one set and true stragglers form a second batch (rare; only a hung base
 * fetch can outlast this).
 */
const SWAP_DEADLINE_MS = 8000;

/**
 * DEM (Digital Elevation Model) terrain data source
 *
 * This class implements a terrain data source that loads and renders DEM data
 * for 3D terrain visualization. It extends the base TerrainSource class and
 * provides specialized functionality for handling digital elevation models.
 *
 * The source supports various DEM formats and can load data from different providers
 * using the DemTileProvider. It also provides elevation and elevation range services
 * for querying height information at specific geographic coordinates.
 *
 * DEM patch (elevation override) layers registered via
 * {@link getDemPatchManager} are baked into every tile at decode time and
 * re-baked atomically when the patch set changes: the stale bake keeps
 * rendering until its replacement is ready, so patch add/remove/priority
 * changes and late-arriving patch tiles never blank or flatten the terrain.
 */
export class DEMTerrainSource extends TerrainSource<DemTileProvider> {
    /** Concrete range source reference, for cache invalidation on patch changes */
    private m_demElevationRangeSource?: ElevationRangeSource;

    /**
     * Replaced DEM resources awaiting disposal (ownership taken over at swap
     * time so live render states never sample a destroyed texture).
     */
    private m_retiredDemResources: Array<{ resource: DemTileResource; frame: number }> = [];

    /** Accumulated rebake scope across debounced patch-change events */
    private m_pendingRebakeGlobal: boolean = false;
    private m_pendingRebakeBounds: GeoBox | null = null;

    private readonly m_flushDemPatchRebake: DebouncedFunc<() => void>;

    /**
     * Creates a new DEM terrain source instance
     *
     * @param options - Configuration options for the DEM terrain source
     */
    constructor(options: DemTerrainSourceOptions) {
        super(new HeightMapTileFactory(), {
            ...options,
            dataProvider: new DemTileProvider(options),
            name: options.name || `dem_terrain_data_source`
        });
        this.m_flushDemPatchRebake = debounce(() => this.flushDemPatchRebake(), 100);
        this.getDemPatchManager().addEventListener("change", this.handleDemPatchChange);
    }

    /**
     * Creates an elevation range source for this terrain source
     *
     * This method creates and returns an ElevationRangeSource instance that can
     * provide minimum and maximum elevation values for specific tiles. This is
     * used for frustum culling and other optimizations in the rendering pipeline.
     *
     * @returns A new ElevationRangeSource instance
     */
    protected createElevationRangeSource(): IElevationRangeSource {
        this.m_demElevationRangeSource = new ElevationRangeSource(this);
        return this.m_demElevationRangeSource;
    }

    /**
     * Creates an elevation provider for this terrain source
     *
     * This method creates and returns an ElevationProvider instance that can
     * provide elevation values at specific geographic coordinates. This is used
     * for features like ray casting and height queries.
     *
     * @returns A new ElevationProvider instance
     */
    protected createElevationProvider(): IElevationProvider {
        return new ElevationProvider(this);
    }

    /**
     * Gets the terrain level range supported by this data source
     *
     * This method returns the minimum and maximum zoom levels supported by
     * the underlying DEM data provider. This information is used to determine
     * when to subdivide tiles and when to stop loading higher resolution data.
     *
     * @returns A tuple containing [minZoom, maxZoom] levels
     */
    protected getTerrainLevelRange(): [number, number] {
        return [this.dataProvider()?.getMinZoom() ?? 0, this.dataProvider()?.getMaxZoom() ?? 0];
    }

    /**
     * Patch-set change entry point. Accumulates the affected area (union of
     * event bounds, globalizing on null) and debounces the actual re-bake so
     * bursts of changes (e.g. priority sliders) coalesce into one sweep.
     */
    private readonly handleDemPatchChange = (event: DemPatchChangeEventParams): void => {
        if (this.isDetached()) {
            return;
        }
        if (!event.affectedBounds) {
            this.m_pendingRebakeGlobal = true;
        } else if (!this.m_pendingRebakeGlobal) {
            this.m_pendingRebakeBounds = this.m_pendingRebakeBounds
                ? unionGeoBoxes(this.m_pendingRebakeBounds, event.affectedBounds)
                : event.affectedBounds.clone();
        }
        this.m_flushDemPatchRebake();
    };

    /**
     * Re-bakes every cached DEM resource affected by a patch-set change.
     *
     * Swap protocol (never blank, never flatten, never cracked): the stale
     * bake keeps rendering while replacements decode; the WHOLE batch swaps
     * in atomically once every re-bake has landed (bounded by a deadline).
     * Swapping per tile would mix stale/fresh bakes across neighboring tiles
     * — their shared edges then disagree by the full patch delta, opening
     * tile-boundary cracks wider than the skirts can cover. The swap itself
     * triggers the render-tile re-resolve — NOT the flush: refreshing while
     * the old bake is still current would make render tiles re-bind to the
     * stale resource and then sample a disposed texture once the sweep
     * retires it (garbage-elevation spikes).
     */
    private flushDemPatchRebake(): void {
        if (this.isDetached() || this.m_disposing) {
            return;
        }
        const bounds = this.m_pendingRebakeGlobal ? null : this.m_pendingRebakeBounds;
        this.m_pendingRebakeGlobal = false;
        this.m_pendingRebakeBounds = null;

        const version = this.getDemPatchManager().version;
        const provider = this.dataProvider() as DemTileProvider;
        const resourceKey = provider.getResourceKey();

        const pendingSwaps: Array<{ tile: TerrainResourceTile; resource: DemTileResource }> = [];
        const rebakes: Array<Promise<void>> = [];

        for (const tile of this.getCachedTerrainTiles()) {
            const stale = tile.resourceManager.getResource<DemTileResource>(resourceKey);
            if (!stale || stale.patchVersion === version) {
                continue;
            }
            if (bounds && !stale.geoBox.intersectsBox(bounds)) {
                continue;
            }
            rebakes.push(
                // Preferred: in-memory re-bake from the tile's pristine base
                // pixels — no network, cannot partially fail. The network
                // refetch is only the fallback for resources that predate
                // pristine capture.
                this.rebakeFromPristine(tile, stale)
                    .then(resource => {
                        if (resource) {
                            if (this.isDetached() || this.m_disposing) {
                                return;
                            }
                            pendingSwaps.push({ tile, resource });
                            return;
                        }
                        return provider.getTile(tile.tileKey).then(fallback => {
                            if (!fallback || this.isDetached() || this.m_disposing) {
                                return;
                            }
                            pendingSwaps.push({ tile, resource: fallback });
                        });
                    })
                    .catch(() => {
                        // A failed re-bake keeps its stale bake rendering; the
                        // next patch change retries it.
                    })
            );
        }
        if (rebakes.length === 0) {
            return;
        }

        const deadline = new Promise<void>(resolve => {
            setTimeout(resolve, SWAP_DEADLINE_MS);
        });
        void Promise.race([Promise.all(rebakes), deadline]).then(() => {
            this.applyPendingSwaps(pendingSwaps, resourceKey);
            // Stragglers that missed the deadline swap as a second batch.
            void Promise.all(rebakes).then(() => {
                this.applyPendingSwaps(pendingSwaps, resourceKey);
            });
        });
    }

    /**
     * Re-bakes one tile IN MEMORY from its pristine base pixels: fresh patch
     * snapshot → composite → new DEMData (quad tree rebuilt on the final
     * pixels). The stored pristine copy is never mutated (compose works on a
     * copy), so repeated re-bakes stay deterministic. Returns undefined when
     * the resource carries no pristine copy.
     */
    private async rebakeFromPristine(
        tile: TerrainResourceTile,
        stale: DemTileResource
    ): Promise<DemTileResource | undefined> {
        const pristine = stale.getPristinePixels();
        if (!pristine) {
            return undefined;
        }
        const manager = this.getDemPatchManager();
        const collection = await manager.preparePatchTiles(tile.tileKey, stale.geoBox);
        const snapshot = manager.resamplePatchTiles(
            collection,
            tile.tileKey,
            computeDemTileGrid(pristine.width).dim
        );

        const image = new ImageData(
            new Uint8ClampedArray(pristine.pixels),
            pristine.width,
            pristine.height
        );
        composeDemTilePixels(image, stale.demData.encoding, snapshot.patches, 1);
        const dem = new DEMData(
            stale.demData.uid,
            image,
            stale.geoBox,
            stale.demData.encoding,
            false,
            true
        );
        const resource = new DemTileResource(stale.geoBox, dem);
        resource.patchVersion = snapshot.version;
        resource.attachPristinePixels(pristine.pixels, pristine.width, pristine.height);
        return resource;
    }

    /**
     * Applies a collected batch of re-baked resources in one synchronous pass
     * and refreshes ranges + render tiles exactly once for the whole batch.
     */
    private applyPendingSwaps(
        pendingSwaps: Array<{ tile: TerrainResourceTile; resource: DemTileResource }>,
        resourceKey: string
    ): void {
        if (pendingSwaps.length === 0) {
            return;
        }
        if (this.isDetached() || this.m_disposing) {
            pendingSwaps.length = 0;
            return;
        }
        const provider = this.dataProvider() as DemTileProvider;
        for (const { tile, resource } of pendingSwaps) {
            const previous = tile.resourceManager.getResource<DemTileResource>(resourceKey);
            if (previous === resource) {
                continue;
            }
            tile.resourceManager.setResource(resourceKey, resource);
            this.updateMemoryUsage(tile);
            if (previous) {
                this.retireDemResource(previous);
            }
        }
        // Re-sync tile borders against the CURRENT neighbor set (the batch
        // members are all in the cache now). Without this, re-baked borders
        // would carry stale edge values and show as 1px ridges at seams.
        const mortonEncoding = this.getTilingScheme().mortonTileEncoding;
        for (const { tile, resource } of pendingSwaps) {
            resource.demData.markNeighboringTilesAsBackfilled(tile.tileKey, mortonEncoding, {
                getPreciseResource: (tileID: TileKey) =>
                    provider.getPreciseResource(tileID)?.demData
            });
        }
        pendingSwaps.length = 0;
        // Min/max ranges and every live render state must move to the swapped
        // bakes NOW: the unfiltered overlay refresh makes all render tiles
        // re-resolve (old states unbind from the retired textures) well before
        // the 30-frame disposal sweep fires, and the range cache recompute
        // picks up the new quad trees — so elevation queries, clip planes and
        // culling follow the swap together with the geometry.
        this.m_demElevationRangeSource?.invalidateCache();
        this.updateTileOverlays();
    }

    /** Takes ownership of a replaced resource; disposal is deferred (see sweep) */
    private retireDemResource(resource: DemTileResource): void {
        this.m_retiredDemResources.push({ resource, frame: this.mapView.frameNumber });
    }

    /** Disposes retired resources once rendering has moved safely past the swap */
    public override onWillTouchTiled(): void {
        super.onWillTouchTiled();
        if (this.m_retiredDemResources.length === 0) {
            return;
        }
        const frame = this.mapView.frameNumber;
        this.m_retiredDemResources = this.m_retiredDemResources.filter(entry => {
            if (frame - entry.frame >= RETIRED_RESOURCE_FRAMES) {
                entry.resource.dispose();
                return false;
            }
            return true;
        });
    }

    dispose(): void {
        this.getDemPatchManager().removeEventListener("change", this.handleDemPatchChange);
        this.m_flushDemPatchRebake.cancel();
        this.m_retiredDemResources.forEach(entry => entry.resource.dispose());
        this.m_retiredDemResources = [];
        super.dispose();
    }
}
