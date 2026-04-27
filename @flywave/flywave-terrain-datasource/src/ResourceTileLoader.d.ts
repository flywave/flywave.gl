import { type ITileDecoder } from "@flywave/flywave-datasource-protocol";
import { TileLoaderState } from "@flywave/flywave-mapview";
import { TileLoader } from "@flywave/flywave-mapview-decoder";
import { type ResourceProvider } from "./ResourceProvider";
import { type ITerrainSource, type TerrainResourceTile } from "./TerrainSource";
import { type ITileResource } from "./TileResourceManager";
/**
 * Tile loader for DEM (Digital Elevation Model) and TIN (Triangulated Irregular Network) data
 * @template TileType - Type extending TerrainResourceTile
 * @template Resource - Type of resource being loaded
 * @template TTerrainSource - Type extending TerrainSource<TileType>
 */
export declare class ResourceTileLoader<Resource extends ITileResource, TTerrainSource extends ITerrainSource<any>> extends TileLoader {
    protected dataSource: TTerrainSource;
    protected tile: TerrainResourceTile;
    protected dataProvider: ResourceProvider<Resource, ITerrainSource>;
    protected tileDecoder: ITileDecoder;
    /**
     * Creates a new ResourceTileLoader instance
     * @constructor
     * @param {TTerrainSource} dataSource - The terrain data source
     * @param {TileType} tile - The tile to load
     * @param {ResourceProvider<Resource, TileType, TerrainSource<TileType>>} dataProvider - Resource provider
     * @param {ITileDecoder} tileDecoder - Tile decoder implementation
     */
    constructor(dataSource: TTerrainSource, tile: TerrainResourceTile, dataProvider: ResourceProvider<Resource, ITerrainSource>, tileDecoder: ITileDecoder);
    /**
     * Cancels the loading process
     * @override
     * @param {boolean} [fromCache=false] - Whether cancellation is from cache
     */
    cancel(fromCache?: boolean): void;
    /**
     * Implementation of the loading process
     * @protected
     * @param {AbortSignal} abortSignal - Signal for aborting the load
     * @param {(doneState: TileLoaderState) => void} onDone - Callback for successful load
     * @param {(error: Error) => void} onError - Callback for load errors
     */
    protected loadImpl(abortSignal: AbortSignal, onDone: (doneState: TileLoaderState) => void, onError: (error: Error) => void): void;
}
/**
 * Abstract base class for terrain tile loading
 * @template TileType - Type extending TerrainResourceTile
 * @template Resource - Type of resource being loaded
 * @template TTerrainSource - Type extending TerrainSource<TileType>
 * @abstract
 */
export declare abstract class TerrainTileLoader<Resource extends ITileResource, TTerrainSource extends ITerrainSource = ITerrainSource> extends TileLoader<TTerrainSource> {
    protected dataSource: TTerrainSource;
    protected tile: TerrainResourceTile;
    protected dataProvider: ReturnType<TTerrainSource["dataProvider"]>;
    protected tileDecoder: ITileDecoder;
    /**
     * Creates a new TerrainTileLoader instance
     * @constructor
     * @param {TTerrainSource} dataSource - The terrain data source
     * @param {TileType} tile - The tile to load
     * @param {ResourceProvider<Resource, TileType, TerrainSource<TileType>>} dataProvider - Resource provider
     * @param {ITileDecoder} tileDecoder - Tile decoder implementation
     */
    constructor(dataSource: TTerrainSource, tile: TerrainResourceTile, dataProvider: ReturnType<TTerrainSource["dataProvider"]>, tileDecoder: ITileDecoder);
    /**
     * Cancels the loading process
     * @override
     * @param {boolean} [fromCache=false] - Whether cancellation is from cache
     */
    cancel(fromCache?: boolean): void;
    /**
     * Implementation of the loading process
     * @protected
     * @param {AbortSignal} abortSignal - Signal for aborting the load
     * @param {(doneState: TileLoaderState) => void} onDone - Callback for successful load
     * @param {(error: Error) => void} onError - Callback for load errors
     */
    protected loadImpl(abortSignal: AbortSignal, onDone: (doneState: TileLoaderState) => void, onError: (error: Error) => void): void;
    /**
     * Abstract method for loading tile mesh implementation
     * @abstract
     */
    abstract loadTileMeshImpl(): void;
    /**
     * Collection of resource tile loaders for non-imagery terrain data (DEM, TIN, stratum etc.)
     * @private
     */
    private readonly resourceTileLoader;
    /**
     * Adds a resource tile loader to the collection
     * @protected
     * @param {ResourceTileLoader<TileType, Resource, TTerrainSource>} resourceTileLoader - The loader to add
     */
    protected addResourceTileLoader(resourceTileLoader: ResourceTileLoader<Resource, TTerrainSource>): void;
}
