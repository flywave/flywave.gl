import { type TileKey, type TilingScheme } from "@flywave/flywave-geoutils";
import { type ElevationRangeSource as IElevationRangeSource, CalculationStatus } from "@flywave/flywave-mapview";
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
declare class ElevationRangeSource implements IElevationRangeSource {
    private readonly dataSource;
    /**
     * Creates a new elevation range source for quantized terrain data
     *
     * @param dataSource - The quantized terrain data source to use for elevation data
     */
    constructor(dataSource: BaseQuantizedTerrainSource<QuantizedTileResource>);
    /**
     * Gets the tiling scheme used by this elevation range source
     *
     * @returns The tiling scheme or undefined if no data source is attached
     */
    getTilingScheme(): TilingScheme | undefined;
    /**
     * Establishes connection to the data source
     *
     * @returns A promise that resolves when the connection is established
     */
    connect(): Promise<void>;
    /**
     * Checks if the elevation range source is ready
     *
     * @returns True if the data source is ready
     */
    ready(): boolean;
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
    getMinMaxForTile(tileID: TileKey): MinMaxResult | null;
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
    getElevationRange: (tikeKey: TileKey) => {
        minElevation: number;
        maxElevation: number;
        calculationStatus: CalculationStatus;
    };
}
export { ElevationRangeSource };
