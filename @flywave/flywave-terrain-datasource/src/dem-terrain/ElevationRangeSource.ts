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

    /** LRU cache for storing previously computed min/max elevation values */
    private readonly _lurCache = new LRUCache<string, MinMaxResult>(1000);

    /**
     * Generates a cache key for a tile ID
     *
     * @param tileID - The tile key to generate a cache key for
     * @returns A string cache key in the format "level-column-row"
     */
    private getCode(tileID: TileKey) {
        return `${tileID.level}-${tileID.column}-${tileID.row}`;
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
        if (!this.dataSource) {
            return null;
        }

        const cached = this._lurCache.get(this.getCode(tileID));
        if (cached) {
            return cached;
        }

        const demTile = this.dataSource.dataProvider().getBestAvailableResourceTile(tileID,false);
        if (!(demTile && demTile.resource)) {
            return null;
        }

        let minMax: MinMaxResult;
        if (demTile.resource.demData) {
            minMax = demTile.resource.demData.getTileMaxElevation(tileID, demTile.tileKey);
        }
        if (minMax) {
            this._lurCache.set(this.getCode(tileID), minMax);
        }
        return minMax;
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
        const range = this.getMinMaxForTile(tileKey);
        if (!range) {
            return {
                minElevation: 0,
                maxElevation: 0,
                calculationStatus: CalculationStatus.PendingApproximate
            };
        } else {
            const { min: minElevation, max: maxElevation } = range;
            return {
                minElevation,
                maxElevation,
                calculationStatus: CalculationStatus.FinalPrecise
            };
        }
    }
}

export { ElevationRangeSource };
