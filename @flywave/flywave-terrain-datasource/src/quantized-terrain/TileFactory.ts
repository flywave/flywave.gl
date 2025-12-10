/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey } from "@flywave/flywave-geoutils";
import { TileFactory } from "@flywave/flywave-mapview-decoder";

import { ShadowTerrainResourceTile, TerrainResourceTile } from "../TerrainSource";
import { type QuantizedStratumSource } from "./QuantizedStratumSource";
import { type QuantizedTerrainSource } from "./QuantizedTerrainSource";
import { QuantizedStratumTileLoader, QuantizedTerrainTileLoader } from "./TerrainTileLoader";

/**
 * Tile factory for creating quantized terrain tiles
 *
 * This class extends TileFactory to create TerrainResourceTile instances
 * specifically configured for quantized terrain rendering. It ensures
 * that tiles are properly cached and initialized with the appropriate
 * quantized terrain tile loader.
 */
export class QuantizedTerrainTileFactory extends TileFactory<TerrainResourceTile> {
    /**
     * Creates a new quantized terrain tile factory
     */
    constructor() {
        super(TerrainResourceTile);
    }

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
    create(dataSource: QuantizedTerrainSource, tileKey: TileKey) {
        let resourceTile = dataSource.getCachedTile(tileKey);
        if (!resourceTile) {
            resourceTile = new TerrainResourceTile(dataSource as QuantizedTerrainSource, tileKey);
            dataSource.cacheTile(resourceTile);
        }
        let shadowTile = new ShadowTerrainResourceTile(dataSource, tileKey, resourceTile);
        shadowTile.tileLoader = new QuantizedTerrainTileLoader(dataSource, shadowTile);
        (shadowTile.tileLoader as QuantizedTerrainTileLoader).updateView();
        return shadowTile;
    }
}

/**
 * Tile factory for creating quantized stratum tiles
 *
 * This class extends TileFactory to create TerrainResourceTile instances
 * specifically configured for quantized stratum terrain rendering. It ensures
 * that tiles are properly cached and initialized with the appropriate
 * quantized stratum tile loader.
 */
export class QuantizedStratumTileFactory extends TileFactory<TerrainResourceTile> {
    /**
     * Creates a new quantized stratum tile factory
     */
    constructor() {
        super(TerrainResourceTile);
    }

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
    create(dataSource: QuantizedStratumSource, tileKey: TileKey) {
        let resourceTile = dataSource.getCachedTile(tileKey);
        if (!resourceTile) {
            resourceTile = new TerrainResourceTile(dataSource as QuantizedStratumSource, tileKey);
            dataSource.cacheTile(resourceTile);
        }
        
        let shadowTile = new ShadowTerrainResourceTile(dataSource, tileKey, resourceTile);
        shadowTile.tileLoader = new QuantizedStratumTileLoader(dataSource, shadowTile);
        (shadowTile.tileLoader as QuantizedStratumTileLoader).updateView();
        return shadowTile;
    }
}
