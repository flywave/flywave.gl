/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type TileKey,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

import { type ITerrainSource } from "../TerrainSource";
import { ResourceProvider } from "../ResourceProvider";
import { TileValidResource } from "../TileResourceManager";
import { type ProjectorBlendMode, type ProjectorLayer } from "./ProjectorOverlayManager";

/**
 * One projector layer intersecting a tile.
 *
 * `matrix` is a live reference to the owning layer's projector matrix —
 * mutating it (e.g. via {@link ProjectorOverlayManager.updateLayer})
 * propagates to every material uniform wrapping it, with zero tile rebuilds.
 */
export interface ProjectorTileEntry {
    readonly layerId: number;
    readonly texture: THREE.Texture;
    readonly matrix: THREE.Matrix4;
    opacity: number;
    blendMode: ProjectorBlendMode;
}

/**
 * Snapshot of all projector layers intersecting one terrain tile.
 *
 * Textures are owned by the user / ProjectorOverlayManager — this resource
 * only holds references and therefore reports zero bytes used (do not
 * over-report, LRU eviction relies on honest numbers).
 */
export class ProjectorTileResource extends TileValidResource {
    constructor(public readonly entries: ProjectorTileEntry[], geoBox: GeoBox) {
        super(geoBox);
    }

    disposeResources(): void {
        // Drop references only; never dispose user-owned textures.
        this.entries.length = 0;
    }

    getBytesUsed(): number {
        return 0;
    }

    get value(): ProjectorTileEntry[] {
        return this.entries;
    }
}

/**
 * ResourceProvider feeding projector overlay layers into the same per-tile
 * resource pipeline as web imagery providers.
 *
 * `getTile` is a pure CPU geoBox-intersection evaluation (no network): for a
 * tile it collects every projector layer whose geoBox intersects the tile's
 * geoBox. Resources land on the tile itself (no ancestor fallback — projector
 * layers are resolution independent), and are invalidated wholesale on any
 * layer mutation because recomputation is trivial.
 */
export class ProjectorImageryProvider extends ResourceProvider<
    ProjectorTileResource,
    ITerrainSource
> {
    /** @internal injected to avoid a circular import with the manager. */
    layerSource: () => ProjectorLayer[] = () => [];

    constructor() {
        super({ tilingScheme: webMercatorTerrainTilingScheme, minLevel: 0, maxLevel: 28 });
    }

    ready(): boolean {
        return true;
    }

    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<ProjectorTileResource> {
        const terrainSource = this.terrainSource!;
        const tileGeoBox = terrainSource.getTilingScheme().getGeoBox(tileKey);

        const entries: ProjectorTileEntry[] = [];
        for (const layer of this.layerSource()) {
            if (!tileGeoBox.intersectsBox(layer.geoBox)) {
                continue;
            }
            entries.push({
                layerId: layer.id,
                texture: layer.texture,
                matrix: layer.matrix,
                opacity: layer.opacity,
                blendMode: layer.blendMode
            });
        }

        return new ProjectorTileResource(entries, tileGeoBox);
    }

    /**
     * Invalidate all cached projector tile resources and trigger a (filtered)
     * rebuild of affected tiles. Called by the manager on every layer
     * mutation that changes per-tile content (add / remove / texture /
     * opacity / blendMode / geoBox).
     */
    requestInvalidate(affectedBox?: GeoBox): void {
        const terrainSource = this.terrainSource;
        if (!terrainSource) return;
        terrainSource.unCacheResource(this.getResourceKey());
        terrainSource.updateTileOverlays(affectedBox);
    }

    protected connect(): Promise<void> {
        return Promise.resolve();
    }
}
