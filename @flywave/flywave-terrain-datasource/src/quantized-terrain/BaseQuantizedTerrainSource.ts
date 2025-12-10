/* Copyright (C) 2025 flywave.gl contributors */

import { type TileAvailability, type TilingScheme, TileKey } from "@flywave/flywave-geoutils";
import {
    type ElevationProvider as IElevationProvider,
    type ElevationRangeSource as IElevationRangeSource
} from "@flywave/flywave-mapview";
import { type TileFactory } from "@flywave/flywave-mapview-decoder";

import { type TerrainResourceTile, TerrainSource } from "../TerrainSource";
import { ElevationProvider } from "./ElevationProvider";
import { ElevationRangeSource } from "./ElevationRangeSource";
import { type QuantizedProvider, QuantizedStratumProvider } from "./QuantizedTerrainProvider";
import { type QuantizedTileResource } from "./QuantizedTileResource";

/**
 * Configuration options for QuantizedTerrainSource
 *
 * Defines all available configuration parameters for terrain source initialization.
 * This interface provides a comprehensive set of options for configuring
 * quantized terrain data sources with various features and capabilities.
 */
export interface BaseQuantizedTerrainSourceOptions {
    /**
     * Optional name for the terrain source
     */
    name?: string;

    /**
     * HTTP headers to include with terrain data requests
     */
    headers?: HeadersInit;

    /**
     * Base URL for the quantized mesh terrain data endpoint
     *
     * This is the primary endpoint URL where quantized mesh terrain data
     * can be fetched. It's a required parameter for terrain source initialization.
     */
    url: string;

    /**
     * Maximum display level/zoom level for this terrain source
     *
     * Controls the maximum zoom level at which this terrain source will
     * provide data. Beyond this level, higher resolution data may not be
     * available or will be synthesized from lower resolution data.
     *
     * @default 22
     */
    maxDisplayLevel?: number;

    /**
     * Optional script URL for web worker decoder
     *
     * If provided, this URL will be used to initialize a web worker
     * for off-main-thread terrain data decoding, improving performance.
     */
    scriptUrl?: string;

    /**
     * Optional default height map level size
     *
     * Controls the level skipping size for height map generation.
     * This parameter affects when height maps are generated for
     * different zoom levels to optimize performance.
     */
    defaultHeightMapSize?: number;

    /**
     * Additional custom options that can be passed to the terrain source
     *
     * This index signature allows for passing additional custom options
     * that may be specific to certain terrain source implementations.
     */
    [key: string]: unknown;
}

/**
 * Terrain source implementation for quantized mesh terrain data
 *
 * This class provides a complete terrain data source that supports:
 * - Quantized mesh terrain tiles with optional water masks and normals
 * - Stratum-based terrain data for enhanced elevation accuracy
 * - Web worker based tile decoding for performance
 * - Elevation range and provider integration
 *
 * The source handles both standard quantized mesh data and stratum-enhanced data,
 * providing a comprehensive terrain solution for 3D visualization applications.
 *
 * This abstract base class defines the common interface and functionality
 * for quantized terrain sources, with specific implementations handling
 * different types of quantized terrain data.
 */
export abstract class BaseQuantizedTerrainSource<
    QuantizedResource extends QuantizedTileResource
> extends TerrainSource<QuantizedProvider<QuantizedResource>> {
    /**
     * Base URL for the primary quantized mesh terrain data endpoint
     * @private
     */
    private readonly _baseUrl: string;

    /**
     * Creates a new QuantizedMeshTerrainProvider instance
     *
     * This abstract method must be implemented by concrete subclasses
     * to create the appropriate provider for their specific terrain data type.
     *
     * @protected
     * @param options - Configuration options for the terrain provider
     * @returns A new QuantizedMeshTerrainProvider instance
     */
    protected abstract createProvider(
        options: BaseQuantizedTerrainSourceOptions
    ): QuantizedProvider<QuantizedResource>;

    /**
     * Creates a new QuantizedTerrainSource instance
     *
     * @param quantizedileFactory - Factory for creating terrain resource tiles
     * @param options - Configuration options for the terrain source
     * @throws Error if required url parameter is missing
     */
    constructor(
        quantizedileFactory: TileFactory<TerrainResourceTile>,
        options: BaseQuantizedTerrainSourceOptions
    ) {
        if (!options.url) {
            throw new Error("QuantizedTerrainSource requires a valid URL parameter");
        }

        // Initialize the base terrain source with quantized mesh configuration
        super(quantizedileFactory, {
            name: options.name ?? "quantized_terrain_source",
            maxDisplayLevel: options.maxDisplayLevel ?? 22,
            ...options
        });

        this.setDataProvider(this.createProvider(options));

        this._baseUrl = options.url;
    }

    /**
     * Sets the tiling scheme for this terrain source and propagates it to all providers
     *
     * This method updates the coordinate system and tiling scheme used by
     * the terrain source and ensures that all associated providers are
     * updated to use the same scheme for consistency.
     *
     * @param value - The tiling scheme to use for coordinate calculations
     */
    public setTilingScheme(value: TilingScheme): void {
        super.setTilingScheme(value);
        // Propagate tiling scheme to the main data provider
        this.dataProvider().setTilingScheme(value);
        this.getGroundOverlayProvider()?.setTilingScheme(value);
    }

    /**
     * Gets the base URL for the primary terrain data endpoint
     *
     * @returns The base URL string
     */
    public get baseUrl(): string {
        return this._baseUrl;
    }

    /**
     * Creates and returns an elevation range source for this terrain source
     *
     * This method creates an elevation range source that can provide
     * minimum and maximum elevation values for terrain tiles, which is
     * useful for frustum culling and other optimizations.
     *
     * @protected
     * @returns A new ElevationRangeSource instance configured for this terrain source
     */
    protected createElevationRangeSource(): IElevationRangeSource {
        return new ElevationRangeSource(this);
    }

    /**
     * Creates and returns an elevation provider for this terrain source
     *
     * This method creates an elevation provider that can provide elevation
     * values at specific geographic coordinates, which is useful for
     * features like ray casting and height queries.
     *
     * @protected
     * @returns A new ElevationProvider instance configured for this terrain source
     */
    protected createElevationProvider(): IElevationProvider {
        return new ElevationProvider(this);
    }

    /**
     * Gets the terrain level range supported by this data source
     *
     * This method returns the minimum and maximum zoom levels supported by
     * the underlying quantized terrain data provider. This information is
     * used to determine when to subdivide tiles and when to stop loading
     * higher resolution data.
     *
     * @returns A tuple containing [minZoom, maxZoom] levels
     */
    getTerrainLevelRange(): [number, number] {
        return [
            this.dataProvider().layerStrategy.getMinZoom(),
            this.dataProvider().layerStrategy.getMaxZoom()
        ];
    }

    /**
     * Gets the tile availability information for this terrain source
     *
     * This method returns information about which tiles are available
     * at different zoom levels, which is useful for determining data
     * coverage and optimizing tile loading.
     *
     * @returns Tile availability information
     */
    getTileAvailability(): TileAvailability {
        return this.dataProvider().layerStrategy.getAvailability();
    }
}
