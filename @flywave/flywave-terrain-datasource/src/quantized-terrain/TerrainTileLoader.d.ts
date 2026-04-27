import { TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type QuantizedTerrainMesh } from "./quantized-mesh/QuantizedTerrainMesh";
import { type QuantizedStratumResource } from "./quantized-stratum-mesh/QuantizedStratumResource";
import { type QuantizedStratumSource } from "./QuantizedStratumSource";
import { type QuantizedTerrainSource } from "./QuantizedTerrainSource";
/**
 * Loader for quantized stratum terrain data
 *
 * This class extends TerrainTileLoader to provide specialized loading
 * and rendering functionality for quantized stratum terrain data.
 */
export declare class QuantizedStratumTileLoader extends TerrainTileLoader<QuantizedStratumResource, QuantizedStratumSource> {
    protected dataSource: QuantizedStratumSource;
    protected tile: TerrainResourceTile;
    /**
     * Creates a new QuantizedStratumTileLoader instance
     *
     * @param dataSource - The quantized stratum data source
     * @param tile - The terrain resource tile to load
     */
    constructor(dataSource: QuantizedStratumSource, tile: TerrainResourceTile);
    /**
     * Implementation of tile mesh loading for stratum data
     *
     * This method loads and configures the mesh objects for stratum terrain
     * data, including setting up imagery textures and overlay textures.
     */
    loadTileMeshImpl(): void;
    /**
     * Update the view with current tile data
     *
     * This method triggers the loading and setup of the tile's mesh representation.
     */
    updateView(): void;
}
/**
 * Loader for standard quantized terrain data
 *
 * This class extends TerrainTileLoader to provide specialized loading
 * and rendering functionality for standard quantized terrain data.
 */
export declare class QuantizedTerrainTileLoader extends TerrainTileLoader<QuantizedTerrainMesh, QuantizedTerrainSource> {
    protected dataSource: QuantizedTerrainSource;
    protected tile: TerrainResourceTile;
    /**
     * Creates a new QuantizedTerrainTileLoader instance
     *
     * @param dataSource - The quantized terrain data source
     * @param tile - The terrain resource tile to load
     */
    constructor(dataSource: QuantizedTerrainSource, tile: TerrainResourceTile);
    /**
     * Update the view with current tile data
     *
     * This method triggers the loading and setup of the tile's mesh representation.
     */
    updateView(): void;
    /**
     * Creates an intermediate terrain block when exact data isn't available
     *
     * This method creates a height map based terrain mesh that can be used
     * as an intermediate representation when exact quantized mesh data is
     * not available for a specific tile.
     *
     * @param webTiles - Web tile imagery data
     * @param overlayImagery - Overlay imagery data
     * @param parent - Parent tile data for height mapping
     * @returns A configured terrain mesh object
     */
    private makeIntermediateTerrainBlock;
    /**
     * Implementation of tile mesh loading for terrain data
     *
     * This method loads and configures the mesh objects for quantized terrain
     * data, including setting up imagery textures and overlay textures. It
     * handles both exact data loading and intermediate block creation.
     */
    loadTileMeshImpl(): void;
}
