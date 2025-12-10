/* Copyright (C) 2025 flywave.gl contributors */

import { TextElement } from "@flywave/flywave-mapview";
import { ResourceTileLoader, TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type DEMTerrainSource } from "./DEMTerrainSource";
import { type DemTileResource } from "./DEMTileProvider";
import { HeightMapTerrainMesh } from "./DEMTileTerrainMesh";
import { Color } from "three";

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
        // Get the nearest DEM tile for this tile key
        const demTile = this.dataSource
            .dataProvider()
            .getBestAvailableResourceTile(this.tile.tileKey);

        const overlayImagery = this.dataSource
            .getGroundOverlayProvider()
            .getBestAvailableResourceTile(this.tile.tileKey);

        this.tile.objects.length = 0;
        this.dataSource.getWebTileDataSources().forEach(webTiles => {
            const webTile = webTiles.getBestAvailableResourceTile(this.tile.tileKey);
            if (!webTile) return;
            // Create the terrain mesh for this tile
            const terrainMesh = new HeightMapTerrainMesh(
                this.tile,
                this.dataSource.getTilingScheme(),
                this.dataSource.getProjectionSwitchController(),
                this.dataSource.tileBaseGeometryBuilder
            );
            // terrainMesh.displacement.add(this.tile.center.clone().multiplyScalar(-1));
            // If we have DEM data, set up the height map
            if (demTile && demTile.resource) {
                const texture = demTile.resource.demData.getPixels();
                if (texture) {
                    // Set the height map texture and position
                    terrainMesh.setHeightMap(texture, demTile.tileKey);
                }
            }

            // Update uniforms with current tile configuration
            terrainMesh.updateUniforms();

            terrainMesh.setupImageryTexture(webTile.resource.value, webTiles.tilingScheme);

            if (overlayImagery && overlayImagery.resource?.texture) {
                terrainMesh.setupOverlayerTexture(overlayImagery.resource, webTiles.tilingScheme);
            }

            // Add the mesh to the tile's objects
            this.tile.objects.push(terrainMesh);
        });
    }
}
