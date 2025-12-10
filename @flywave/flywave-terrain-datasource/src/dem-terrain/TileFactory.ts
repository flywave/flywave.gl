/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey } from "@flywave/flywave-geoutils";
import { TileFactory } from "@flywave/flywave-mapview-decoder";

import { ShadowTerrainResourceTile, TerrainResourceTile } from "../TerrainSource";
import { type DEMTerrainSource } from "./DEMTerrainSource";
import { HeightMapTileLoader } from "./TerrainTileLoader";

/**
 * Tile factory for creating height map based terrain tiles
 *
 * This class extends TileFactory to create TerrainResourceTile instances
 * specifically configured for height map based terrain rendering. It ensures
 * that tiles are properly cached and initialized with the appropriate
 * height map tile loader.
 */
export class HeightMapTileFactory extends TileFactory<TerrainResourceTile> {
    /**
     * Creates a new height map tile factory
     */
    constructor() {
        super(TerrainResourceTile);
    }

    /**
     * Creates a terrain resource tile for the specified data source and tile key
     *
     * This method first checks if a tile is already cached for the given tile key.
     * If not, it creates a new tile, caches it, and initializes it with a height
     * map tile loader. It then triggers an update of the tile's view representation.
     *
     * @param dataSource - The DEM terrain data source
     * @param tileKey - The tile key identifying the tile to create
     * @returns The created or cached terrain resource tile
     */
    create(dataSource: DEMTerrainSource, tileKey: TileKey) {
        let resTile = dataSource.getCachedTile(tileKey);
        if (!resTile) {
            resTile = new TerrainResourceTile(dataSource as DEMTerrainSource, tileKey);
            dataSource.cacheTile(resTile);
        }
        let tile = new ShadowTerrainResourceTile(dataSource as DEMTerrainSource, tileKey, resTile);
        tile.tileLoader = new HeightMapTileLoader(dataSource, tile);
        (tile.tileLoader as HeightMapTileLoader).updateView();
        return tile;
    }
}
