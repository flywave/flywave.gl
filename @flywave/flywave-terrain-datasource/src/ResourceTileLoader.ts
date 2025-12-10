/* Copyright (C) 2025 flywave.gl contributors */

import { type ITileDecoder } from "@flywave/flywave-datasource-protocol";
import { TextElement, TileLoaderState } from "@flywave/flywave-mapview";
import { TileLoader } from "@flywave/flywave-mapview-decoder";

import { type ResourceProvider } from "./ResourceProvider";
import { type ITerrainSource, type TerrainResourceTile } from "./TerrainSource";
import { type ITileResource } from "./TileResourceManager";
import { Color } from "three";

/**
 * Tile loader for DEM (Digital Elevation Model) and TIN (Triangulated Irregular Network) data
 * @template TileType - Type extending TerrainResourceTile
 * @template Resource - Type of resource being loaded
 * @template TTerrainSource - Type extending TerrainSource<TileType>
 */
export class ResourceTileLoader<
    Resource extends ITileResource,
    TTerrainSource extends ITerrainSource<any>
> extends TileLoader {
    /**
     * Creates a new ResourceTileLoader instance
     * @constructor
     * @param {TTerrainSource} dataSource - The terrain data source
     * @param {TileType} tile - The tile to load
     * @param {ResourceProvider<Resource, TileType, TerrainSource<TileType>>} dataProvider - Resource provider
     * @param {ITileDecoder} tileDecoder - Tile decoder implementation
     */
    constructor(
        protected dataSource: TTerrainSource,
        protected tile: TerrainResourceTile,
        protected dataProvider: ResourceProvider<Resource, ITerrainSource>,
        protected tileDecoder: ITileDecoder
    ) {
        super(dataSource, tile.tileKey, dataProvider, tileDecoder);
    }

    /**
     * Cancels the loading process
     * @override
     * @param {boolean} [fromCache=false] - Whether cancellation is from cache
     */
    cancel(fromCache = false): void {
        if (fromCache) {
            super.cancel();
        }
    }

    /**
     * Implementation of the loading process
     * @protected
     * @param {AbortSignal} abortSignal - Signal for aborting the load
     * @param {(doneState: TileLoaderState) => void} onDone - Callback for successful load
     * @param {(error: Error) => void} onError - Callback for load errors
     */
    protected loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        this.dataProvider
            .loadProgressiveTileResources(this.tile, abortSignal)
            .then(() => {
                onDone(TileLoaderState.Ready);
            })
            .catch(error => {
                onError(error);
            });
    }
}

/**
 * Abstract base class for terrain tile loading
 * @template TileType - Type extending TerrainResourceTile
 * @template Resource - Type of resource being loaded
 * @template TTerrainSource - Type extending TerrainSource<TileType>
 * @abstract
 */
export abstract class TerrainTileLoader<
    Resource extends ITileResource,
    TTerrainSource extends ITerrainSource = ITerrainSource
> extends TileLoader<TTerrainSource> {
    /**
     * Creates a new TerrainTileLoader instance
     * @constructor
     * @param {TTerrainSource} dataSource - The terrain data source
     * @param {TileType} tile - The tile to load
     * @param {ResourceProvider<Resource, TileType, TerrainSource<TileType>>} dataProvider - Resource provider
     * @param {ITileDecoder} tileDecoder - Tile decoder implementation
     */
    constructor(
        protected dataSource: TTerrainSource,
        protected tile: TerrainResourceTile,
        protected dataProvider: ReturnType<TTerrainSource["dataProvider"]>,
        protected tileDecoder: ITileDecoder
    ) {
        super(dataSource, tile.tileKey, dataProvider, tileDecoder);
    }

    /**
     * Cancels the loading process
     * @override
     * @param {boolean} [fromCache=false] - Whether cancellation is from cache
     */
    cancel(fromCache = false): void {
        if (fromCache) {
            super.cancel();
        }
    }

    /**
     * Implementation of the loading process
     * @protected
     * @param {AbortSignal} abortSignal - Signal for aborting the load
     * @param {(doneState: TileLoaderState) => void} onDone - Callback for successful load
     * @param {(error: Error) => void} onError - Callback for load errors
     */
    protected loadImpl(
        abortSignal: AbortSignal,
        onDone: (doneState: TileLoaderState) => void,
        onError: (error: Error) => void
    ): void {
        // Load resources from all web tile data sources

        this.dataSource.getWebTileDataSources().forEach(dataSource => {
            return dataSource.loadProgressiveTileResources(this.tile, abortSignal);
        });

        // Load resources from ground overlay provider
        this.dataSource
            .getGroundOverlayProvider()
            .loadProgressiveTileResources(this.tile, abortSignal);

        // Process all resource tile loaders
        this.resourceTileLoader.forEach(resourceTileLoader => {
            resourceTileLoader["loadAbortController"] = this["loadAbortController"];
            resourceTileLoader.loadAndDecode();
        });

        // Load the tile mesh
        this.loadTileMeshImpl();
        onDone(TileLoaderState.Ready);

        this.tile.clearTextElements();
        if (this.dataSource.showDebugInfo) {
            let debugTextElement = new TextElement(
                 `row:${this.tile.tileKey.row} \n col:${this.tile.tileKey.column}\n level:${this.tile.tileKey.level}`,
                this.tile.center,
                {
                    color: new Color(0xff0000)
                },
                {}
            );
            this.tile.addTextElement(
                debugTextElement
            );
        }
    }

    /**
     * Abstract method for loading tile mesh implementation
     * @abstract
     */
    abstract loadTileMeshImpl(): void;

    /**
     * Collection of resource tile loaders for non-imagery terrain data (DEM, TIN, stratum etc.)
     * @private
     */
    private readonly resourceTileLoader: Array<ResourceTileLoader<Resource, TTerrainSource>> = [];

    /**
     * Adds a resource tile loader to the collection
     * @protected
     * @param {ResourceTileLoader<TileType, Resource, TTerrainSource>} resourceTileLoader - The loader to add
     */
    protected addResourceTileLoader(
        resourceTileLoader: ResourceTileLoader<Resource, TTerrainSource>
    ) {
        this.resourceTileLoader.push(resourceTileLoader);
    }
}
