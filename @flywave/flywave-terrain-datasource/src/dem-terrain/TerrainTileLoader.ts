/* Copyright (C) 2025 flywave.gl contributors */

import { TextElement } from "@flywave/flywave-mapview";
import { ResourceTileLoader, TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type DEMTerrainSource } from "./DEMTerrainSource";
import { type DemTileResource } from "./DEMTileProvider";
import { HeightMapTerrainMesh } from "./DEMTileTerrainMesh";
import { Color } from "three/webgpu";

/**
 * Resource tile loader for DEM (Digital Elevation Model) data
 *
 * This class extends ResourceTileLoader to handle the specific requirements
 * of loading DEM data resources for terrain tiles.
 */
export class DemDataLoader extends ResourceTileLoader<DemTileResource, DEMTerrainSource> {
    /**
     * Creates a new DEM data loader
     *
     * @param dataSource - The DEM terrain data source
     * @param tile - The terrain resource tile to load data for
     */
    constructor(protected dataSource: DEMTerrainSource, protected tile: TerrainResourceTile) {
        super(dataSource, tile, dataSource.dataProvider(), dataSource.decoder);
    }
}

/**
 * Terrain tile loader for height map based terrain
 *
 * This class extends TerrainTileLoader to handle the loading and rendering
 * of height map based terrain tiles. It manages the creation of terrain meshes
 * and the application of height maps, imagery textures, and overlay textures.
 */
export class HeightMapTileLoader extends TerrainTileLoader<DemTileResource, DEMTerrainSource> {
    /**
     * Creates a new height map tile loader
     *
     * @param dataSource - The DEM terrain data source
     * @param tile - The terrain resource tile to load
     */
    constructor(protected dataSource: DEMTerrainSource, protected tile: TerrainResourceTile) {
        super(dataSource, tile, dataSource.dataProvider(), dataSource.decoder);

        this.addResourceTileLoader(new DemDataLoader(dataSource, tile));
    }

    /**
     * Updates the view representation of this tile
     *
     * This method triggers the loading and setup of the tile's mesh representation.
     */
    updateView() {
        this.loadTileMeshImpl();
    }

    /**
     * Implements the loading of the tile mesh
     *
     * This method creates and configures the terrain mesh for this tile,
     * applying height maps, imagery textures, and overlay textures as available.
     */
    loadTileMeshImpl() {
        const demTile = this.dataSource
            .dataProvider()
            .getBestAvailableResourceTile(this.tile.tileKey);

        const existingMesh = this.tile.cachedMesh as HeightMapTerrainMesh | null;

        if (existingMesh) {
            this.tile.objects.length = 0;
            if (demTile && demTile.resource) {
                const texture = demTile.resource.demData.getPixels();
                if (texture) {
                    existingMesh.setHeightMap(texture, demTile.tileKey);
                }
            }
            existingMesh.updateUniforms();
            this.dataSource.getWebTileDataSources().forEach(webTiles => {
                const webTile = webTiles.getBestAvailableResourceTile(this.tile.tileKey);
                if (!webTile) return;
                existingMesh.setupImageryTexture(webTile.resource.value, webTiles.tilingScheme);
            });
            existingMesh.projectorState = this.dataSource.getProjectorOverlayManager().state;
            this.tile.objects.push(existingMesh);
            return;
        }

        this.tile.clear();
        this.dataSource.getWebTileDataSources().forEach(webTiles => {
            const webTile = webTiles.getBestAvailableResourceTile(this.tile.tileKey);
            if (!webTile) return;
            const terrainMesh = new HeightMapTerrainMesh(
                this.tile,
                this.dataSource.getTilingScheme(),
                this.dataSource.getProjectionSwitchController(),
                this.dataSource.tileBaseGeometryBuilder
            );
            terrainMesh.setModifierManager(this.dataSource.getGroundModificationManager());
            if (demTile && demTile.resource) {
                const texture = demTile.resource.demData.getPixels();
                if (texture) {
                    terrainMesh.setHeightMap(texture, demTile.tileKey);
                }
            }
            terrainMesh.updateUniforms();
            terrainMesh.setupImageryTexture(webTile.resource.value, webTiles.tilingScheme);
            terrainMesh.projectorState = this.dataSource.getProjectorOverlayManager().state;
            this.tile.cachedMesh = terrainMesh;
            this.tile.objects.push(terrainMesh);
        });
    }
}
