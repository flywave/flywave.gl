/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey, type TilingScheme } from "@flywave/flywave-geoutils";
import {
    type ElevationRangeSource as IElevationRangeSource,
    CalculationStatus,
    DataSource
} from "@flywave/flywave-mapview";

import { type BaseQuantizedTerrainSource } from "./BaseQuantizedTerrainSource";
import { type QuantizedTileResource } from "./QuantizedTileResource";

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
 * Elevation range source for quantized terrain data
 *
 * This class implements the IElevationRangeSource interface to provide
 * minimum and maximum elevation values for quantized terrain tiles.
 * It enables efficient frustum culling and other optimizations by
 * providing elevation bounds for terrain tiles.
 */
class ElevationRangeSource implements IElevationRangeSource {
    /**
     * Creates a new elevation range source for quantized terrain data
     *
     * @param dataSource - The quantized terrain data source to use for elevation data
     */
    constructor(private readonly dataSource: BaseQuantizedTerrainSource<QuantizedTileResource>) {}

    /**
     * Gets the tiling scheme used by this elevation range source
     *
     * @returns The tiling scheme or undefined if no data source is attached
     */
    getTilingScheme(): TilingScheme | undefined {
        return this.dataSource?.getTilingScheme();
    }

    /**
     * Establishes connection to the data source
     *
     * @returns A promise that resolves when the connection is established
     */
    connect(): Promise<void> {
        return this.dataSource.connect();
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
     * Gets the minimum and maximum elevation values for a specific tile
     *
     * This method retrieves the precomputed minimum and maximum elevation
     * values for a quantized terrain tile, which are stored as part of
     * the tile's metadata.
     *
     * @param tileID - The tile key to get min/max elevation for
     * @returns The min/max elevation values or null if not available
     */
    getMinMaxForTile(tileID: TileKey): MinMaxResult | null {
        const dataProvider = this.dataSource.dataProvider();
        const tinTile = dataProvider.getBestAvailableResourceTile(tileID,false);

        // if (!tinTile) {
        //     return null;
        // }

        return {
            max: tinTile?.resource?.maxHeight || 0,
            min: tinTile?.resource?.minHeight || 0
        };
    }

    /**
     * Gets the elevation range for a specific tile key
     *
     * This method returns the minimum and maximum elevation values for a tile,
     * along with the calculation status indicating whether the values are
     * approximate or precise.
     *
     * @param tikeKey - The tile key to get elevation range for
     * @returns The elevation range result with min/max values and calculation status
     */
    getElevationRange = (
        tikeKey: TileKey
    ): {
        minElevation: number;
        maxElevation: number;
        calculationStatus: CalculationStatus;
    } => {
        const range = this.getMinMaxForTile(tikeKey);
        if (!range) {
            return {
                minElevation: 0,
                maxElevation: 0,
                calculationStatus: CalculationStatus.PendingApproximate
            };
        }
        return {
            minElevation: range.min,
            maxElevation: range.max,
            calculationStatus: CalculationStatus.FinalPrecise
        };
    };
}

export { ElevationRangeSource };
