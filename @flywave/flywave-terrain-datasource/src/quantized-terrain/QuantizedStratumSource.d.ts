import { type TileKey } from "@flywave/flywave-geoutils";
import { type BaseQuantizedTerrainSourceOptions, BaseQuantizedTerrainSource } from "./BaseQuantizedTerrainSource";
import { type QuantizedStratumResource } from "./quantized-stratum-mesh/QuantizedStratumResource";
import { QuantizedStratumProvider } from "./QuantizedTerrainProvider";
/**
 * Configuration options for QuantizedStratumSource
 *
 * Extends the base terrain source options with stratum-specific parameters.
 * Currently uses all base options without additional stratum-specific ones.
 */
interface QuantizedStratumSourceOptions extends BaseQuantizedTerrainSourceOptions {
}
/**
 * Implementation of a terrain source for quantized stratum data
 *
 * This class handles the creation and configuration of quantized stratum sources,
 * providing specialized terrain data with geological stratum information.
 *
 * Stratum data provides enhanced elevation accuracy and detail for specific
 * regions by incorporating geological layer information into the terrain model.
 */
export declare class QuantizedStratumSource extends BaseQuantizedTerrainSource<QuantizedStratumResource> {
    /**
     * Creates a new QuantizedStratumProvider instance with the specified options
     *
     * @param options - Configuration options for the stratum provider
     * @returns Configured QuantizedStratumProvider instance
     */
    protected createProvider(options: QuantizedStratumSourceOptions): QuantizedStratumProvider;
    /**
     * Constructs a new QuantizedStratumSource
     *
     * @param options - Configuration options for the stratum source
     */
    constructor(options: QuantizedStratumSourceOptions);
    /**
     * Determines whether a tile should be subdivided based on zoom level and data availability
     *
     * This method implements subdivision logic specific to stratum data, where
     * subdivision is controlled by both zoom level constraints and data availability.
     *
     * @param zoomLevel - The current zoom level
     * @param tileKey - The tile key to check for subdivision
     * @returns True if the tile should be subdivided, false otherwise
     */
    shouldSubdivide(zoomLevel: number, tileKey: TileKey): boolean;
}
export {};
