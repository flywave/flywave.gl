/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox, type TilingScheme, ProjectionType, TileKey } from "@flywave/flywave-geoutils";
import { type MapView, type Tile, TextElement } from "@flywave/flywave-mapview";
import { type BufferGeometry, type Material, Color, Object3D, Vector3 } from "three/webgpu";

import { HeightMapTerrainMesh } from "../dem-terrain/DEMTileTerrainMesh";
import { ResourceTileLoader, TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type WebTile } from "../WebImageryTileProvider";
import { type ProjectorTileEntry, ProjectorState } from "../projector-overlay";
import { type BaseQuantizedTerrainSource } from "./BaseQuantizedTerrainSource";
import { QuantizedMesh } from "./quantized-mesh/QuantizedMesh";
import { type QuantizedTerrainMesh } from "./quantized-mesh/QuantizedTerrainMesh";
import { QuantizedStratumMesh } from "./quantized-stratum-mesh/QuantizedStratumMesh";
import { type QuantizedStratumResource } from "./quantized-stratum-mesh/QuantizedStratumResource";
import { type QuantizedStratumSource } from "./QuantizedStratumSource";
import { type QuantizedTerrainSource } from "./QuantizedTerrainSource";
import { type QuantizedTileResource } from "./QuantizedTileResource";
import { ProjectionSwitchController } from "../ProjectionSwitchController";

/**
 * Custom QuantizedMesh implementation that integrates with MapView for rendering updates
 *
 * This class extends the base QuantizedMesh to provide integration with the
 * MapView rendering system, ensuring that the mesh is updated appropriately
 * before each render frame.
 */
class MapViewQuantizedMesh extends QuantizedMesh {
    /**
     * Creates a new MapViewQuantizedMesh instance
     *
     * @param selfGeobox - The geographic bounding box of this mesh
     * @param quantizedTerrainMesh - The quantized terrain mesh data
     * @param mapView - The MapView instance for rendering updates
     */
    constructor(
        selfGeobox: GeoBox,
        quantizedTerrainMesh: QuantizedTerrainMesh,
        readonly projectionSwitchController: ProjectionSwitchController,
        readonly mapView: MapView
    ) {
        super(selfGeobox, quantizedTerrainMesh, projectionSwitchController, mapView);
    }
}

/**
 * Wrapper class for tile objects that manages positioning and rendering
 *
 * This class wraps terrain mesh objects to handle proper positioning
 * relative to tile centers and provides a consistent interface for
 * accessing geometry and material properties.
 */
class TileObjectMesh extends Object3D {
    /**
     * Creates a new TileObjectMesh instance
     *
     * @param terrainMesh - The terrain mesh to wrap
     * @param tile - The tile this mesh belongs to
     */
    constructor(
        private readonly terrainMesh: Object3D & {
            geometry: BufferGeometry;
            material: Material;
        },
        tile: Tile
    ) {
        super();

        // Adjust mesh position relative to tile center
        terrainMesh.position.add(tile.center.clone().multiplyScalar(-1));
        this.add(terrainMesh);
        this.position.copy(tile.center).multiplyScalar(-1);
    }

    /**
     * Gets the geometry of the wrapped terrain mesh
     */
    get geometry() {
        return this.terrainMesh.geometry;
    }

    /**
     * Gets the material of the wrapped terrain mesh
     */
    get material() {
        return this.terrainMesh.material;
    }

    /**
     * Indicates this object behaves like a mesh
     *
     * This method provides compatibility with Three.js rendering systems
     * that check for mesh-like objects.
     */
    isLikeMesh() {
        return true;
    }

    /**
     * Creates a MapView-compatible quantized mesh object
     *
     * This static method creates a quantized mesh object that is properly
     * configured for use with the MapView rendering system, including
     * imagery textures and overlay textures.
     *
     * @param params - Parameters for creating the mesh
     * @param mapView - The MapView instance for rendering updates
     * @returns A configured Object3D instance
     */
    static makeMapViewQuantizedMesh(
        params: {
            quantizedData: QuantizedTerrainMesh;
            webTiles: WebTile[];
            webTingScheme: TilingScheme;
            tile: TerrainResourceTile;
            quantizedTilingScheme: TilingScheme;
            terrainSource: QuantizedTerrainSource;
        },
        mapView: MapView
    ): Object3D {
        // Create the specialized mesh
        const mesh = new MapViewQuantizedMesh(
            params.tile.geoBox,
            params.quantizedData,
            params.terrainSource.getProjectionSwitchController(),
            mapView
        );

        // Set up imagery textures
        mesh.setupImageryTexture(
            params.webTiles,
            params.webTingScheme,
            params.quantizedTilingScheme
        );

        return new TileObjectMesh(
            mesh as Object3D & {
                geometry: BufferGeometry;
                material: Material;
            },
            params.tile
        );
    }

    /**
     * Creates a stratum mesh object with imagery textures
     *
     * This static method creates a stratum mesh object that is properly
     * configured with imagery textures and overlay textures.
     *
     * @param params - Parameters for creating the mesh
     * @returns A configured Object3D instance
     */
    static makeMapViewStratumMesh(params: {
        stratumData: QuantizedStratumResource;
        webTiles: WebTile[];
        webTingScheme: TilingScheme;
        tile: TerrainResourceTile;
        quantizedTilingScheme: TilingScheme;
        mapView: MapView;
    }): Object3D {
        // Create the stratum mesh
        const mesh = new QuantizedStratumMesh(params.stratumData.tileData, params.mapView);

        // Set up imagery textures
        mesh.setupImageryTexture(
            params.webTiles,
            params.webTingScheme,
            params.quantizedTilingScheme
        );

        return mesh;
    }
}

/**
 * Base loader class for quantized terrain data
 *
 * This class extends ResourceTileLoader to provide specialized loading
 * functionality for quantized terrain data resources.
 */
class QuantizedDataLoader<
    TileResource extends QuantizedTileResource,
    TerrainSource extends BaseQuantizedTerrainSource<TileResource>
> extends ResourceTileLoader<TileResource, TerrainSource> {
    /**
     * Creates a new QuantizedDataLoader instance
     *
     * @param dataSource - The terrain data source
     * @param tile - The terrain resource tile to load data for
     */
    constructor(protected dataSource: TerrainSource, protected tile: TerrainResourceTile) {
        super(dataSource, tile, dataSource.dataProvider(), dataSource.decoder);
    }
}

/**
 * Loader for quantized stratum terrain data
 *
 * This class extends TerrainTileLoader to provide specialized loading
 * and rendering functionality for quantized stratum terrain data.
 */
export class QuantizedStratumTileLoader extends TerrainTileLoader<
    QuantizedStratumResource,
    QuantizedStratumSource
> {
    /**
     * Creates a new QuantizedStratumTileLoader instance
     *
     * @param dataSource - The quantized stratum data source
     * @param tile - The terrain resource tile to load
     */
    constructor(protected dataSource: QuantizedStratumSource, protected tile: TerrainResourceTile) {
        super(dataSource, tile, dataSource.dataProvider(), dataSource.decoder);

        // Add the base quantized data loader
        this.addResourceTileLoader(new QuantizedDataLoader(dataSource, tile));
    }

    /**
     * Implementation of tile mesh loading for stratum data
     *
     * This method loads and configures the mesh objects for stratum terrain
     * data, including setting up imagery textures and overlay textures.
     */
    loadTileMeshImpl(): void {
        this.tile.objects.length = 0;

        const stratumDataResource = this.dataSource
            .dataProvider()
            .getPreciseResource(this.tile.tileKey);
        if (!stratumDataResource) return;

        this.dataSource.getWebTileDataSources().forEach(webTiles => {
            const webTile = webTiles.getBestAvailableResourceTile(this.tile.tileKey);
            if (!webTile) return;

            const mesh = TileObjectMesh.makeMapViewStratumMesh({
                stratumData: stratumDataResource,
                webTiles: webTile.resource.value,
                tile: this.tile,
                webTingScheme: webTiles.tilingScheme,
                quantizedTilingScheme: this.dataSource.getTilingScheme(),
                mapView: this.dataSource.mapView
            });

            this.tile.objects.push(mesh);
        });
    }

    /**
     * Update the view with current tile data
     *
     * This method triggers the loading and setup of the tile's mesh representation.
     */
    updateView() {
        this.loadTileMeshImpl();
    }
}

/**
 * Loader for standard quantized terrain data
 *
 * This class extends TerrainTileLoader to provide specialized loading
 * and rendering functionality for standard quantized terrain data.
 */
export class QuantizedTerrainTileLoader extends TerrainTileLoader<
    QuantizedTerrainMesh,
    QuantizedTerrainSource
> {
    /**
     * Creates a new QuantizedTerrainTileLoader instance
     *
     * @param dataSource - The quantized terrain data source
     * @param tile - The terrain resource tile to load
     */
    constructor(protected dataSource: QuantizedTerrainSource, protected tile: TerrainResourceTile) {
        super(dataSource, tile, dataSource.dataProvider(), dataSource.decoder);

        // Add the base quantized data loader
        this.addResourceTileLoader(new QuantizedDataLoader(dataSource, tile));
    }

    /**
     * Update the view with current tile data
     *
     * This method triggers the loading and setup of the tile's mesh representation.
     */
    updateView() {
        this.loadTileMeshImpl();
    }

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
    private makeIntermediateTerrainBlock(
        webTiles?: {
            webTiles: WebTile[];
            webTingScheme: TilingScheme;
        },
        parent?: {
            tileKey: TileKey;
            resource: QuantizedTerrainMesh;
        }
    ) {
        // Create height map terrain mesh
        const terrainMesh = new HeightMapTerrainMesh(
            this.tile,
            this.dataSource.getTilingScheme(),
            this.dataSource.getProjectionSwitchController(),
            this.dataSource.tileBaseGeometryBuilder
        );
        terrainMesh.setModifierManager(this.dataSource.getGroundModificationManager());

        // If parent data is available, use it for height mapping
        if (parent) {
            let tileKey = parent.tileKey;
            while (tileKey.level >= 0) {
                const tile = this.dataSource.dataProvider().getPreciseResource(tileKey);
                if (tile && tile.demMap) {
                    const texture = tile.demMap.getDisplacementMap();
                    terrainMesh.setHeightMap(texture, tileKey);
                    break;
                }
                if (tileKey.level == 0) break;
                tileKey = tileKey.parent();
            }
        }

        // Update uniforms with current tile configuration
        terrainMesh.updateUniforms();

        // Set up imagery textures if available
        if (webTiles) {
            terrainMesh.setupImageryTexture(webTiles.webTiles, webTiles.webTingScheme);
        }

        return terrainMesh;
    }

    /**
     * Collect the projector overlay layers intersecting this tile.
     *
     * Same source as the DEM path (ProjectorImageryProvider per-tile
     * resources): entries carry the layer's live matrix/texture references.
     */
    private collectProjectorEntries(): ProjectorTileEntry[] {
        const manager = this.dataSource.getProjectorOverlayManager();
        if (manager.count === 0) return [];
        const resourceTile = manager.provider.getBestAvailableResourceTile(this.tile.tileKey);
        return resourceTile ? resourceTile.resource.value : [];
    }

    /**
     * Attach projector layers to the intermediate (height-map) block via the
     * legacy world-space matrix path — HeightMapTerrainMesh renders through
     * DEMTileMeshMaterial, whose projectorState sampling was verified
     * correct (the manager's projector matrices are the fixed
     * exact-enclosure/east-north-aligned versions).
     */
    private setupIntermediateProjector(mesh: HeightMapTerrainMesh): void {
        const manager = this.dataSource.getProjectorOverlayManager();
        const entries = this.collectProjectorEntries();
        if (entries.length === 0) return;

        const state = new ProjectorState();
        entries.forEach((entry, i) => {
            state.textures[i] = entry.texture;
            state.matrices[i] = entry.matrix; // live ref — manager mutates in place
            state.opacities[i] = entry.opacity;
        });
        state.count = entries.length;
        // ⚠️ RISK: live-reference hack — ProjectorState.cameraPos is declared
        // readonly, but a snapshot copy would miss the manager's per-frame
        // RTE refresh and decals would drift when the camera moves. Runtime
        // reassignment of the property keeps the shader reading the live
        // manager.cameraPos.
        (state as any).cameraPos = manager.cameraPos;
        (mesh as any).projectorState = state;
    }

    /**
     * Implementation of tile mesh loading for terrain data
     *
     * This method loads and configures the mesh objects for quantized terrain
     * data, including setting up imagery textures and overlay textures. It
     * handles both exact data loading and intermediate block creation.
     */
    loadTileMeshImpl() {
        this.tile.clear();

        let quantizedDataResource = this.dataSource
            .dataProvider()
            .getBestAvailableResourceTile(this.tile.tileKey);

        let needDemDraw = false;
        if (
            quantizedDataResource?.resource.tryReprojectToProjection(
                this.dataSource.mapView.projection
            )
        ) {
            needDemDraw = true;
        }

        const projectorEntries = this.collectProjectorEntries();

        this.dataSource.getWebTileDataSources().forEach(webTiles => {
            const webTile = webTiles.getBestAvailableResourceTile(this.tile.tileKey);
            if (!webTile) return;

            if (
                !quantizedDataResource ||
                needDemDraw ||
                this.tile.tileKey.level !== quantizedDataResource.tileKey.level ||
                quantizedDataResource.resource.isGroundElevationModified ||
                this.dataSource.getGroundModificationManager().getModifierCount() > 0
            ) {
                const block = this.makeIntermediateTerrainBlock(
                    {
                        webTiles: webTile.resource.value,
                        webTingScheme: webTiles.tilingScheme
                    },
                    quantizedDataResource
                );
                this.setupIntermediateProjector(block);
                this.tile.objects.push(block);
            } else {
                if (!quantizedDataResource?.resource) return;
                const mesh = TileObjectMesh.makeMapViewQuantizedMesh(
                    {
                        quantizedData: quantizedDataResource.resource,
                        webTiles: webTile.resource.value,
                        tile: this.tile,
                        webTingScheme: webTiles.tilingScheme,
                        terrainSource: this.dataSource,
                        quantizedTilingScheme: this.dataSource.getTilingScheme()
                    },
                    this.dataSource.mapView
                );
                // Projector decals: UV-transform sampling with the signed
                // offset (see QuantizedMesh.setupProjectorTextures).
                if (projectorEntries.length > 0) {
                    const inner = mesh.children[0] as any;
                    if (inner?.setupProjectorTextures) {
                        inner.setupProjectorTextures(
                            projectorEntries,
                            this.dataSource.getProjectorOverlayManager().provider.tilingScheme,
                            this.dataSource.getTilingScheme()
                        );
                    }
                }
                this.tile.objects.push(mesh);
            }
        });

        // Projector-only tiles (no web imagery provider produced an object):
        // still render the quantized mesh so decals have a surface.
        if (projectorEntries.length > 0 && this.tile.objects.length === 0) {
            if (quantizedDataResource?.resource) {
                const mesh = TileObjectMesh.makeMapViewQuantizedMesh(
                    {
                        quantizedData: quantizedDataResource.resource,
                        webTiles: [],
                        webTingScheme: this.dataSource.getTilingScheme(),
                        tile: this.tile,
                        terrainSource: this.dataSource,
                        quantizedTilingScheme: this.dataSource.getTilingScheme()
                    },
                    this.dataSource.mapView
                );
                const inner = mesh.children[0] as any;
                if (inner?.setupProjectorTextures) {
                    inner.setupProjectorTextures(
                        projectorEntries,
                        this.dataSource.getProjectorOverlayManager().provider.tilingScheme,
                        this.dataSource.getTilingScheme()
                    );
                }
                this.tile.objects.push(mesh);
            }
        }
    }
}
