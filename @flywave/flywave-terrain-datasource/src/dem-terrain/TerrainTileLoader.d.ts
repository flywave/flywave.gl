import { ResourceTileLoader, TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type DEMTerrainSource } from "./DEMTerrainSource";
import { type DemTileResource } from "./DEMTileProvider";
/**
 * Resource tile loader for DEM (Digital Elevation Model) data
 *
 * This class extends ResourceTileLoader to handle the specific requirements
 * of loading DEM data resources for terrain tiles.
 */
export declare class DemDataLoader extends ResourceTileLoader<DemTileResource, DEMTerrainSource> {
    protected dataSource: DEMTerrainSource;
    protected tile: TerrainResourceTile;
    /**
     * Creates a new DEM data loader
     *
     * @param dataSource - The DEM terrain data source
     * @param tile - The terrain resource tile to load data for
     */
    constructor(dataSource: DEMTerrainSource, tile: TerrainResourceTile);
}
/**
 * Terrain tile loader for height map based terrain
 *
 * This class extends TerrainTileLoader to handle the loading and rendering
 * of height map based terrain tiles. It manages the creation of terrain meshes
 * and the application of height maps, imagery textures, and overlay textures.
 */
export declare class HeightMapTileLoader extends TerrainTileLoader<DemTileResource, DEMTerrainSource> {
    protected dataSource: DEMTerrainSource;
    protected tile: TerrainResourceTile;
    /**
     * Creates a new height map tile loader
     *
     * @param dataSource - The DEM terrain data source
     * @param tile - The terrain resource tile to load
     */
    constructor(dataSource: DEMTerrainSource, tile: TerrainResourceTile);
    /**
     * Updates the view representation of this tile
     *
     * This method triggers the loading and setup of the tile's mesh representation.
     */
    updateView(): void;
    /**
     * Implements the loading of the tile mesh
     *
     * This method creates and configures the terrain mesh for this tile,
     * applying height maps, imagery textures, and overlay textures as available.
     */
    loadTileMeshImpl(): void;
}
