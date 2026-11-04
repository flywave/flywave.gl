/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    type TilingScheme,
    TileKey,
    webMercatorProjection,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import { type Tile } from "@flywave/flywave-mapview";
import { textureToImageBitmap } from "@flywave/flywave-utils/TextureSerializer";
import { type WebTileDataProvider } from "@flywave/flywave-webtile-datasource";
import * as THREE from "three/webgpu";

import {
    type HeightMapModificationEventParams,
    type HeightMapModifierManager
} from "./ground-modification-manager";
import { ResourceProvider } from "./ResourceProvider";
import { type ITerrainSource } from "./TerrainSource";
import { TileValidResource } from "./TileResourceManager";

/**
 * Options for configuring the WebTileLoader
 */
export interface WebTileLoaderOptions {
    /**
     * The tiling scheme to use for tile loading
     * @default webMercatorTerrainTilingScheme
     */
    tilingScheme?: TilingScheme;

    /**
     * How many imagery levels FINER than the terrain tile's own level to
     * request. `0` (default) keeps the legacy 1:1 mapping (one image per
     * tile). `1` makes every terrain tile use a 2x2 mosaic of its four child
     * tiles, i.e. 4x the texels at the same mesh/geometry cost.
     *
     * The mosaic is composed into ONE texture on the download side (see
     * getMosaicTile), so the material keeps its single-texture sampling path
     * and the quadrant boundaries share one continuous mip chain.
     */
    imageryLevelOffset?: number;
}

/** One quadrant cell of a 2x2 imagery mosaic, resolved to a drawable source. */
interface MosaicCell {
    /** Source image (child tile or an ancestor covering it). */
    bitmap: ImageBitmap;
    /** Source rectangle inside `bitmap`, in pixels. */
    sx: number;
    sy: number;
    sw: number;
    sh: number;
    /** True when the source is the quadrant's own child (full bitmap). */
    whole: boolean;
}

/**
 * Represents a web tile with its geographic bounding box and texture
 */
export interface WebTile {
    /**
     * The geographic bounding box of the tile
     */
    geoBox: GeoBox;

    /**
     * The texture of the tile
     */
    texture: THREE.Texture;
}

/**
 * Resource class for web imagery tiles
 */
class WebImageryTileResource extends TileValidResource {
    public async handleGroundModificationChange(
        event: HeightMapModificationEventParams,
        modify: HeightMapModifierManager
    ): Promise<void> {}

    /**
     * Creates a new web imagery tile resource
     * @param tiles - The web tiles
     */
    constructor(public tiles: WebTile[], geoBox: GeoBox) {
        super(geoBox);
    }

    /**
     * @inheritdoc
     */
    disposeResources(): void {
        this.tiles.forEach(tile => {
            tile.texture.dispose();
        });
    }

    /**
     * @inheritdoc
     */
    getBytesUsed(): number {
        return this.tiles.reduce(
            (acc, cur) =>
                acc +
                    (cur.texture.image as { data?: { byteLength: number } } | undefined)?.data
                        ?.byteLength || 0,
            0
        );
    }

    protected listenerTerrainModification() {}
    /**
     * Get the tiles value
     */
    get value() {
        return this.tiles;
    }
}

/**
 * Provider for web imagery tiles
 */
export class WebImageryTileProvider extends ResourceProvider<
    WebImageryTileResource,
    ITerrainSource
> {
    /**
     * The web tile data provider
     */
    readonly webTileProvider: WebTileDataProvider;

    /**
     * Cache for storing loaded textures
     */
    private readonly textureCache: LRUCache<string, ImageBitmap>;

    /**
     * Map for tracking pending requests to prevent duplicate loads
     */
    private readonly pendingRequests: Map<string, Promise<THREE.Texture>>;

    /**
     * Imagery levels finer than the terrain tile's own level (0 = legacy
     * one-image-per-tile; 1 = 2x2 child mosaic per tile).
     */
    readonly imageryLevelOffset: number;

    /**
     * Creates a new web imagery tile provider
     * @param dataProvider - The web tile data provider
     * @param options - The options for the tile provider
     */
    constructor(dataProvider: WebTileDataProvider, options: WebTileLoaderOptions) {
        super({
            tilingScheme: options.tilingScheme ?? webMercatorTerrainTilingScheme,
            minLevel: dataProvider.minDataLevel,
            maxLevel: dataProvider.maxDataLevel
        });

        this.webTileProvider = dataProvider;
        // Cache sized for the 2×2 finer compositing (4 imagery textures per terrain tile)
        // plus streaming headroom — a 100-slot cache thrashed and re-decoded constantly.
        this.textureCache = new LRUCache<string, ImageBitmap>(600);
        this.pendingRequests = new Map();
        // One extra level = a 2x2 mosaic composed into a single texture. Higher
        // offsets would compose a (2^k)^2 grid and multiply texture memory
        // accordingly; keep it at one level for now.
        this.imageryLevelOffset = Math.max(
            0,
            Math.min(1, Math.floor(options.imageryLevelOffset ?? 0))
        );
    }

    /**
     * Creates a THREE.Texture from an ImageBitmap
     * @param imageBitmap - The ImageBitmap to create texture from
     * @returns The created texture
     */
    private createTextureFromImageBitmap(imageBitmap: ImageBitmap): THREE.Texture {
        const texture = new THREE.Texture(imageBitmap);
        texture.needsUpdate = true;
        this.configureTexture(texture);
        return texture;
    }

    /**
     * Configures texture parameters
     * @param texture - The texture to configure
     */
    private configureTexture(texture: THREE.Texture) {
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.flipY = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    }

    /**
     * Loads texture for a specific tile
     * @param tile - The tile key to load
     * @param noCache - Whether to skip caching
     * @param abortSignal - Optional abort signal to cancel the operation
     * @returns Promise that resolves to the loaded texture
     */
    private async loadTileTexture(
        tile: TileKey,
        noCache?: boolean,
        abortSignal?: AbortSignal
    ): Promise<THREE.Texture> {
        // Generate cache key
        const cacheKey = `${tile.level}-${tile.row}-${tile.column}`;

        // Try to get texture from cache first
        if (!noCache) {
            const cachedImageBitmap = this.textureCache.get(cacheKey);
            if (cachedImageBitmap) {
                return this.createTextureFromImageBitmap(cachedImageBitmap);
            }
        }

        // Check if there's already a pending request for this tile
        if (!noCache && this.pendingRequests.has(cacheKey)) {
            return await this.pendingRequests.get(cacheKey)!;
        }

        // Create the loading promise
        const loadPromise = this.executeLoadTileTexture(tile, noCache, abortSignal, cacheKey);

        // Store the promise if caching is enabled
        if (!noCache) {
            this.pendingRequests.set(cacheKey, loadPromise);
        }

        try {
            const result = await loadPromise;
            return result;
        } finally {
            // Clean up pending request
            if (!noCache) {
                this.pendingRequests.delete(cacheKey);
            }
        }
    }

    /**
     * Executes the actual texture loading logic
     * @param tile - The tile key to load
     * @param noCache - Whether to skip caching
     * @param abortSignal - Optional abort signal to cancel the operation
     * @param cacheKey - The cache key for the tile
     * @returns Promise that resolves to the loaded texture
     */
    private async executeLoadTileTexture(
        tile: TileKey,
        noCache?: boolean,
        abortSignal?: AbortSignal,
        cacheKey?: string
    ): Promise<THREE.Texture> {
        // Load texture from web tile provider
        const result = await this.webTileProvider.getTexture(
            {
                tileKey: tile
            } as Tile,
            abortSignal
        );

        if (!result || !result[0]) {
            throw new Error("Failed to load web tile texture");
        }

        const texture = result[0]!;
        this.configureTexture(texture);

        // Return directly if caching is disabled
        if (noCache) {
            return texture;
        }

        // Convert texture to ImageBitmap for caching
        const imageBitmap = await textureToImageBitmap(texture);

        // Store in cache
        this.textureCache.set(cacheKey!, imageBitmap);

        // Create and return texture from the cached ImageBitmap
        return this.createTextureFromImageBitmap(imageBitmap);
    }

    /**
     * @inheritdoc
     */
    ready(): boolean {
        return true;
    }

    /**
     * Loads one terrain tile as a 2x2 mosaic of its imagery children and
     * composes them into ONE 2Wx2H texture at download time.
     *
     * Why compose here instead of sampling four textures in the shader: the
     * four child images are separate sampling chains, so at their shared edge
     * each one clamps (and each has its own mip chain). That leaves a
     * one-texel hard step on the boundary — the thin line visible when the
     * tile is magnified. A single composed image gives every mip level a
     * continuous chain, so the boundary is indistinguishable from the
     * interior, and the material keeps its original single-texture path (one
     * sample per pixel, no extra bindings, no TSL slot logic).
     *
     * Per quadrant the child image is used when it loads; otherwise the best
     * cached ancestor image's sub-rectangle covering that child ("take a
     * quarter of the parent"). If any quadrant cannot be resolved, the whole
     * tile falls back to its best covering image instead of a half-built
     * mosaic.
     */
    private async getMosaicTile(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<WebImageryTileResource> {
        const targetLevel = Math.min(tileKey.level + this.imageryLevelOffset, this.maxLevel);
        const span = 1 << (targetLevel - tileKey.level);
        const tileGeoBox = this.tilingScheme!.getGeoBox(tileKey);
        const tileCenter = tileGeoBox.center;

        // Quadrant index: 0 = SW, 1 = SE, 2 = NW, 3 = NE (webMercatorY grows
        // south→north), matching the atlas cell placement in composeMosaic.
        const cells: Array<MosaicCell | undefined> = new Array(4).fill(undefined);
        const pending: Array<Promise<void>> = [];

        for (let dy = 0; dy < span; dy++) {
            for (let dx = 0; dx < span; dx++) {
                const childKey = TileKey.fromRowColumnLevel(
                    tileKey.row * span + dy,
                    tileKey.column * span + dx,
                    targetLevel
                );
                const childGeoBox = this.tilingScheme!.getGeoBox(childKey);
                // Derive the quadrant from geography, not from row/column
                // arithmetic: row direction depends on the scheme (y-down
                // web mercator vs y-up geographic), while webMercatorY is
                // always south→north.
                const slotIndex =
                    (childGeoBox.center.longitude > tileCenter.longitude ? 1 : 0) +
                    (childGeoBox.center.latitude > tileCenter.latitude ? 2 : 0);
                if (cells[slotIndex]) continue;

                pending.push(
                    this.loadMosaicCell(childKey, childGeoBox, abortSignal).then(cell => {
                        cells[slotIndex] = cell;
                    })
                );
            }
        }

        await Promise.all(pending);

        if (cells.some(cell => cell === undefined)) {
            const covering = this.findCoveringEntry(tileKey);
            if (!covering) {
                throw new Error(
                    `Failed to load imagery mosaic at level ${targetLevel} for ` +
                        `${tileKey.level}/${tileKey.row}/${tileKey.column}`
                );
            }
            return new WebImageryTileResource([covering], tileGeoBox);
        }

        const texture = await this.composeMosaic(cells as MosaicCell[]);
        return new WebImageryTileResource([{ geoBox: tileGeoBox, texture }], tileGeoBox);
    }

    /**
     * Resolves one quadrant to a drawable source: the child image itself, or
     * the sub-rectangle of the best cached ancestor image that covers it.
     */
    private async loadMosaicCell(
        childKey: TileKey,
        childGeoBox: GeoBox,
        abortSignal?: AbortSignal
    ): Promise<MosaicCell> {
        try {
            const texture = await this.loadTileTexture(childKey, false, abortSignal);
            const bitmap = await textureToImageBitmap(texture);
            return { bitmap, sx: 0, sy: 0, sw: bitmap.width, sh: bitmap.height, whole: true };
        } catch (error) {
            if (abortSignal?.aborted) throw error;
        }

        const ancestor = this.findCoveringEntry(childKey);
        if (!ancestor) {
            throw new Error(`No imagery available for the quadrant of ${childKey.toString()}`);
        }
        const bitmap = await textureToImageBitmap(ancestor.texture);
        const rect = this.computeCellSourceRect(ancestor.geoBox, childGeoBox, bitmap);
        return { bitmap, ...rect, whole: false };
    }

    /**
     * Source rectangle of `inner` inside `outer`'s image, in image pixels
     * (row 0 = the NORTH edge in both schemes). Only reached when the terrain
     * and imagery tiling schemes are equal, so projected x/y differences are
     * directly usable.
     */
    private computeCellSourceRect(
        outer: GeoBox,
        inner: GeoBox,
        bitmap: ImageBitmap
    ): { sx: number; sy: number; sw: number; sh: number } {
        const projection = this.tilingScheme!.projection;
        const project = (latitude: number, longitude: number): THREE.Vector3 =>
            projection.projectPoint(
                { latitude, longitude } as Parameters<typeof projection.projectPoint>[0],
                new THREE.Vector3()
            );
        const yDown = projection === webMercatorProjection;

        const oSW = project(outer.south, outer.west);
        const oNE = project(outer.north, outer.east);
        const iSW = project(inner.south, inner.west);
        const iNE = project(inner.north, inner.east);

        const outerWest = Math.min(oSW.x, oNE.x);
        const outerEast = Math.max(oSW.x, oNE.x);
        const outerTop = yDown ? Math.min(oSW.y, oNE.y) : Math.max(oSW.y, oNE.y);
        const outerBottom = yDown ? Math.max(oSW.y, oNE.y) : Math.min(oSW.y, oNE.y);
        const innerWest = Math.min(iSW.x, iNE.x);
        const innerEast = Math.max(iSW.x, iNE.x);
        const innerTop = yDown ? Math.min(iSW.y, iNE.y) : Math.max(iSW.y, iNE.y);
        const innerBottom = yDown ? Math.max(iSW.y, iNE.y) : Math.min(iSW.y, iNE.y);

        const spanX = outerEast - outerWest || 1;
        const spanY = outerBottom - outerTop || 1;
        const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

        return {
            sx: clamp01((innerWest - outerWest) / spanX) * bitmap.width,
            sy: clamp01((innerTop - outerTop) / spanY) * bitmap.height,
            sw: clamp01((innerEast - innerWest) / spanX) * bitmap.width,
            sh: clamp01((innerBottom - innerTop) / spanY) * bitmap.height
        };
    }

    /** Draws the four quadrants into one 2Wx2H image (NW/NE top, SW/SE bottom). */
    private async composeMosaic(cells: MosaicCell[]): Promise<THREE.Texture> {
        const realChild = cells.find(cell => cell.whole);
        const cellWidth = Math.max(1, Math.round(realChild ? realChild.bitmap.width : cells[0].sw));
        const cellHeight = Math.max(
            1,
            Math.round(realChild ? realChild.bitmap.height : cells[0].sh)
        );

        const canvas = document.createElement("canvas");
        canvas.width = cellWidth * 2;
        canvas.height = cellHeight * 2;
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Failed to compose imagery mosaic: no 2D canvas context");
        }
        context.imageSmoothingEnabled = true;

        for (let slot = 0; slot < 4; slot++) {
            const cell = cells[slot];
            const dx = (slot & 1) * cellWidth;
            // Image rows grow southward: the north quadrants go on top.
            const dy = slot >= 2 ? 0 : cellHeight;
            context.drawImage(
                cell.bitmap,
                cell.sx,
                cell.sy,
                Math.max(1, cell.sw),
                Math.max(1, cell.sh),
                dx,
                dy,
                cellWidth,
                cellHeight
            );
        }

        const bitmap = await createImageBitmap(canvas);
        return this.createTextureFromImageBitmap(bitmap);
    }

    /**
     * Finds the cached ancestor texture entry that covers `childKey`.
     *
     * The ancestor walk is the existing `getBestAvailableResourceTile`
     * (level-by-level down to `minLevel`); among that resource's entries the
     * one containing the child's geo box is the "quarter of the parent" the
     * quadrant slot should sample.
     */
    private findCoveringEntry(childKey: TileKey): WebTile | undefined {
        const best = this.getBestAvailableResourceTile(childKey);
        if (!best) return undefined;

        const childGeoBox = this.tilingScheme!.getGeoBox(childKey);
        const epsilon = 1e-7;
        return best.resource.value.find(entry => {
            const box = entry.geoBox;
            return (
                box.west <= childGeoBox.west + epsilon &&
                box.east >= childGeoBox.east - epsilon &&
                box.south <= childGeoBox.south + epsilon &&
                box.north >= childGeoBox.north - epsilon
            );
        });
    }

    /**
     * @inheritdoc
     */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<WebImageryTileResource> {
        if (
            this.imageryLevelOffset > 0 &&
            this.tilingScheme !== undefined &&
            this.terrainSource!.getTilingScheme().isEqualTilingScheme(this.tilingScheme)
        ) {
            const targetLevel = Math.min(tileKey.level + this.imageryLevelOffset, this.maxLevel);
            if (targetLevel > tileKey.level) {
                return await this.getMosaicTile(tileKey, abortSignal);
            }
        }

        if (!this.terrainSource!.getTilingScheme().isEqualTilingScheme(this.tilingScheme)) {
            const geoBox = this.terrainSource!.getTilingScheme().getGeoBox(tileKey);
            const tileKeys = this.tilingScheme.getTileKeys(geoBox, tileKey.level);

            const inputs: WebTile[] = [];
            const texturePromises = tileKeys.map(async tileKey => {
                return {
                    tileKey,
                    texture: await this.loadTileTexture(tileKey, false, abortSignal)
                };
            });

            const textures = await Promise.all(texturePromises);

            // Process textures
            await Promise.all(
                textures.map(async textureObj => {
                    const geoBox = this.tilingScheme.getGeoBox(textureObj.tileKey);
                    inputs.push({
                        texture: textureObj.texture,
                        geoBox
                    });
                })
            );

            return new WebImageryTileResource(inputs, geoBox);
        }

        const texture = await this.loadTileTexture(tileKey, true, abortSignal);

        const geoBox = this.tilingScheme.getGeoBox(tileKey);
        (texture as unknown as { geoBox: GeoBox }).geoBox = geoBox;
        return new WebImageryTileResource([{ geoBox, texture }], geoBox);
    }

    /**
     * @inheritdoc
     */
    protected connect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Clears the texture cache
     */
    clearCache(): void {
        this.textureCache.clear();
        this.pendingRequests.clear();
    }

    /**
     * Gets the current cache size
     * @returns The number of items in the cache
     */
    getCacheSize(): number {
        return this.textureCache.size;
    }

    /**
     * Gets the number of pending requests
     * @returns The number of pending requests
     */
    getPendingRequestsCount(): number {
        return this.pendingRequests.size;
    }
}
