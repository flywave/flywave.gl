/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    TileKey,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import * as THREE from "three/webgpu";

import { type ITerrainSource, type TerrainResourceTile } from "../TerrainSource";
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
    /** The layer's geographic extent — used to derive the tile-UV transform. */
    readonly geoBox: GeoBox;
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

    /**
     * With zero registered layers there is nothing to feed: skip the
     * resource pipeline entirely. Otherwise the instant CPU resolve per tile
     * would fire `updateTileOverlays` (→ full tile-cache clear) at the
     * debounce rate for every tile, permanently.
     */
    public override async loadProgressiveTileResources(
        tileKey: TerrainResourceTile,
        abortSignal: AbortSignal
    ): Promise<void> {
        if (this.layerSource().length === 0) {
            return;
        }
        return super.loadProgressiveTileResources(tileKey, abortSignal);
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
                geoBox: layer.geoBox,
                texture: layer.texture,
                matrix: layer.matrix,
                opacity: layer.opacity,
                blendMode: layer.blendMode
            });
        }

        return new ProjectorTileResource(entries, tileGeoBox);
    }

    /**
     * Ancestor-walk retrieval with a mandatory per-layer intersection check.
     *
     * The base implementation falls back to ANY ancestor holding a resource.
     * For tile-aligned imagery (satellite) that fallback is exact. For
     * projector layers it is catastrophic: coarse ancestors (down to the
     * level-0 world tile) cache the trench resource because their geoBox
     * intersects it, so without this check EVERY tile on Earth receives the
     * decal — the per-tile uvTransform then maps a ~1/N-wide sliver of
     * far-away tiles into the texture, the shader's inRange gate lets that
     * band through, and the decal shows up as streaks in wrong places
     * (appearing/disappearing with cache state).
     *
     * Intersection is a property of the LAYER geoBox (identical at every
     * cache level), so the first non-intersecting ancestor ends the search.
     */
    public override getBestAvailableResourceTile(
        tileKey: TileKey,
        keepCached: boolean = true
    ): { tileKey: TileKey; resource: ProjectorTileResource } | undefined {
        if (tileKey.level < this.minLevel || !this.tilingScheme || !this.terrainSource) {
            return undefined;
        }
        const queryBox = this.terrainSource.getTilingScheme().getGeoBox(tileKey);

        for (let level = tileKey.level; level >= this.minLevel; level--) {
            const levelOffset = tileKey.level - level;
            const parentKey = TileKey.fromRowColumnLevel(
                tileKey.row >> levelOffset,
                tileKey.column >> levelOffset,
                level
            );

            const cacheTile = this.terrainSource.getCachedTile(parentKey, keepCached);
            if (!cacheTile) {
                continue;
            }

            const resource = cacheTile.resourceManager.getResource<ProjectorTileResource>(
                this.getResourceKey()
            );
            if (resource !== undefined) {
                if (resource.value.some(entry => queryBox.intersectsBox(entry.geoBox))) {
                    return { tileKey: parentKey, resource };
                }
                return undefined;
            }
        }

        return undefined;
    }

    /**
     * Invalidate all cached projector tile resources and trigger a rebuild
     * of tiles. Called by the manager on every layer mutation that changes
     * per-tile content (add / remove / texture / opacity / blendMode /
     * geoBox).
     *
     * NOTE: unfiltered on purpose — `updateTileOverlays` is debounced and
     * keeps only the LAST call's geoBox argument, so mixing filtered and
     * unfiltered callers silently drops refresh scopes.
     */
    requestInvalidate(affectedBox?: GeoBox): void {
        const terrainSource = this.terrainSource;
        if (!terrainSource) return;
        terrainSource.unCacheResource(this.getResourceKey());
        terrainSource.updateTileOverlays();
    }

    protected connect(): Promise<void> {
        return Promise.resolve();
    }
}
