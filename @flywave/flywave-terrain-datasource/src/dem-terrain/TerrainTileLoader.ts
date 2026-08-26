/* Copyright (C) 2025 flywave.gl contributors */

import { TextElement } from "@flywave/flywave-mapview";
import { webMercatorTerrainTilingScheme } from "@flywave/flywave-geoutils";
import { ResourceTileLoader, TerrainTileLoader } from "../ResourceTileLoader";
import { type TerrainResourceTile } from "../TerrainSource";
import { type DEMTerrainSource } from "./DEMTerrainSource";
import { type DemTileResource } from "./DEMTileProvider";
import {
    DEMTileBaseMaterial,
    DEMTileOverlayMaterial,
    type DEMLayerKind
} from "./DEMTileLayerMaterial";
import { TerrainLayerMesh, TerrainTileState } from "./TerrainLayerMesh";
import { type ProjectorTileEntry, projectorBlending } from "../projector-overlay";
import type * as THREE from "three/webgpu";

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

interface TargetLayer {
    key: string;
    kind: DEMLayerKind;
    texture?: THREE.Texture;
    uvTransform?: THREE.Vector4;
    opacity?: number;
    blending?: THREE.Blending;
}

/**
 * Terrain tile loader for height map based terrain
 *
 * Renders one tile as a stack of layer meshes sharing the tile's geometry and
 * uniform state: a single lit base mesh (first imagery tile or solid color)
 * plus one unlit decal mesh per additional imagery tile. Layer materials are
 * never shared between tiles; meshes are cached per (tile, layerKey) and only
 * recreated when the layer set itself changes.
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
     * Diff-based rebuild of the tile's layer meshes.
     *
     * Existing (tileKey, layerKey) meshes are reused with their texture
     * swapped in place; meshes are created or disposed only when the layer
     * set changes.
     */
    loadTileMeshImpl() {
        const state = this.ensureTileState();

        const demTile = this.dataSource
            .dataProvider()
            .getBestAvailableResourceTile(this.tile.tileKey);
        if (demTile && demTile.resource) {
            const texture = demTile.resource.demData.getPixels();
            if (texture) {
                state.setHeightMap(texture, demTile.tileKey);
            }
        }

        const targets = this.collectImageryLayers(state);

        const meshes = this.tile.layerMeshes;
        const seen = new Set<string>();

        for (const target of targets) {
            seen.add(target.key);

            const existing = meshes.get(target.key);
            if (existing && existing.layerKind === target.kind) {
                existing.visible = true;
                this.updateLayerMesh(existing, target);
                continue;
            }
            if (existing) {
                // Kind mismatch should not happen with stable layer keys; if
                // it ever does, hide the old mesh (never dispose here).
                existing.visible = false;
            }
            meshes.set(target.key, this.createLayerMesh(state, target));
        }

        // Layers absent from the current target set fall into two classes:
        //  - TRANSIENT (imagery/projector resources briefly evicted and not
        //    yet reloaded — frequent at high zoom levels while the camera
        //    moves): the layer's SOURCE still exists, so KEEP the mesh
        //    visible with its last texture. Hiding it here was the cause of
        //    the high-level movement flicker (the pre-refactor pipeline
        //    never dropped content during resource gaps — it skipped the
        //    texture update and kept rendering the last-good imagery).
        //  - REMOVED (web provider / projector layer actually deleted): hide.
        for (const [key, mesh] of meshes) {
            if (!seen.has(key)) {
                mesh.visible = !this.layerSourceExists(key);
            }
        }

        this.tile.objects.length = 0;
        targets.forEach((target, index) => {
            const mesh = meshes.get(target.key)!;
            mesh.renderOrder = index;
            this.tile.objects.push(mesh);
        });
        // Kept-alive transient layers must ALSO stay in the render list —
        // the renderer only draws tile.objects, visible alone does nothing.
        for (const [key, mesh] of meshes) {
            if (!seen.has(key) && mesh.visible) {
                this.tile.objects.push(mesh);
            }
        }
    }

    private ensureTileState(): TerrainTileState {
        let state = this.tile.layerTileState;
        if (!state) {
            // Adopt meshes + state preserved from a previous incarnation of
            // this tileKey (terrain-LRU eviction) — avoids material graph
            // rebuilds when the camera returns to recently evicted tiles.
            const preserved = this.dataSource.acquireLayerMeshes(this.tile.tileKey);
            if (preserved) {
                this.tile.adoptLayerMeshes(preserved);
                state = preserved.state;
            }
        }
        if (!state) {
            const geometryBuilder = this.dataSource.tileBaseGeometryBuilder;
            const geometryWithTransform = geometryBuilder.getTileGeometryWithTransform(
                this.tile.tileKey
            );
            state = new TerrainTileState(
                this.tile.tileKey,
                this.dataSource.getTilingScheme(),
                this.dataSource.getProjectionSwitchController(),
                geometryBuilder,
                geometryWithTransform
            );
            this.tile.layerTileState = state;
        }
        // Bind the CURRENT shadow tile incarnation — displacement must be
        // computed against the same tile whose center the renderer adds back.
        state.attachTile(this.tile);
        state.setModifierManager(this.dataSource.getGroundModificationManager());
        return state;
    }

    private collectImageryLayers(state: TerrainTileState): TargetLayer[] {
        const providers = this.dataSource.getWebTileDataSources();
        const targets: TargetLayer[] = [];
        let baseAssigned = false;

        providers.forEach(provider => {
            const webTile = provider.getBestAvailableResourceTile(this.tile.tileKey);
            if (!webTile) return;

            webTile.resource.value.forEach((webTileEntry, index) => {
                const transform = state.computeTextureUvTransform(
                    webTileEntry.geoBox,
                    provider.tilingScheme
                );
                if (transform === false) return;

                webTileEntry.texture.flipY = this.dataSource.isYAxisDown;
                if (!baseAssigned) {
                    // Stable "base" key: the lit base mesh never changes
                    // identity — progressive resolution upgrades swap the
                    // albedo texture / uv transform in place (zero material
                    // rebuilds, zero pipeline recompiles).
                    baseAssigned = true;
                    targets.push({
                        key: "base",
                        kind: "base",
                        texture: webTileEntry.texture,
                        uvTransform: transform
                    });
                } else {
                    targets.push({
                        key: `web:${provider.uuid}:${index}`,
                        kind: "overlay",
                        texture: webTileEntry.texture,
                        uvTransform: transform
                    });
                }
            });
        });

        // 未配置任何卫星图层数据源：直接不渲染地形 mesh。已配置图层但
        // 本瓦片纹理未就绪时仍保留 base 兜底（渐进加载连续性不受影响）。
        if (!baseAssigned && providers.length > 0) {
            targets.push({ key: "base", kind: "base" });
        }

        this.collectProjectorLayers(state, targets);

        return targets;
    }

    private collectProjectorLayers(state: TerrainTileState, targets: TargetLayer[]): void {
        const manager = this.dataSource.getProjectorOverlayManager();
        const resourceTile = manager.provider.getBestAvailableResourceTile(this.tile.tileKey);
        if (!resourceTile) return;

        for (const entry of resourceTile.resource.value) {
            // UV mode — same sampling path as satellite imagery. The UV
            // transform MUST be computed in the imagery (web-mercator)
            // projected space: the shader samples with the webMercatorY
            // attribute, which is linear in mercator Y. Per-tile values were
            // verified numerically exact (geoBox corners map to uv (0,0)/(1,1)).
            // NOTE: never set texture.needsUpdate here — this runs on every
            // tile rebuild and would re-upload the texture each pass.
            const transform = state.computeTextureUvTransform(
                entry.geoBox,
                manager.provider.tilingScheme ?? webMercatorTerrainTilingScheme,
                true // invertV — see TerrainTileState.computeTextureUvTransform
            );
            if (transform === false) continue;

            // flipY follows the SAME convention as the proven DEM/imagery
            // paths (see TerrainTileState.setHeightMap: texture.flipY =
            // yDown, and computeHeightMapPos' row flip): uv.y/webMercatorY
            // increase NORTHWARD (south = 0, north = 1) and the texture v
            // axis then has v = 0 at the image BOTTOM (south) — matching the
            // positive-scale signed-offset transform from
            // computeTextureUvTransform(..., invertV = true).
            // NOTE: never set texture.needsUpdate here — this runs on every
            // tile rebuild and would re-upload the texture each pass.
            entry.texture.flipY = this.dataSource.isYAxisDown;
            targets.push({
                key: `proj:${entry.layerId}`,
                kind: "projector",
                texture: entry.texture,
                uvTransform: transform,
                opacity: entry.opacity,
                blending: projectorBlending(entry.blendMode)
            });
        }
    }

    private createLayerMesh(state: TerrainTileState, target: TargetLayer): TerrainLayerMesh {
        if (target.kind === "base") {
            const material = new DEMTileBaseMaterial();
            const mesh = new TerrainLayerMesh(
                state.geometryRef,
                material,
                state,
                target.key,
                target.kind
            );
            mesh.setImagery(target.texture ?? null, target.uvTransform);
            return mesh;
        }

        // Imagery overlays AND projector layers share the imagery-mode
        // (tile-UV × uvTransform) color graph.
        const material = new DEMTileOverlayMaterial(
            target.blending !== undefined ? { blending: target.blending } : undefined
        );
        const mesh = new TerrainLayerMesh(
            state.geometryRef,
            material,
            state,
            target.key,
            target.kind
        );
        if (target.texture) {
            mesh.setLayerTexture(target.texture);
        }
        if (target.uvTransform) {
            mesh.setLayerUvTransform(target.uvTransform);
        }
        if (target.opacity !== undefined) {
            mesh.setLayerOpacity(target.opacity);
        }
        return mesh;
    }

    /** Whether the layer's SOURCE (provider / projector layer) still exists. */
    private layerSourceExists(key: string): boolean {
        if (key === "base") return true;
        if (key.startsWith("proj:")) {
            return this.dataSource
                .getProjectorOverlayManager()
                .hasLayer(parseInt(key.slice(5), 10));
        }
        if (key.startsWith("web:")) {
            // key format: web:<provider-uuid>:<index>
            const uuid = key.slice(4, key.lastIndexOf(":"));
            return this.dataSource
                .getWebTileDataSources()
                .some(provider => provider.uuid === uuid);
        }
        return false;
    }

    private updateLayerMesh(mesh: TerrainLayerMesh, target: TargetLayer): void {
        if (target.kind === "base") {
            // Never DOWNGRADE to the gray fallback during transient imagery
            // gaps (high-zoom movement churn): keep the last-good texture
            // until a new one arrives — matches the pre-refactor pipeline.
            if (target.texture !== undefined || mesh.layerTexture === null) {
                mesh.setImagery(target.texture ?? null, target.uvTransform);
            }
            return;
        }

        if (target.texture) {
            mesh.setLayerTexture(target.texture);
        }
        if (target.uvTransform) {
            mesh.setLayerUvTransform(target.uvTransform);
        }
        if (target.opacity !== undefined) {
            mesh.setLayerOpacity(target.opacity);
        }
        const material = mesh.material as DEMTileOverlayMaterial;
        if (target.blending !== undefined && material.blending !== target.blending) {
            material.blending = target.blending;
            material.needsUpdate = true;
        }
    }
}
