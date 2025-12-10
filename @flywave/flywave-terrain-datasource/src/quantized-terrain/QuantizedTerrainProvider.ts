/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, geographicTerrainStandardTiling } from "@flywave/flywave-geoutils";

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
            try {
                result = await getQuantizedMeshTerrain(
                    this.layerStrategy,
                    this.terrainSource,
                    tileKey,
                    this.isElevationMapEnabled(tileKey),
                    this.isElevationMapFlipY()
                );
            } catch (e) {
                console.error(e);
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
