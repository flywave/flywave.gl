/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    GeoBox as GeoBoxClass,
    GeoCoordinates,
    type TileKey
} from "@flywave/flywave-geoutils";
import { EventDispatcher } from "three/webgpu";

import {
    type DemPatchChangeEventParams,
    type DemPatchOptions,
    type DemPatchSnapshot,
    type DemPatchState,
    type DemPatchTileCollection,
    type PendingDemPatchTile,
    type SerializedDemPatchTile
} from "./DemPatchTypes";
import { resamplePatchToBaseGrid, unionGeoBoxes } from "./DemPatchComposite";
import { type DemPatchTileResolution, DemPatchLayer } from "./DemPatchLayer";

/**
 * Registry of DEM patch (elevation override) layers for one terrain source.
 *
 * The manager owns the layer set, a monotonically increasing `version` (the
 * stamp every baked resource carries, used to detect stale bakes) and the
 * `change` event that drives invalidation/re-bake in the terrain source.
 *
 * Snapshot assembly is split in two phases so the patch fetches can run in
 * parallel with the base tile download:
 * 1. {@link preparePatchTiles} — network/LRU phase, resolves the best
 *    available patch tile per layer (dimension-free);
 * 2. {@link resamplePatchTiles} — pure resampling into the base tile's inner
 *    grid once its size is known.
 */
export class DemPatchManager extends EventDispatcher<{
    change: DemPatchChangeEventParams;
}> {
    private readonly m_layers = new Map<string, DemPatchLayer>();
    private _version = 0;

    /** Monotonic stamp bumped on every layer-set change */
    get version(): number {
        return this._version;
    }

    /**
     * Registers a patch layer from options. Duplicate ids throw. The
     * description of a URL-described source resolves asynchronously; its
     * arrival dispatches a follow-up `update` event so already-baked tiles
     * can be re-baked with the layer included.
     */
    addPatch(options: DemPatchOptions): string {
        const layer = new DemPatchLayer(options);
        return this.addLayer(layer);
    }

    /**
     * Registers an already-constructed layer (test/advanced injection seam).
     * Duplicate ids throw.
     */
    addLayer(layer: DemPatchLayer): string {
        if (this.m_layers.has(layer.id)) {
            throw new Error(`DEM patch layer id already exists: ${layer.id}`);
        }
        this.m_layers.set(layer.id, layer);
        // Late-arrival channel: when a patch tile is freshly fetched AFTER a
        // bake already used the coarser ancestor, re-dispatch so the owning
        // source re-bakes the affected (already-baked) descendants and patch
        // detail refines progressively, mirroring the base terrain behavior.
        layer.onTileLoaded = () => {
            if (this.m_layers.get(layer.id) === layer) {
                this.bumpVersionAndDispatch("update", [layer.id]);
            }
        };
        this.bumpVersionAndDispatch("add", [layer.id]);
        if (layer.needsAsyncResolve) {
            layer
                .resolveDescription()
                .then(() => {
                    // The coverage/zoom description arrived after tiles may
                    // have baked without this layer — re-dispatch so the
                    // owning source re-bakes the affected area.
                    this.bumpVersionAndDispatch("update", [layer.id]);
                })
                .catch(error => {
                    // eslint-disable-next-line no-console
                    console.error(`Failed to resolve DEM patch layer ${layer.id}:`, error);
                });
        }
        return layer.id;
    }

    removePatch(id: string): boolean {
        const layer = this.m_layers.get(id);
        if (!layer) {
            return false;
        }
        this.m_layers.delete(id);
        layer.dispose();
        this.bumpVersionAndDispatch("remove", [id]);
        return true;
    }

    updatePatch(
        id: string,
        changes: Partial<Pick<DemPatchOptions, "priority" | "enabled" | "source">>
    ): boolean {
        const layer = this.m_layers.get(id);
        if (!layer) {
            return false;
        }
        if (changes.priority !== undefined) {
            layer.priority = changes.priority;
        }
        if (changes.enabled !== undefined) {
            layer.enabled = changes.enabled;
        }
        this.bumpVersionAndDispatch("update", [id]);
        if (changes.source !== undefined) {
            void layer.updateSource(changes.source).then(() => {
                this.bumpVersionAndDispatch("update", [id]);
            });
        }
        return true;
    }

    clear(): void {
        const ids = Array.from(this.m_layers.keys());
        if (ids.length === 0) {
            return;
        }
        this.m_layers.forEach(layer => layer.dispose());
        this.m_layers.clear();
        this.bumpVersionAndDispatch("clear", ids);
    }

    hasPatch(id: string): boolean {
        return this.m_layers.has(id);
    }

    getPatch(id: string): DemPatchState | undefined {
        const layer = this.m_layers.get(id);
        return layer ? layer.state : undefined;
    }

    getAllPatches(): DemPatchState[] {
        return Array.from(this.m_layers.values()).map(layer => layer.state);
    }

    getPatchCount(): number {
        return this.m_layers.size;
    }

    /**
     * Phase 1 of snapshot assembly: resolves the best patch tile per enabled
     * layer (native imagery, no resampling yet). Layers outside the tile's
     * coverage or without a usable tile contribute `undefined` hits and are
     * skipped later. The returned collection is stamped with the manager
     * version at call time — the caller retries when the version moved on.
     */
    async preparePatchTiles(
        baseTileKey: TileKey,
        baseTileGeoBox: GeoBox,
        abortSignal?: AbortSignal
    ): Promise<DemPatchTileCollection> {
        const version = this._version;
        const layers = this.getEnabledLayersByPriority();
        const tiles: PendingDemPatchTile[] = await Promise.all(
            layers.map(layer =>
                layer
                    .getBestPatchTile(baseTileKey, baseTileGeoBox, abortSignal)
                    .then((hit: DemPatchTileResolution | undefined) => ({
                        encoding: layer.encoding,
                        hit
                    }))
            )
        );
        return { version, tiles };
    }

    /**
     * Phase 2 of snapshot assembly: resamples each collected patch tile into
     * the base tile's inner grid. Output patches keep the ascending priority
     * order of {@link preparePatchTiles} — the worker composite relies on it
     * (later entries overwrite earlier ones).
     */
    resamplePatchTiles(
        collection: DemPatchTileCollection,
        baseTileKey: TileKey,
        dim: number
    ): DemPatchSnapshot {
        const patches: SerializedDemPatchTile[] = [];
        for (const tile of collection.tiles) {
            if (!tile.hit) {
                continue;
            }
            patches.push({
                imageData: resamplePatchToBaseGrid(
                    tile.hit.image,
                    baseTileKey,
                    tile.hit.tileKey,
                    dim
                ),
                encoding: tile.encoding
            });
        }
        return { version: collection.version, patches };
    }

    private getEnabledLayersByPriority(): DemPatchLayer[] {
        return Array.from(this.m_layers.values())
            .filter(layer => layer.enabled)
            .sort((a, b) => a.priority - b.priority);
    }

    private bumpVersionAndDispatch(
        changeType: DemPatchChangeEventParams["changeType"],
        affectedIds: string[]
    ): void {
        this._version++;
        let affectedBounds: GeoBox | null = null;
        for (const id of affectedIds) {
            const layer = this.m_layers.get(id);
            if (!layer) {
                // Removed/cleared layers are gone — their area is unknown.
                affectedBounds = null;
                break;
            }
            const bounds = layer.state.bounds;
            if (!bounds) {
                affectedBounds = null;
                break;
            }
            const layerBox = new GeoBoxClass(
                new GeoCoordinates(bounds[1], bounds[0]),
                new GeoCoordinates(bounds[3], bounds[2])
            );
            affectedBounds = affectedBounds ? unionGeoBoxes(affectedBounds, layerBox) : layerBox;
        }
        this.dispatchEvent({ type: "change", changeType, affectedIds, affectedBounds });
    }
}
