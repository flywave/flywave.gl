import { type TileKey } from "@flywave/flywave-geoutils";
import { TileFactory } from "@flywave/flywave-mapview-decoder";
import { ShadowTerrainResourceTile, TerrainResourceTile } from "../TerrainSource";
import { type QuantizedStratumSource } from "./QuantizedStratumSource";
import { type QuantizedTerrainSource } from "./QuantizedTerrainSource";
/**
 * Tile factory for creating quantized terrain tiles
 *
 * This class extends TileFactory to create TerrainResourceTile instances
 * specifically configured for quantized terrain rendering. It ensures
 * that tiles are properly cached and initialized with the appropriate
 * quantized terrain tile loader.
 */
export declare class QuantizedTerrainTileFactory extends TileFactory<TerrainResourceTile> {
    /**
     * Creates a new quantized terrain tile factory
     */
    constructor();
    /**
     * Creates a terrain resource tile for the specified data source and tile key
     *
     * This method first checks if a tile is already cached for the given tile key.
     * If not, it creates a new tile, caches it, and initializes it with a quantized
     * terrain tile loader. It then triggers an update of the tile's view representation.
     *
     * @param dataSource - The quantized terrain data source
     * @param tileKey - The tile key identifying the tile to create
     * @returns The created or cached terrain resource tile
     */
    create(dataSource: QuantizedTerrainSource, tileKey: TileKey): ShadowTerrainResourceTile;
}
/**
 * Tile factory for creating quantized stratum tiles
 *
 * This class extends TileFactory to create TerrainResourceTile instances
 * specifically configured for quantized stratum terrain rendering. It ensures
 * that tiles are properly cached and initialized with the appropriate
 * quantized stratum tile loader.
 */
export declare class QuantizedStratumTileFactory extends TileFactory<TerrainResourceTile> {
    /**
     * Creates a new quantized stratum tile factory
     */
    constructor();
    /**
     * Creates a terrain resource tile for the specified data source and tile key
     *
     * This method first checks if a tile is already cached for the given tile key.
     * If not, it creates a new tile, caches it, and initializes it with a quantized
     * stratum tile loader. It then triggers an update of the tile's view representation.
     *
     * @param dataSource - The quantized stratum data source
     * @param tileKey - The tile key identifying the tile to create
     * @returns The created or cached terrain resource tile
     */
    create(dataSource: QuantizedStratumSource, tileKey: TileKey): ShadowTerrainResourceTile;
}
