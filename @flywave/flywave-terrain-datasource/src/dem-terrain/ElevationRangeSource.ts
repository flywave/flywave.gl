/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, type TilingScheme } from "@flywave/flywave-geoutils";
import { LRUCache } from "@flywave/flywave-lrucache";
import {
    type ElevationRangeSource as IElevationRangeSource,
    CalculationStatus
} from "@flywave/flywave-mapview";

import { type DEMTerrainSource } from "./DEMTerrainSource";

/**
 * Interface representing the minimum and maximum elevation values for a tile
 */
interface MinMaxResult {
    /** Minimum elevation value */
    min: number;
    /** Maximum elevation value */
    max: number;
}

/**
 * Interface representing the elevation range result for a tile
 */
interface ElevationRangeResult {
    /** Minimum elevation value for the tile */
    minElevation: number;
    /** Maximum elevation value for the tile */
    maxElevation: number;
    /** Status of the elevation calculation */
    calculationStatus: CalculationStatus;
}

/**
 * Shared constant returned while a tile's DEM data is not (yet) available.
 * Callers only read the fields, never mutate them.
 */
const PENDING_ELEVATION_RANGE: ElevationRangeResult = {
    minElevation: 0,
    maxElevation: 0,
    calculationStatus: CalculationStatus.PendingApproximate
};

/**
 * Elevation range source for DEM (Digital Elevation Model) terrain data
 *
 * This class implements the IElevationRangeSource interface to provide
 * minimum and maximum elevation values for terrain tiles. It uses an LRU
 * cache to store previously computed elevation ranges for efficient retrieval.
 */
class ElevationRangeSource implements IElevationRangeSource {
    /**
     * Creates a new elevation range source
     *
     * @param dataSource - The DEM terrain data source to use for elevation data
     */
    constructor(private readonly dataSource: DEMTerrainSource) {}

    /**
     * LRU cache for previously computed elevation ranges.
     *
     * The camera frustum traversal queries every visited candidate tile on
     * every frame, so the working set while the camera moves is the whole
     * visited quadtree (tens of thousands of keys) - far beyond the old
     * 1000-entry cache, which made almost every lookup a miss (tree walk +
     * re-insert). Values are tiny ({min,max,status}); keys are numeric morton
     * codes, avoiding the per-lookup string allocation of "level-col-row".
     */
    private readonly _lruCache = new LRUCache<number, MinMaxResult & ElevationRangeResult>(50000);

    /**
     * Generates a numeric cache key for a tile ID
     *
     * @param tileID - The tile key to generate a cache key for
     * @returns The tile's morton code under the data source's tiling scheme
     */
    private getCode(tileID: TileKey): number {
        return tileID.mortonCode(this.dataSource.getTilingScheme().mortonTileEncoding);
    }

    /**
     * Establishes connection to the data source
     *
     * @returns A promise that resolves when the connection is established
     */
    connect(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Checks if the elevation range source is ready
     *
     * @returns True if the data source is ready
     */
    ready(): boolean {
        return this.dataSource.ready();
    }

    /**
     * Gets the tiling scheme used by this elevation range source
     *
     * @returns The tiling scheme or undefined if no data source is attached
     */
    getTilingScheme(): TilingScheme | undefined {
        return this.dataSource?.getTilingScheme();
    }

    /**
     * Gets the minimum and maximum elevation values for a specific tile
     *
     * This method first checks the cache for previously computed values.
     * If not found in the cache, it computes the values from the DEM data
     * and stores them in the cache for future use.
     *
     * @param tileID - The tile key to get min/max elevation for
     * @returns The min/max elevation values or null if not available
     */
    getMinMaxForTile(tileID: TileKey): MinMaxResult | null {
        return this.getCachedRange(tileID);
    }

    /**
     * Gets the cached (or freshly computed) range for a tile, carrying both the
     * MinMaxResult and ElevationRangeResult field views in one shared object.
     *
     * @param tileID - The tile key to get min/max elevation for
     * @returns The elevation range values or null if no DEM data is available
     */
    private getCachedRange(tileID: TileKey): (MinMaxResult & ElevationRangeResult) | null {
        if (!this.dataSource) {
            return null;
        }

        const cacheKey = this.getCode(tileID);
        const cached = this._lruCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const demTile = this.dataSource.dataProvider().getBestAvailableResourceTile(tileID, false);
        if (!(demTile && demTile.resource)) {
            return null;
        }

        let minMax: (MinMaxResult & ElevationRangeResult) | undefined;
        if (demTile.resource.demData) {
            const { min, max } = demTile.resource.demData.getTileMaxElevation(
                tileID,
                demTile.tileKey
            );
            // One object per key carries both the MinMaxResult and the
            // ElevationRangeResult views; callers only read fields.
            minMax = {
                min,
                max,
                minElevation: min,
                maxElevation: max,
                calculationStatus: CalculationStatus.FinalPrecise
            };
            this._lruCache.set(cacheKey, minMax);
        }
        return minMax ?? null;
    }

    /**
     * Drops all cached min/max results. Called when the baked DEM contents
     * change (DEM patch re-bake) so ranges are recomputed from the new pixels.
     */
    invalidateCache(): void {
        this._lruCache.clear();
    }

    /**
     * Gets the elevation range for a specific tile key
     *
     * This method returns the minimum and maximum elevation values for a tile,
     * along with the calculation status indicating whether the values are
     * approximate or precise.
     *
     * @param tileKey - The tile key to get elevation range for
     * @returns The elevation range result with min/max values and calculation status
     */
    getElevationRange(tileKey: TileKey): ElevationRangeResult {
        const range = this.getCachedRange(tileKey);
        if (!range) {
            return PENDING_ELEVATION_RANGE;
        }
        const manager = this.dataSource.getGroundModificationManager();
        if (manager === undefined || manager.getModifierCount() === 0) {
            // No ground modifiers: the cached range is exact and callers only
            // read it, so the shared per-key object is returned directly
            // (previously this allocated a fresh wrapper on every call for
            // every visited tile on every frame).
            return range;
        }
        let { min: minElevation, max: maxElevation } = range;
        const tileGeoBox = this.dataSource.getTilingScheme().getGeoBox(tileKey);
        const delta = manager.getModifierHeightRange(tileGeoBox);
        if (delta) {
            minElevation += delta.minDelta;
            maxElevation += delta.maxDelta;
        }
        return {
            minElevation,
            maxElevation,
            calculationStatus: CalculationStatus.FinalPrecise
        };
    }
}

export { ElevationRangeSource };
