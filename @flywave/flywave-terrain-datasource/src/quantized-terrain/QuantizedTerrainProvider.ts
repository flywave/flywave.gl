/* Copyright (C) 2025 flywave.gl contributors */

import { TileKey, geographicTerrainStandardTiling } from "@flywave/flywave-geoutils";
import { ResourceProvider } from "../ResourceProvider";
import { ITileResource } from "../TileResourceManager";
import {
    type ILayerStrategy,
    type LayerStrategyOptions,
    createLayerStrategy
} from "./layer-strategy/LayerStrategy";
import { getQuantizedMeshTerrain, getUpSamplQuantizedMeshTerrain } from "./quantized-mesh";
import { type QuantizedTerrainMesh } from "./quantized-mesh/QuantizedTerrainMesh";
import { getQuantizedStratumMesh } from "./quantized-stratum-mesh";
import { type QuantizedStratumResource } from "./quantized-stratum-mesh/QuantizedStratumResource";
import { type QuantizedTileResource } from "./QuantizedTileResource";

/**
 * Configuration options for QuantizedTerrainProvider
 *
 * Extends layer strategy options with additional provider-specific settings.
 * These options control the progressive loading behavior and height map generation.
 */
type QuantizedTerrainOptions = LayerStrategyOptions & {
    /**
     * Number of progressive loading stages for terrain data
     *
     * This parameter controls how terrain data loading is split into stages
     * for progressive rendering. More stages provide smoother loading but
     * may increase complexity.
     *
     * @default 3
     */
    loadingStages?: number;

    /**
     * Height map level skip size for optimization
     *
     * Controls how often height maps are generated across zoom levels.
     * A larger value means fewer height maps are generated, reducing
     * memory usage but potentially affecting rendering quality.
     *
     * @default 4
     */
    heightMapLevelSkipSize?: number;
};

/**
 * Abstract base class for quantized terrain data providers
 *
 * This provider implements a layered approach to terrain data loading where:
 * 1. Layer strategy determines data availability and tiling scheme
 * 2. Progressive loading stages ensure smooth data delivery
 * 3. Connection management handles asynchronous initialization
 *
 * @template Resource - The type of terrain resource being provided
 */
export abstract class QuantizedProvider<
    Resource extends QuantizedTileResource = QuantizedTileResource
> extends ResourceProvider<Resource> {
    /**
     * Configuration options for the layer strategy
     * @protected
     */
    protected layerStrategyOptions: LayerStrategyOptions;

    /**
     * The layer strategy instance that determines data availability and tiling
     */
    public layerStrategy!: ILayerStrategy;

    /**
     * Promise resolver function for the ready state
     * @private
     */
    private resolve!: (value?: void | PromiseLike<void>) => void;

    /**
     * Promise reject function for the ready state
     * @private
     */
    private reject!: (reason?: unknown) => void;

    /**
     * Promise that resolves when the provider is ready for use
     * @private
     */
    private readonly promise: Promise<void>;

    /**
     * Height map level skip size for optimization
     * @private
     */
    private readonly heightMapLevelSkipSize: number;

    /**
     * Creates a new QuantizedTerrainProvider instance
     *
     * @param options - Configuration options for the terrain provider
     */
    constructor(options: QuantizedTerrainOptions) {
        super({});

        this.layerStrategyOptions = options;

        this.heightMapLevelSkipSize = options.heightMapLevelSkipSize ?? 4;

        this.promise = new Promise<void>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
    }

    /**
     * Checks if the provider is ready for use
     *
     * @returns True if the layer strategy is initialized, false otherwise
     */
    public ready(): boolean {
        return this.layerStrategy !== undefined;
    }

    /**
     * Waits for the provider to become ready
     *
     * @returns Promise that resolves when the provider is ready
     */
    public async awaitReady(): Promise<void> {
        await this.promise;
    }

    /**
     * Establishes connection to the terrain data source and initializes the layer strategy
     *
     * This method handles the asynchronous initialization of the terrain provider,
     * including creating and configuring the layer strategy that determines data
     * availability and tiling scheme.
     *
     * @returns Promise that resolves when connection is established
     */
    protected connect(): Promise<void> {
        // Return immediately if already connected
        if (this.layerStrategy) {
            return Promise.resolve();
        }

        // Create and initialize the layer strategy
        return createLayerStrategy(this.layerStrategyOptions)
            .then(layerStrategy => {
                this.layerStrategy = layerStrategy;
                this.terrainSource.setTilingScheme(layerStrategy.tilingScheme);
                this.resolve();
            })
            .catch(error => {
                this.reject(error);
                throw error;
            });
    }

    /**
     * Checks if elevation map generation is enabled for a specific tile level
     *
     * This method determines whether height maps should be generated for
     * a given tile level based on the level skip size and specific level rules.
     *
     * @param tileKey - The tile key to check
     * @returns True if elevation map generation is enabled for this level
     */
    protected isElevationMapEnabled(tileKey: TileKey): boolean {
        return this.layerStrategy.getTileDataAvailable(tileKey);
    }

    /**
     * Builds a temporary renderable mesh for a tile whose own resource is
     * still loading, derived from the nearest cached ancestor.
     *
     * The quantized terrain provider overrides this with the worker-side
     * clipping/upsampling chain, so the fallback geometry has the tile's exact
     * extent and its own skirts (which is what closes the T-junction cracks
     * against neighbouring tiles). Providers without upsampling return
     * `undefined`.
     */
    public async createFallbackMesh(_tileKey: TileKey): Promise<Resource | undefined> {
        return undefined;
    }
    /**
     * Checks if the elevation map should be flipped on the Y axis
     *
     * This method determines whether the Y axis should be flipped when
     * processing elevation data based on the tiling scheme being used.
     *
     * @returns True if the Y axis should be flipped
     */
    protected isElevationMapFlipY(): boolean {
        return this.terrainSource.getTilingScheme() != geographicTerrainStandardTiling;
    }
}

/**
 * Terrain provider for quantized mesh terrain data
 *
 * This provider handles loading and processing of quantized mesh terrain tiles,
 * including up-sampling from parent tiles when higher resolution data is not
 * directly available.
 *
 * The provider implements a fallback strategy that first attempts direct loading
 * and then up-samples parent data when needed, ensuring terrain data is always
 * available even when exact resolution data is not present.
 */
export class QuantizedTerrainProvider extends QuantizedProvider<QuantizedTerrainMesh> {
    /**
     * Height rasters are no longer generated for quantized terrain tiles:
     * heights are sampled from the mesh triangles and the loading-period
     * coverage comes from the map view's ancestor fallback. Only ground
     * modifications force a raster, and that decision is made per tile in
     * `getQuantizedMeshTerrain` / `getUpSamplQuantizedMeshTerrain` from the
     * modifiers found in the tile area.
     */
    protected override isElevationMapEnabled(tileKey: TileKey): boolean {
        return false;
    }

    /**
     * Builds the loading-period fallback mesh for a tile whose own resource is
     * still loading.
     *
     * The ancestor's mesh is clipped to the requested tile's exact extent by
     * the same worker-side chain that produces regular upsampled tiles
     * (`TaskType.QuantizedUpsample`), so the result carries the tile's own
     * edge geometry and skirts. Those skirts are what closes the T-junction
     * cracks against neighbouring tiles - a fragment-space clip cannot.
     */
    public override async createFallbackMesh(
        tileKey: TileKey
    ): Promise<QuantizedTerrainMesh | undefined> {
        if (tileKey.level === 0) {
            return undefined;
        }

        // Nearest cached ancestor; the requested tile's own resource is still
        // loading by definition.
        const ancestor = this.getBestAvailableResourceTile(tileKey.parent(), false);
        if (ancestor === undefined) {
            return undefined;
        }

        let mesh = ancestor.resource;
        let currentKey = ancestor.tileKey;
        while (currentKey.level < tileKey.level) {
            const levelOffset = tileKey.level - currentKey.level - 1;
            const childKey = TileKey.fromRowColumnLevel(
                tileKey.row >> levelOffset,
                tileKey.column >> levelOffset,
                currentKey.level + 1
            );
            mesh = await getUpSamplQuantizedMeshTerrain(
                this.layerStrategy,
                this.terrainSource,
                mesh,
                currentKey,
                childKey,
                false,
                this.isElevationMapFlipY()
            );
            currentKey = childKey;
        }

        return mesh;
    }

    /**
     * Retrieves a terrain tile, handling both direct loading and up-sampling scenarios
     *
     * This method implements a fallback strategy where:
     * 1. First attempts to load the tile directly if data is available
     * 2. If not available, searches up the tile hierarchy for parent data
     * 3. Up-samples parent data to match the requested tile resolution
     *
     * @param tileKey - The tile key identifying the requested tile
     * @param abortSignal - Optional abort signal for cancellation support
     * @returns Promise resolving to the terrain mesh or null if not available
     */
    public override async getTile(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<QuantizedTerrainMesh | null> {
        // Try direct loading if data is available for this tile
        let result: QuantizedTerrainMesh;
        if (this.layerStrategy.getTileDataAvailable(tileKey)) {
            result = await this.loadDirect(tileKey);
        } else {
            // Availability above the static layer.json ranges is only known
            // after a "metadata level" tile has been decoded. Wait for that
            // ancestor (one round trip per area, shared by all tiles below it)
            // before deciding between real data and upsampling.
            const metadataRequest = this.ensureMetadataAvailability(tileKey);
            if (metadataRequest) {
                await metadataRequest;
            }
            if (this.layerStrategy.getTileDataAvailable(tileKey)) {
                result = await this.loadDirect(tileKey);
            }
        }
        if (!result) {
            if (tileKey.level == 0) return;
            const parentTileKey = tileKey.parent();

            if (this.hasResource(parentTileKey))
                return await getUpSamplQuantizedMeshTerrain(
                    this.layerStrategy,
                    this.terrainSource,
                    this.getPreciseResource(parentTileKey),
                    parentTileKey,
                    tileKey,
                    this.isElevationMapEnabled(tileKey),
                    this.isElevationMapFlipY()
                );
        }
        return result;
    }

    /**
     * Downloads and decodes the tile's own data and feeds its metadata
     * availability back into the layer strategy.
     */
    private async loadDirect(tileKey: TileKey): Promise<QuantizedTerrainMesh | undefined> {
        try {
            const mesh = await getQuantizedMeshTerrain(
                this.layerStrategy,
                this.terrainSource,
                tileKey,
                this.isElevationMapEnabled(tileKey),
                this.isElevationMapFlipY()
            );
            this.addMetadataAvailability(tileKey, mesh);
            return mesh;
        } catch (e) {
            console.error(e);
            return undefined;
        }
    }

    /** Metadata-level ancestor fetches, by morton code. */
    private readonly m_metadataRequests = new Map<number, Promise<void>>();

    /**
     * Makes sure the availability ranges of a "metadata level" ancestor are
     * known, so real data deeper than the static layer.json ranges can be
     * requested instead of upsampled.
     *
     * Quantized-mesh tiles carry metadata at levels that are multiples of
     * `metadataAvailability` (e.g. level 10 reports availability for levels
     * 11..20). Terrain LOD selection may skip those levels entirely, so their
     * metadata is fetched explicitly here.
     *
     * @returns A promise that resolves once availability was updated, or
     *          `undefined` when no metadata ancestor fetch is needed.
     */
    private ensureMetadataAvailability(tileKey: TileKey): Promise<void> | undefined {
        const availabilityLevels = this.layerStrategy.getLayerInformation()?.availabilityLevels;
        if (!Number.isFinite(availabilityLevels) || availabilityLevels <= 0) {
            return undefined;
        }

        const level = tileKey.level;
        if (level <= 0) {
            return undefined;
        }

        const metadataLevel = Math.floor(level / availabilityLevels) * availabilityLevels;
        if (metadataLevel === level) {
            // This tile is itself a metadata level; its normal load carries
            // the metadata. It only gets here when that load failed.
            return undefined;
        }

        const levelOffset = level - metadataLevel;
        const ancestorKey = TileKey.fromRowColumnLevel(
            tileKey.row >> levelOffset,
            tileKey.column >> levelOffset,
            metadataLevel
        );
        const tilingScheme = this.layerStrategy.tilingScheme;
        const code = ancestorKey.mortonCode(tilingScheme.mortonTileEncoding);

        const pending = this.m_metadataRequests.get(code);
        if (pending) {
            return pending;
        }
        if (this.hasResource(ancestorKey)) {
            // Decoded earlier without metadata feedback (or before this
            // feature existed); nothing to fetch.
            return undefined;
        }

        const request = getQuantizedMeshTerrain(
            this.layerStrategy,
            this.terrainSource,
            ancestorKey,
            false,
            this.isElevationMapFlipY()
        )
            .then(mesh => {
                if (!mesh) {
                    this.m_metadataRequests.delete(code);
                    return;
                }
                this.addMetadataAvailability(ancestorKey, mesh);

                // Keep the decoded ancestor for later rendering instead of
                // throwing the download away.
                const cachedTile = this.terrainSource?.getCachedTile(ancestorKey, false);
                if (cachedTile && !cachedTile.resourceManager.hasResource(this.getResourceKey())) {
                    mesh.connectToDataSource(this.terrainSource!, ancestorKey);
                    cachedTile.resourceManager.setResource(this.getResourceKey(), mesh);
                    this.terrainSource!.updateMemoryUsage(cachedTile);
                }
            })
            .catch(() => {
                this.m_metadataRequests.delete(code);
            });

        this.m_metadataRequests.set(code, request);
        return request;
    }

    /**
     * Feeds the availability ranges carried by a tile's `metadata` extension
     * back into the layer strategy, so finer real data (up to `maxzoom`) is
     * requested instead of being upsampled from the parent.
     */
    private addMetadataAvailability(tileKey: TileKey, mesh: QuantizedTerrainMesh): void {
        const metadata = (mesh.metaData as { metadata?: { available?: unknown } } | undefined)
            ?.metadata;
        if (metadata?.available === undefined) {
            return;
        }
        this.layerStrategy.addMetadataAvailability(tileKey, metadata.available);
    }
}

/**
 * Terrain provider for quantized stratum terrain data
 *
 * This provider handles loading of stratum-based terrain data which provides
 * enhanced elevation accuracy and detail for specific regions. Stratum data
 * incorporates geological layer information into the terrain model.
 */
export class QuantizedStratumProvider extends QuantizedProvider<QuantizedStratumResource> {
    /**
     * Retrieves a stratum terrain tile if data is available
     *
     * This method attempts to load stratum terrain data for the specified
     * tile key, but only if data is available for that specific tile.
     * Unlike the standard quantized terrain provider, it does not implement
     * up-sampling from parent tiles.
     *
     * @param tileKey - The tile key identifying the requested tile
     * @param abortSignal - Optional abort signal for cancellation support
     * @returns Promise resolving to the stratum data or undefined if not available
     */
    public async getTile(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<QuantizedStratumResource | undefined> {
        // Only attempt loading if data is available for this tile
        if (this.layerStrategy.getTileDataAvailable(tileKey)) {
            return await getQuantizedStratumMesh(
                this.layerStrategy,
                this.terrainSource,
                this.terrainSource.getTilingScheme(),
                tileKey,
                this.isElevationMapEnabled(tileKey),
                this.isElevationMapFlipY()
            );
        }

        // Return undefined if data is not available
        return undefined;
    }
}
