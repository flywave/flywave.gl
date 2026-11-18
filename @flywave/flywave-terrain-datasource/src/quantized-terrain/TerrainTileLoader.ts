/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type TileKey,
    type TilingScheme,
    ConvertWebMercatorY,
    ProjectionType
} from "@flywave/flywave-geoutils";
import { type MapView, type Tile, TextElement } from "@flywave/flywave-mapview";
import { type BufferGeometry, type Material, Color, Mesh, Object3D, Vector3 } from "three/webgpu";

import { HeightMapTerrainMesh } from "../dem-terrain/DEMTileTerrainMesh";
import { type ProjectionSwitchController } from "../ProjectionSwitchController";
import { type ProjectorTileEntry } from "../projector-overlay";
import { projectorBlending } from "../projector-overlay";
import { ResourceTileLoader, TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type WebTile } from "../WebImageryTileProvider";
import { type BaseQuantizedTerrainSource } from "./BaseQuantizedTerrainSource";
import { computeDecalUvTransform, QuantizedMesh } from "./quantized-mesh/QuantizedMesh";
import { QuantizedDecalMaterial } from "./quantized-mesh/QuantizedMeshMaterial";
import { type QuantizedTerrainMesh } from "./quantized-mesh/QuantizedTerrainMesh";
import { QuantizedStratumMesh } from "./quantized-stratum-mesh/QuantizedStratumMesh";
import { type QuantizedStratumResource } from "./quantized-stratum-mesh/QuantizedStratumResource";
import { type QuantizedStratumSource } from "./QuantizedStratumSource";
import { type QuantizedTerrainSource } from "./QuantizedTerrainSource";
import { type QuantizedTileResource } from "./QuantizedTileResource";

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
                    // Decoding constants follow the DEM encoding (self-produced
                    // quantized DEM is mapbox by default, so behavior is unchanged)
                    terrainMesh.setHeightMap(texture, tileKey, tile.demMap.unpackVector);
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
     * resources).
     */
    private collectProjectorEntries(): ProjectorTileEntry[] {
        const manager = this.dataSource.getProjectorOverlayManager();
        if (manager.count === 0) return [];
        const resourceTile = manager.provider.getBestAvailableResourceTile(this.tile.tileKey);
        return resourceTile ? resourceTile.resource.value : [];
    }

    /**
     * Attach one decal MESH per projector layer as a child of the terrain
     * mesh — the layer×mesh architecture used by the DEM path: shared tile
     * geometry (bit-identical depth), per-layer material instance with
     * per-material texture/transform/opacity nodes set once at creation.
     */
    private attachDecalMeshes(
        terrainMesh: Object3D & { geometry: BufferGeometry },
        selfGeoBox: GeoBox
    ): void {
        const entries = this.collectProjectorEntries();
        if (entries.length === 0) return;
        const scheme = this.dataSource.getProjectorOverlayManager().provider.tilingScheme;

        for (const entry of entries) {
            const transform = computeDecalUvTransform(selfGeoBox, entry.geoBox, scheme);
            if (transform === false) continue;
            // Same flipY convention as the DEM projector path; NEVER set
            // needsUpdate here (hot path — re-uploads every tile rebuild).
            entry.texture.flipY = true;

            const material = new QuantizedDecalMaterial({
                blending: projectorBlending(entry.blendMode)
            });
            material.decalTexNode.value = entry.texture;
            material.uvTexTransform.value.copy(transform);
            material.opacityUniform.value = entry.opacity;

            const decal = new Mesh(terrainMesh.geometry, material);
            decal.castShadow = false;
            decal.receiveShadow = false;
            decal.frustumCulled = false;
            decal.raycast = () => {};
            terrainMesh.add(decal);
        }
    }

    /**
     * Restricts an ancestor's mesh to this tile's exact extent.
     *
     * The clipping happens in the fragment shader (see
     * `QuantizedMeshMaterial`): every fragment outside the window is
     * discarded, so the ancestor's geometry covers exactly the requested tile
     * without overlapping its neighbours.
     */
    private applyTileClip(mesh: QuantizedMesh, ancestorTileKey: TileKey): void {
        const tilingScheme = this.dataSource.getTilingScheme();
        const ancestorGeoBox = tilingScheme.getGeoBox(ancestorTileKey);
        const tileGeoBox = this.tile.geoBox;

        const uMin = (tileGeoBox.west - ancestorGeoBox.west) / ancestorGeoBox.longitudeSpan;
        const uMax = (tileGeoBox.east - ancestorGeoBox.west) / ancestorGeoBox.longitudeSpan;

        // The mesh stores `webMercatorY = 1 - mercatorY(latitude)` normalized to
        // the ancestor's latitude span, so the vertical window is computed with
        // the same converter.
        const toRadians = Math.PI / 180;
        const converter = new ConvertWebMercatorY(
            ancestorGeoBox.south * toRadians,
            ancestorGeoBox.north * toRadians
        );
        const vMin = 1 - converter.convert(tileGeoBox.north * toRadians);
        const vMax = 1 - converter.convert(tileGeoBox.south * toRadians);

        // Cesium makes the upsampled child mesh share the parent's exact
        // (integer-quantized) UV edges and hides LOD cracks with skirts. A
        // fragment-space clip has neither, and the interpolated `webMercatorY`
        // differs slightly from the analytic boundary value, which leaves a
        // hairline gap at the clip edge. Overlap the window by a fraction of a
        // child texel instead: the neighbouring tile draws on top where it is
        // higher, and the gap is closed where it is not.
        const overlap = 1 / 512;
        const marginU = (uMax - uMin) * overlap;
        const marginV = (vMax - vMin) * overlap;
        mesh.clipUvRect.set(
            uMin - marginU,
            vMin - marginV,
            uMax + marginU,
            vMax + marginV
        );
        mesh.clipEnabled = 1;
    }

    /**
     * Requests the worker-clipped fallback mesh (exact extent + skirts) for a
     * tile whose own resource is still loading.
     *
     * The result is cached in the tile's resource manager under its own key
     * and replaces the fragment-clipped ancestor fill as soon as it arrives,
     * so the T-junction crack against neighbouring tiles only exists for the
     * first frames.
     */
    private requestFallbackMesh(fallbackResourceKey: string): void {
        const resourceManager = this.tile.resourceManager;
        if (resourceManager.hasLoadingResource(fallbackResourceKey)) {
            return;
        }

        const provider = this.dataSource.dataProvider();
        const promise = provider
            .createFallbackMesh(this.tile.tileKey)
            .then(mesh => {
                if (mesh === undefined) {
                    return undefined;
                }
                // The exact resource may have arrived while the worker clipped.
                if (provider.getPreciseResource(this.tile.tileKey) !== undefined) {
                    mesh.dispose();
                    return undefined;
                }
                mesh.connectToDataSource(this.dataSource, this.tile.tileKey);
                resourceManager.setResource(fallbackResourceKey, mesh);
                return mesh;
            })
            .catch(() => undefined)
            .finally(() => {
                resourceManager.removeLoadingResource(fallbackResourceKey);
                if (resourceManager.hasResource(fallbackResourceKey)) {
                    this.dataSource.updateMemoryUsage(this.tile);
                    // Rebuild now instead of waiting for the debounced
                    // overlay refresh, so the skirted mesh takes over quickly.
                    this.loadTileMeshImpl();
                    this.dataSource.mapView.update();
                }
            });

        resourceManager.addLoadingResource(
            fallbackResourceKey,
            this.tile.tileKey,
            promise as unknown as Promise<never>
        );
    }

    /**
     * Implementation of tile mesh loading for terrain data
     *
     * This method loads and configures the mesh objects for quantized terrain
     * data, including setting up imagery textures and overlay textures. It
     * handles both exact data loading and intermediate block creation.
     *
     * Projector decals render as per-layer decal meshes on BOTH paths (exact
     * quantized meshes and height-map intermediate blocks).
     */
    loadTileMeshImpl() {
        this.tile.clear();

        const provider = this.dataSource.dataProvider();
        const fallbackResourceKey = `${provider.getResourceKey()}:fallback`;
        const resourceManager = this.tile.resourceManager;

        const quantizedDataResource = provider.getBestAvailableResourceTile(this.tile.tileKey);

        // Start the projection switch when needed. The resource keeps its
        // previous projection until the reprojection completes; the tile is
        // simply rendered with it and rebuilt when the new geometry is ready.
        quantizedDataResource?.resource.tryReprojectToProjection(
            this.dataSource.mapView.projection
        );

        const resource = quantizedDataResource?.resource;
        const hasGroundModifiers =
            this.dataSource.getGroundModificationManager().getModifierCount() > 0;
        // Ground modifications are baked into the tile's DEM raster, so those
        // tiles are the only ones still rendered through the height-map block.
        const useModifiedBlock =
            resource?.demMap !== undefined &&
            (hasGroundModifiers || resource.isGroundElevationModified);
        const exactResource =
            quantizedDataResource !== undefined &&
            quantizedDataResource.tileKey.level === this.tile.tileKey.level
                ? quantizedDataResource.resource
                : undefined;

        // The tile's own resource is here: drop the temporary fallback.
        if (exactResource !== undefined) {
            resourceManager.removeResource(fallbackResourceKey);
        }

        // Worker-clipped fallback (exact extent + skirts). Until it arrives the
        // raw ancestor below covers the tile with a fragment-space clip.
        const workerFallback =
            exactResource === undefined && !useModifiedBlock
                ? resourceManager.getResource<QuantizedTerrainMesh>(fallbackResourceKey)
                : undefined;
        if (exactResource === undefined && !useModifiedBlock && workerFallback === undefined) {
            this.requestFallbackMesh(fallbackResourceKey);
        }

        this.dataSource.getWebTileDataSources().forEach(webTiles => {
            const webTile = webTiles.getBestAvailableResourceTile(this.tile.tileKey);
            if (!webTile) return;

            if (useModifiedBlock) {
                const block = this.makeIntermediateTerrainBlock(
                    {
                        webTiles: webTile.resource.value,
                        webTingScheme: webTiles.tilingScheme
                    },
                    quantizedDataResource
                );
                this.attachDecalMeshes(block, this.tile.geoBox);
                this.tile.objects.push(block);
                return;
            }

            // A real mesh for this tile's exact extent: draw it as is.
            const renderResource = exactResource ?? workerFallback;
            if (renderResource) {
                const mesh = TileObjectMesh.makeMapViewQuantizedMesh(
                    {
                        quantizedData: renderResource,
                        webTiles: webTile.resource.value,
                        tile: this.tile,
                        webTingScheme: webTiles.tilingScheme,
                        terrainSource: this.dataSource,
                        quantizedTilingScheme: this.dataSource.getTilingScheme()
                    },
                    this.dataSource.mapView
                );
                // Per-layer decal meshes (layer×mesh, same as the DEM path).
                const inner = mesh.children[0] as QuantizedMesh;
                this.attachDecalMeshes(inner, inner.geoBox);
                this.tile.objects.push(mesh);
                return;
            }

            // First frames only: the tile's own resource has not arrived yet,
            // draw the nearest cached ancestor's mesh clipped to this tile's
            // exact extent (fragment discard, no height raster, no geometry
            // clipping). It lacks skirts, so the worker-clipped mesh requested
            // above replaces it as soon as it is ready.
            if (!quantizedDataResource) return;
            const fallbackMesh = TileObjectMesh.makeMapViewQuantizedMesh(
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
            const fallbackInner = fallbackMesh.children[0] as QuantizedMesh;
            this.applyTileClip(fallbackInner, quantizedDataResource.tileKey);
            this.tile.objects.push(fallbackMesh);
        });

        // Projector-only tiles (no web imagery provider produced an object):
        // still render the quantized mesh so decals have a surface.
        if (this.collectProjectorEntries().length > 0 && this.tile.objects.length === 0) {
            if (exactResource) {
                const mesh = TileObjectMesh.makeMapViewQuantizedMesh(
                    {
                        quantizedData: exactResource,
                        webTiles: [],
                        webTingScheme: this.dataSource.getTilingScheme(),
                        tile: this.tile,
                        terrainSource: this.dataSource,
                        quantizedTilingScheme: this.dataSource.getTilingScheme()
                    },
                    this.dataSource.mapView
                );
                const inner = mesh.children[0] as QuantizedMesh;
                this.attachDecalMeshes(inner, inner.geoBox);
                this.tile.objects.push(mesh);
            }
        }
    }
}
