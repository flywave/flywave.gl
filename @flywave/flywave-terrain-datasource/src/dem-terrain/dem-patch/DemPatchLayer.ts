/* Copyright (C) 2025 flywave.gl contributors */

import { GeoBox, TileEncoding, TileKey } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import { arrayBufferToImageBitmap, browser } from "@flywave/flywave-utils";

import { type DEMEncoding } from "../dem/DemData";
import { type DemSourceDescription } from "../dem/DemSourceDescription";
import { computeAncestorTileKey, selectPatchTileLevel } from "./DemPatchComposite";
import { type DemPatchOptions, type DemPatchState } from "./DemPatchTypes";

/** Result of resolving the best patch tile for one base tile bake */
export interface DemPatchTileResolution {
    tileKey: TileKey;
    image: ImageData;
}

/** Default capacity of the per-layer native patch image LRU */
const DEFAULT_IMAGE_CACHE_CAPACITY = 128;
/** Default capacity of the per-layer negative (tile-missing) cache */
const DEFAULT_MISSING_CACHE_CAPACITY = 512;
/**
 * How long a "tile missing" entry stays valid. Expiring entries let a
 * transient network failure retry on a later bake instead of sticking for
 * the lifetime of the layer.
 */
const MISSING_TILE_TTL_MS = 30_000;

/**
 * One registered DEM patch (elevation override) layer.
 *
 * Owns everything per-layer: description resolution (inline or fetched from
 * a URL), the native-resolution patch image LRU (shared by every descendant
 * bake of one patch tile), a negative cache for tiles the service does not
 * provide, and the best-available ancestor walk.
 *
 * `fetchTileImage` is the only network touchpoint and is protected so tests
 * can inject fabricated imagery.
 */
export class DemPatchLayer {
    public readonly id: string;
    public priority: number;
    public enabled: boolean;
    public readonly encoding: DEMEncoding;

    /**
     * Late-arrival hook: invoked once per freshly fetched patch tile (never
     * for LRU hits). The owning manager forwards this as a change event so
     * already-baked descendants can be re-baked with the finer data.
     */
    public onTileLoaded?: (tileKey: TileKey) => void;

    private m_source: string | DemSourceDescription;
    private m_sourceDescription: DemSourceDescription | null = null;
    private m_tileUriList: string[] = [];
    private m_bounds: [number, number, number, number] = [0, 0, 0, 0];

    private readonly m_imageCache: LRUCache<number, ImageData>;
    /** Morton code → Date.now() when the tile was last proven missing */
    private readonly m_missingTiles: LRUCache<number, number>;
    private readonly m_pendingFetches = new Map<number, Promise<ImageData | undefined>>();
    private readonly m_transferManager = new TransferManager(undefined, 1);
    private readonly m_mortonEncoding: TileEncoding = TileEncoding.QUAD_TREE;

    constructor(options: DemPatchOptions) {
        this.id = options.id;
        this.priority = options.priority;
        this.enabled = options.enabled ?? true;
        this.encoding = options.encoding ?? "mapbox";
        this.m_source = options.source;
        this.m_imageCache = new LRUCache<number, ImageData>(DEFAULT_IMAGE_CACHE_CAPACITY);
        this.m_missingTiles = new LRUCache<number, number>(DEFAULT_MISSING_CACHE_CAPACITY);
        if (typeof this.m_source !== "string") {
            this.applyDescription(this.m_source);
        }
    }

    /** Read-only state snapshot for introspection / UI */
    get state(): DemPatchState {
        const description = this.m_sourceDescription;
        return {
            id: this.id,
            priority: this.priority,
            enabled: this.enabled,
            encoding: this.encoding,
            ready: description !== null,
            bounds: description ? [...description.bounds] : null,
            minzoom: description ? description.minzoom : null,
            maxzoom: description ? description.maxzoom : null
        };
    }

    /** Whether the layer covers (or may cover) the given tile area */
    intersectsGeoBox(geoBox: GeoBox): boolean {
        if (!this.m_sourceDescription) {
            // Unknown coverage — never exclude, the bake-level fetch decides.
            return true;
        }
        const [west, south, east, north] = this.m_bounds;
        return !(
            geoBox.northEast.longitude < west ||
            geoBox.southWest.longitude > east ||
            geoBox.northEast.latitude < south ||
            geoBox.southWest.latitude > north
        );
    }

    /** True when the description still has to be fetched from a URL */
    get needsAsyncResolve(): boolean {
        return typeof this.m_source === "string" && this.m_sourceDescription === null;
    }

    /**
     * Loads the layer description (no-op for inline descriptions). Resolving
     * is idempotent; a failed load leaves the layer unready and inert.
     */
    async resolveDescription(): Promise<void> {
        if (typeof this.m_source !== "string" || this.m_sourceDescription) {
            return;
        }
        const description = (await this.m_transferManager.downloadJson(
            this.m_source
        )) as DemSourceDescription;
        this.applyDescription(description);
    }

    /** Swaps the layer's data source and re-resolves it */
    async updateSource(source: string | DemSourceDescription): Promise<void> {
        this.m_source = source;
        this.m_sourceDescription = null;
        this.m_tileUriList = [];
        this.m_imageCache.clear();
        this.m_missingTiles.clear();
        this.m_pendingFetches.clear();
        await this.resolveDescription();
    }

    /**
     * Best-available patch tile for a base tile bake: exact level when within
     * the patch's zoom range, otherwise the nearest ancestor at/below maxzoom,
     * walking up to minzoom. Missing tiles are negative-cached so the walk
     * costs at most one fetch per (layer, patch tile).
     */
    async getBestPatchTile(
        baseTileKey: TileKey,
        baseTileGeoBox: GeoBox,
        abortSignal?: AbortSignal
    ): Promise<DemPatchTileResolution | undefined> {
        const description = this.m_sourceDescription;
        if (!description || !this.enabled || !this.intersectsGeoBox(baseTileGeoBox)) {
            return undefined;
        }
        const targetLevel = selectPatchTileLevel(
            baseTileKey.level,
            description.minzoom,
            description.maxzoom
        );
        if (targetLevel === undefined) {
            return undefined;
        }
        for (let level = targetLevel; level >= description.minzoom; level--) {
            const tileKey = computeAncestorTileKey(baseTileKey, level);
            const morton = tileKey.mortonCode(this.m_mortonEncoding);
            if (this.isTileMissing(morton)) {
                continue;
            }
            const image = await this.loadTileImage(tileKey, morton, abortSignal);
            if (image) {
                return { tileKey, image };
            }
        }
        return undefined;
    }

    /** Drops all cached imagery and negative entries */
    dispose(): void {
        this.m_imageCache.clear();
        this.m_missingTiles.clear();
        this.m_pendingFetches.clear();
    }

    /**
     * Applies a resolved description. Protected so tests can inject a
     * description without going through the network.
     */
    protected applyDescription(description: DemSourceDescription | null): void {
        this.m_sourceDescription = description;
        if (description) {
            this.m_tileUriList = description.tiles;
            this.m_bounds = [...description.bounds];
        }
    }

    /**
     * Fetches one patch tile image. Protected seam for tests; the default
     * implementation downloads via the transfer manager and decodes to
     * ImageData (same orientation convention as the base DEM path).
     */
    protected async fetchTileImage(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<ImageData | undefined> {
        const description = this.m_sourceDescription;
        if (!description || this.m_tileUriList.length === 0) {
            return undefined;
        }
        let url =
            this.m_tileUriList[
                tileKey.mortonCode(this.m_mortonEncoding) % this.m_tileUriList.length
            ];
        url = this.applyTileKeyPlaceholders(url, tileKey);
        const buffer = await this.m_transferManager.downloadArrayBuffer(url, {
            signal: abortSignal
        });
        if (!buffer || buffer.byteLength === 0) {
            return undefined;
        }
        const bitmap = await new Promise<ImageBitmap | null>(resolve => {
            arrayBufferToImageBitmap(buffer, (_error, image) => resolve(image));
        });
        if (!bitmap) {
            return undefined;
        }
        return browser.getImageData(bitmap, 0) as ImageData;
    }

    /** LRU/dedupe wrapper around {@link fetchTileImage}; misses are negative-cached */
    private loadTileImage(
        tileKey: TileKey,
        morton: number,
        abortSignal?: AbortSignal
    ): Promise<ImageData | undefined> {
        const cached = this.m_imageCache.get(morton);
        if (cached) {
            return Promise.resolve(cached);
        }
        const pending = this.m_pendingFetches.get(morton);
        if (pending) {
            return pending;
        }
        const promise = this.fetchTileImage(tileKey, abortSignal)
            .then(image => {
                if (image) {
                    this.m_imageCache.set(morton, image);
                    // Fresh fetch (never for LRU hits) — feeds the late-arrival
                    // re-bake channel so patch detail refines progressively.
                    this.onTileLoaded?.(tileKey);
                } else {
                    this.m_missingTiles.set(morton, Date.now());
                }
                return image;
            })
            .finally(() => {
                this.m_pendingFetches.delete(morton);
            });
        this.m_pendingFetches.set(morton, promise);
        return promise;
    }

    /** True when the tile is negatively cached and the entry has not expired */
    private isTileMissing(morton: number): boolean {
        const missingAt = this.m_missingTiles.get(morton);
        if (missingAt === undefined) {
            return false;
        }
        if (Date.now() - missingAt > MISSING_TILE_TTL_MS) {
            this.m_missingTiles.delete(morton);
            return false;
        }
        return true;
    }

    // Placeholder replacement mirroring DemTileProvider's xyz handling, plus
    // explicit {y}/{tmsY} support for the tms scheme. Kept local (instead of
    // refactoring the proven provider) to keep this feature's blast radius small.
    private applyTileKeyPlaceholders(url: string, tileKey: TileKey): string {
        const replacements: Record<string, string> = {
            "{x}": String(tileKey.column),
            "{y}": String(tileKey.row),
            "{z}": String(tileKey.level),
            "{level}": String(tileKey.level),
            "{zoom}": String(tileKey.level),
            "{col}": String(tileKey.column),
            "{row}": String(tileKey.row),
            "{tmsY}": String(Math.pow(2, tileKey.level) - 1 - tileKey.row)
        };
        let resolved = url;
        for (const [placeholder, value] of Object.entries(replacements)) {
            if (resolved.includes(placeholder)) {
                resolved = resolved.replace(new RegExp(placeholder, "g"), value);
            }
        }
        return resolved;
    }
}
