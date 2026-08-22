/* Copyright (C) 2025 flywave.gl contributors */

import { TextElement } from "@flywave/flywave-mapview";
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
    projectorMatrix?: THREE.Matrix4;
    cameraPos?: THREE.Vector3;
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
                this.updateLayerMesh(existing, target);
                continue;
            }
            if (existing) {
                existing.dispose();
                meshes.delete(target.key);
            }
            meshes.set(target.key, this.createLayerMesh(state, target));
        }

        for (const key of Array.from(meshes.keys())) {
            if (!seen.has(key)) {
                meshes.get(key)!.dispose();
                meshes.delete(key);
            }
        }

        this.tile.objects.length = 0;
        targets.forEach((target, index) => {
            const mesh = meshes.get(target.key)!;
            mesh.renderOrder = index;
            this.tile.objects.push(mesh);
        });
    }

    private ensureTileState(): TerrainTileState {
        let state = this.tile.layerTileState;
        if (!state) {
            const geometryBuilder = this.dataSource.tileBaseGeometryBuilder;
            const geometryWithTransform = geometryBuilder.getTileGeometryWithTransform(
                this.tile.tileKey
            );
            state = new TerrainTileState(
                this.tile,
                this.dataSource.getTilingScheme(),
                this.dataSource.getProjectionSwitchController(),
                geometryBuilder,
                geometryWithTransform
            );
            state.setModifierManager(this.dataSource.getGroundModificationManager());
            this.tile.layerTileState = state;
        }
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

        // Gray fallback only when no imagery provider is configured at all.
        // While providers exist but nothing has loaded yet the tile renders
        // nothing (same as the pre-refactor behavior) — avoids creating a
        // throwaway material that would be replaced (and recompiled) as soon
        // as the first imagery tile arrives.
        if (!baseAssigned && providers.length === 0) {
            targets.push({ key: "base", kind: "base" });
        }

        this.collectProjectorLayers(targets);

        return targets;
    }

    private collectProjectorLayers(targets: TargetLayer[]): void {
        const manager = this.dataSource.getProjectorOverlayManager();
        const resourceTile = manager.provider.getBestAvailableResourceTile(this.tile.tileKey);
        if (!resourceTile) return;

        const cameraPos = manager.cameraPos;
        for (const entry of resourceTile.resource.value) {
            targets.push({
                key: `proj:${entry.layerId}`,
                kind: "projector",
                texture: entry.texture,
                opacity: entry.opacity,
                projectorMatrix: entry.matrix,
                cameraPos,
                blending: projectorBlending(entry.blendMode)
            });
        }
    }

    private createLayerMesh(state: TerrainTileState, target: TargetLayer): TerrainLayerMesh {
        if (target.kind === "base") {
            const material = new DEMTileBaseMaterial(state.uniforms, {
                texture: target.texture,
                uvTransform: target.uvTransform
            });
            return new TerrainLayerMesh(
                state.geometryRef,
                material,
                state,
                target.key,
                target.kind
            );
        }

        const material = new DEMTileOverlayMaterial(
            state.uniforms,
            target.kind === "projector" ? "projector" : "overlay",
            {
                texture: target.texture,
                uvTransform: target.uvTransform,
                opacity: target.opacity,
                projectorMatrix: target.projectorMatrix,
                cameraPos: target.cameraPos,
                blendMode: target.blending
            }
        );
        return new TerrainLayerMesh(state.geometryRef, material, state, target.key, target.kind);
    }

    private updateLayerMesh(mesh: TerrainLayerMesh, target: TargetLayer): void {
        const material = mesh.material as DEMTileBaseMaterial | DEMTileOverlayMaterial;
        if (target.kind === "base") {
            (material as DEMTileBaseMaterial).setImagery(
                target.texture ?? null,
                target.uvTransform
            );
            return;
        }

        const overlayMaterial = material as DEMTileOverlayMaterial;
        if (target.texture) {
            overlayMaterial.setLayerTexture(target.texture);
        }
        if (target.uvTransform) {
            overlayMaterial.setUvTransform(target.uvTransform);
        }
        if (target.opacity !== undefined) {
            overlayMaterial.setOpacity(target.opacity);
        }
        if (target.blending !== undefined) {
            overlayMaterial.setLayerBlending(target.blending);
        }
    }
}
