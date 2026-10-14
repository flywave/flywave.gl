/* Copyright (C) 2025 flywave.gl contributors */

// height-map/DemTileProgressiveLoader.ts
import {
    type GeoBox,
    type TileKey,
    GeoCoordinates,
    geographicTerrainStandardTiling,
    webMercatorTerrainTilingScheme
} from "@flywave/flywave-geoutils";
import { TransferManager } from "@flywave/flywave-transfer-manager";
import {
    arrayBufferToImage,
    arrayBufferToImageBitmap,
    browser,
    offscreenCanvasSupported
} from "@flywave/flywave-utils";
import { Box2, Vector2 } from "three/webgpu";

import { TaskType } from "../Constants";
import {
    type HeightMapModificationEventParams,
    type HeightMapModifierManager
} from "../ground-modification-manager";
import { ResourceProvider } from "../ResourceProvider";
import type { DecodedTerrainTile } from "../TerrainDecoderWorker";
import { type ITerrainSource } from "../TerrainSource";
import { TileValidResource } from "../TileResourceManager";
import { computeDemTileGrid } from "./dem-patch/DemPatchComposite";
import { type DemPatchSnapshot } from "./dem-patch/DemPatchTypes";
import DEMData, { type DEMEncoding, type SerializedDEMData } from "./dem/DemData";
import { type DemSourceDescription } from "./dem/DemSourceDescription";
import { type DEMTerrainSource } from "./DEMTerrainSource";

/**
 * Constant identifier for DEM data resources
 */
export const DEMDataResourceType = "demData";

const tempBox = new Box2();
/**
 * Description of a DEM data source (tile URL templates, tiling scheme,
 * geographic bounds, zoom levels, tile size, …). Defined in
 * {@link ./dem/DemSourceDescription.ts} and shared with the DEM patch
 * (elevation override) layers; re-exported here for backward compatibility.
 */
export type { DemSourceDescription } from "./dem/DemSourceDescription";

/**
 * DEM tile resource representing decoded elevation data for a specific tile
 *
 * This class extends TileValidResource to provide specialized functionality
 * for DEM (Digital Elevation Model) data. It manages the decoded elevation
 * data and handles ground modification updates.
 */
export class DemTileResource extends TileValidResource {
    /**
     * Version of the patch (elevation override) set this tile was baked
     * with; 0 when baked without patches. The terrain source compares this
     * against the patch manager version to detect stale bakes.
     */
    public patchVersion: number = 0;

    /**
     * Pre-composite pixel copy (the pristine base bake), kept when the tile
     * was decoded with patch layers. It is the in-memory re-bake source for
     * patch-set changes; consumers must not mutate it.
     */
    private m_pristine: { pixels: Uint8Array; width: number; height: number } | null = null;

    /**
     * Creates a new DEM tile resource
     *
     * @param geoBox - The geographic bounding box of the tile
     * @param _demData - The DEM data for this tile
     */
    constructor(geoBox: GeoBox, private readonly _demData: DEMData) {
        super(geoBox);
    }

    /** Stores the pre-composite pixel copy carried from the worker decode */
    attachPristinePixels(pixels: Uint8Array, width: number, height: number): void {
        this.m_pristine = { pixels, width, height };
    }

    /** The pristine base bake for in-memory re-baking, or null when absent */
    getPristinePixels(): { pixels: Uint8Array; width: number; height: number } | null {
        return this.m_pristine;
    }

    /**
     * Disposes of the underlying DEM data resources
     *
     * This method is called when the resource is being cleaned up to ensure
     * that all allocated resources (textures, buffers, etc.) are properly released.
     */
    protected disposeResources(): void {
        this.m_pristine = null;
        this.demData.dispose();
    }

    /**
     * Gets the memory usage of this resource in bytes (baked pixels plus the
     * pristine re-bake copy when present — honest accounting)
     *
     * @returns The number of bytes used by this resource
     */
    getBytesUsed(): number {
        return this.demData.getBytesUsed() + (this.m_pristine?.pixels.byteLength ?? 0);
    }

    /**
     * Gets the DEM data for this tile
     */
    get demData(): DEMData {
        return this._demData;
    }

    /**
     * Creates a DEM tile resource from imagery data
     *
     * This static method processes raw imagery data (typically from a tile request)
     * and converts it into a fully decoded DEM tile resource. It handles image
     * processing, ground modifications, patch baking, and neighboring tile
     * backfilling.
     *
     * @param imgData - The source image data (Image, ImageBitmap, or ImageData)
     * @param tileKey - The tile key identifying this tile
     * @param terrainSource - The terrain data source
     * @param encoding - The DEM encoding format
     * @param patchSnapshot - Patch layers to bake into this tile (ascending
     * priority order); omitted when the source has no patch layers
     * @returns A promise that resolves to a new DemTileResource
     */
    static async createDemTileResourceFromImageryData(
        imgData: HTMLImageElement | ImageBitmap | ImageData,
        tileKey: TileKey,
        terrainSource: ITerrainSource,
        encoding: DEMEncoding,
        patchSnapshot?: DemPatchSnapshot
    ) {
        const { decodePadding: padding, borderReady } = computeDemTileGrid(imgData.width);

        let imageData: ImageData;
        if (imgData instanceof ImageData) {
            imageData = imgData as ImageData;
        } else {
            const transfer =
                window.ImageBitmap && imgData instanceof ImageBitmap && offscreenCanvasSupported();

            imageData = (transfer ? imgData : browser.getImageData(imgData, padding)) as ImageData;
        }
        const geoBox = terrainSource.getTilingScheme().getGeoBox(tileKey);

        // Check for height map modifiers in this tile's area (for elevation map decision only)
        const foundModifiers = terrainSource
            .getGroundModificationManager()
            .findModifiersInBoundingBox(geoBox);

        return terrainSource.decoder
            .decodeTile(
                {
                    type: TaskType.RasterDEM,
                    coord: tileKey,
                    imageData,
                    encoding,
                    geoBox: geoBox.toArray(),
                    padding,
                    terrainSourceId: terrainSource.name,
                    height: imgData.height,
                    width: imgData.width,
                    flipY: (terrainSource.dataProvider() as DemTileProvider).isElevationMapFlipY(),
                    patches: patchSnapshot?.patches
                },
                tileKey,
                terrainSource.projection
            )

            .then(({ tileTerrain }: DecodedTerrainTile) => {
                const data = tileTerrain as SerializedDEMData;

                const dem = DEMData.fromSerialized(data);
                // if (polygons?.length)
                //     document.body.appendChild(createCanvasFromImageData(data.data));
                if (!borderReady && !dem.neighboringTiles) {
                    dem.markNeighboringTilesAsBackfilled(
                        tileKey,
                        terrainSource.getTilingScheme().mortonTileEncoding,
                        {
                            getPreciseResource: (tileID: TileKey) =>
                                (
                                    terrainSource.dataProvider() as DemTileProvider
                                ).getPreciseResource(tileID)?.demData
                        }
                    );
                }
                const resource = new DemTileResource(geoBox, dem);
                resource.patchVersion = patchSnapshot?.version ?? 0;
                if (data.pristine) {
                    resource.attachPristinePixels(data.pristine, data.width, data.height);
                }
                return resource;
            });
    }
}

/**
 * DEM tile provider for loading and decoding digital elevation model data
 *
 * This class extends ResourceProvider to handle the specific requirements
 * of loading DEM data from various sources. It manages the connection to
 * data sources, tile fetching, and progressive loading of elevation data.
 */
export class DemTileProvider extends ResourceProvider<DemTileResource, DEMTerrainSource> {
    protected async connect(): Promise<void> {
        if (this.ready()) return;
        // The source is expected to be reachable via this.options
        await this.setSource(this.dem_options.source);
    }

    /**
     * Checks if the provider is ready to load tiles
     *
     * @returns True if the source description has been loaded, false otherwise
     */
    ready(): boolean {
        return this.m_sourceDescription !== null;
    }

    /**
     * Handles ground modification changes
     *
     * @param event - The ground modification event parameters
     * @param modify - The ground modification manager
     * @returns A promise that resolves when the update is complete
     */

    /** Transfer manager for handling network requests */
    private readonly _transferManager = new TransferManager(undefined, 1);
    /** The encoding format for the DEM data */
    private readonly _encoding: DEMEncoding;
    /** The source description loaded from the data source */
    private m_sourceDescription: DemSourceDescription | null = null;
    /** Array of tile URL templates */
    private _tileUriList: string[] = [];
    /** Geographic bounds of the data source */
    private _bounds: Box2 = new Box2(new Vector2(180, 90), new Vector2(-180, -90));

    /**
     * Creates a new DEM tile provider
     *
     * @param dem_options - Configuration options for the DEM provider
     */
    constructor(
        private readonly dem_options: {
            source: string | DemSourceDescription;
            encoding?: DEMEncoding;
        }
    ) {
        super({
            tilingScheme: webMercatorTerrainTilingScheme
        });

        this._encoding = dem_options.encoding || "mapbox";
    }

    /**
     * Gets the encoding format for the DEM data
     */
    get encoding(): DEMEncoding {
        return this._encoding;
    }

    /**
     * Gets the source description
     */
    get sourceDescription(): DemSourceDescription | null {
        return this.m_sourceDescription;
    }

    /**
     * Gets the maximum zoom level supported by this provider
     *
     * @returns The maximum zoom level
     */
    getMaxZoom(): number {
        return this.m_sourceDescription?.maxzoom || 0;
    }

    /**
     * Gets the minimum zoom level supported by this provider
     *
     * @returns The minimum zoom level
     */
    getMinZoom(): number {
        return this.m_sourceDescription?.minzoom || 0;
    }

    /**
     * Checks if the elevation map should be flipped on the Y axis
     *
     * @returns True if the Y axis should be flipped
     */
    isElevationMapFlipY(): boolean {
        return this.terrainSource.getTilingScheme() !== geographicTerrainStandardTiling;
    }

    /**
     * Sets the data source for this provider
     *
     * This method loads the source description from either a URL or a direct
     * source description object and processes it for use.
     *
     * @param source - The source URL or description
     * @returns A promise that resolves when the source is set
     */
    private async setSource(source: string | DemSourceDescription): Promise<void> {
        if (typeof source === "string") {
            this.m_sourceDescription = (await this._transferManager.downloadJson(
                source
            )) as DemSourceDescription;
        } else {
            this.m_sourceDescription = source;
        }

        if (this.m_sourceDescription) {
            this._processSourceDescription();
        }
    }

    /**
     * Checks if a tile is contained within the data source bounds
     *
     * @param tileKey - The tile key to check
     * @returns True if the tile is within bounds
     */
    containsTile(tileKey: TileKey): boolean {
        if (!this.m_sourceDescription) return false;

        const { maxzoom, minzoom } = this.m_sourceDescription;
        const geoBox = this.terrainSource.getTilingScheme().getGeoBox(tileKey);
        const { lng: minLng, lat: minLat } = geoBox.southWest;
        const { lng: maxLng, lat: maxLat } = geoBox.northEast;

        tempBox.set(new Vector2(minLng, minLat), new Vector2(maxLng, maxLat));
        return (
            this._bounds.intersectsBox(tempBox) &&
            tileKey.level >= minzoom &&
            tileKey.level <= maxzoom
        );
    }

    /**
     * Gets the resource type identifier
     *
     * @returns The DEM data resource type constant
     */
    protected getResourceType(): typeof DEMDataResourceType {
        return DEMDataResourceType;
    }

    /**
     * Processes the loaded source description
     *
     * This method extracts information from the source description and
     * configures the provider accordingly.
     */
    private _processSourceDescription(): void {
        if (!this.m_sourceDescription) return;

        const { tiles, bounds, minzoom, maxzoom } = this.m_sourceDescription;

        this._tileUriList = tiles;
        this._bounds = new Box2(
            new Vector2(bounds[0], bounds[1]),
            new Vector2(bounds[2], bounds[3])
        );

        this.updateConfig(minzoom, maxzoom);
    }

    /**
     * Gets a tile resource for the specified tile key
     *
     * This method fetches the raw tile data, resolves the DEM patch
     * (elevation override) snapshot in parallel, and decodes the tile with
     * the patches baked in. If the patch set changes while decoding, the
     * bake is redone (bounded) so a resource never lands stamped with a
     * stale patch version.
     *
     * @param tileKey - The tile key to load
     * @param abortSignal - Optional abort signal for cancellation
     * @returns A promise that resolves to the DEM tile resource
     */
    async getTile(tileKey: TileKey, abortSignal?: AbortSignal): Promise<DemTileResource> {
        const patchManager = this.terrainSource?.getDemPatchManager();
        const hasPatches = (patchManager?.getPatchCount() ?? 0) > 0;
        const baseGeoBox = this.terrainSource.getTilingScheme().getGeoBox(tileKey);
        // Patch resolution (network/LRU phase, dimension-free) starts in
        // parallel with the base tile download — the bake never waits for
        // sum(base, patch), only for max(base, patch).
        let patchesPromise =
            hasPatches && patchManager
                ? patchManager.preparePatchTiles(tileKey, baseGeoBox, abortSignal)
                : null;

        const dbuffer = await this._fetchTileData(tileKey, abortSignal);
        const img: HTMLImageElement | ImageBitmap = await new Promise(resolve => {
            if (window.createImageBitmap) {
                arrayBufferToImageBitmap(dbuffer, (err, imgBitmap) => {
                    resolve(imgBitmap);
                });
            } else {
                arrayBufferToImage(dbuffer, (err, img) => {
                    resolve(img);
                });
            }
        });

        if (!img) return await Promise.resolve(undefined);

        const { dim } = computeDemTileGrid(img.width);
        let resource: DemTileResource | undefined;
        // Bounded re-bake on patch-set changes mid-decode; patch images are
        // LRU-cached so retries only redo resampling + decode.
        for (let attempt = 0; attempt < 3; attempt++) {
            const collection =
                patchesPromise ??
                (hasPatches && patchManager
                    ? patchManager.preparePatchTiles(tileKey, baseGeoBox, abortSignal)
                    : null);
            patchesPromise = null;
            const snapshot = collection
                ? patchManager.resamplePatchTiles(await collection, tileKey, dim)
                : undefined;
            resource = await DemTileResource.createDemTileResourceFromImageryData(
                img,
                tileKey,
                this.terrainSource,
                this.encoding,
                snapshot
            );
            if (
                !collection ||
                !patchManager ||
                snapshot.version === patchManager.version ||
                attempt === 2
            ) {
                break;
            }
        }
        return resource as DemTileResource;
    }

    /**
     * Fetches raw tile data from the data source
     *
     * This method constructs the appropriate URL for the tile and fetches
     * the raw data using the transfer manager.
     *
     * @param tileKey - The tile key to fetch
     * @param abortSignal - Optional abort signal for cancellation
     * @returns A promise that resolves to the raw tile data
     */
    private async _fetchTileData(
        tileKey: TileKey,
        abortSignal?: AbortSignal
    ): Promise<ArrayBuffer | undefined> {
        if (!this.m_sourceDescription) {
            throw new Error("Source description not loaded");
        }

        if (!this.containsTile(tileKey)) {
            return await Promise.reject({ name: "AbortError" });
        }

        let url =
            this._tileUriList[tileKey.mortonCode(this.mortonCodeType) % this._tileUriList.length];

        // First perform XYZ placeholder replacement
        if (this.m_sourceDescription.scheme === "xyz") {
            // Support various placeholder conventions
            const replacements: Record<string, string> = {
                // Standard XYZ format
                "{x}": String(tileKey.column),
                "{y}": String(tileKey.row),
                "{z}": String(tileKey.level),
                // Other common formats
                "{level}": String(tileKey.level),
                "{zoom}": String(tileKey.level),
                "{col}": String(tileKey.column),
                "{row}": String(tileKey.row),
                // TMS format (Y coordinate needs flipping)
                "{tmsY}": String(Math.pow(2, tileKey.level) - 1 - tileKey.row)
            };

            // Apply all replacements
            for (const [placeholder, value] of Object.entries(replacements)) {
                if (url.includes(placeholder)) {
                    url = url.replace(new RegExp(placeholder, "g"), value);
                }
            }

            // If no placeholders found, use default XYZ format
            if (
                !url.includes(String(tileKey.column)) &&
                !url.includes(String(tileKey.row)) &&
                !url.includes(String(tileKey.level))
            ) {
                console.warn(`No placeholder found in URL template: ${url}`);
            }
        }

        // Handle relative path scenarios (after placeholder replacement)
        // If the URL is a relative path and setSource was called with a URL,
        // automatically append the source directory address
        if (this._isRelativeUrl(url) && typeof this.dem_options.source === "string") {
            url = this._resolveRelativeUrl(url, this.dem_options.source);
        }

        return this._transferManager
            .downloadArrayBuffer(url, { signal: abortSignal })
            .catch(e => Promise.resolve(new ArrayBuffer(0)));
    }

    /**
     * Checks if a URL is relative
     *
     * @param url - The URL to check
     * @returns True if the URL is relative
     */
    private _isRelativeUrl(url: string): boolean {
        return (
            url.startsWith("./") ||
            url.startsWith("../") ||
            (!url.includes("://") && !url.startsWith("/"))
        );
    }

    /**
     * Resolves a relative URL against a base source URL
     *
     * @param relativeUrl - The relative URL to resolve
     * @param sourceUrl - The base source URL
     * @returns The resolved absolute URL
     */
    private _resolveRelativeUrl(relativeUrl: string, sourceUrl: string): string {
        try {
            // If sourceUrl is an absolute URL
            if (sourceUrl.includes("://")) {
                const baseUrl = new URL(sourceUrl);
                const basePath = baseUrl.pathname.substring(
                    0,
                    baseUrl.pathname.lastIndexOf("/") + 1
                );
                return new URL(relativeUrl, `${baseUrl.origin}${basePath}`).toString();
            } else {
                // If sourceUrl is a relative URL, resolve against current page location
                const baseUrl = new URL(sourceUrl, window.location.href);
                const basePath = baseUrl.pathname.substring(
                    0,
                    baseUrl.pathname.lastIndexOf("/") + 1
                );
                return new URL(relativeUrl, `${baseUrl.origin}${basePath}`).toString();
            }
        } catch (error) {
            console.warn(
                `Failed to resolve relative URL: ${relativeUrl} against source: ${sourceUrl}`,
                error
            );
            return relativeUrl;
        }
    }
}
