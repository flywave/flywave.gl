import { type GroundModificationEventParams, type GroundModificationManager } from "../../ground-modification-manager";
import { type IHeightMap, QuantizedTileResource } from "../QuantizedTileResource";
import { type StratumTileData } from "./stratum-tile/StratumTileData";
/**
 * A quantized tile resource implementation for stratum data.
 * Extends the base QuantizedTileResource to work with StratumTileData specifically.
 */
export declare class QuantizedStratumResource extends QuantizedTileResource {
    /**
     * Handles ground modification changes (not implemented in this class)
     * @param event - Ground modification event parameters
     * @param modify - Ground modification manager instance
     * @throws Error - Method not implemented
     */
    protected handleGroundModificationChange(event: GroundModificationEventParams, modify: GroundModificationManager): Promise<void>;
    /**
     * Gets the maximum height value from the stratum tile data
     * @returns The maximum height value or 0 if not available
     */
    get maxHeight(): number;
    /**
     * Gets the minimum height value from the stratum tile data
     * @returns The minimum height value or 0 if not available
     */
    get minHeight(): number;
    /**
     * Gets the height map (not implemented in this class)
     * @throws Error - Method not implemented
     */
    get demMap(): IHeightMap;
    private readonly stratumTileData?;
    /**
     * Gets the underlying stratum tile data
     * @returns The StratumTileData instance
     */
    get tileData(): StratumTileData;
    /**
     * Creates a new QuantizedStratumResource instance
     * @param stratumTileApi - The stratum tile data to use for this resource
     */
    constructor(stratumTileApi: StratumTileData);
    protected get geometry(): import("three").BufferGeometry<import("three").NormalBufferAttributes, import("three").BufferGeometryEventMap>;
    get geometryProjection(): Projection;
    protected updateGeometryProjection(projection: any): void;
    protected get geoCenter(): GeoCoordinates;
    /**
     * Disposes of any resources held by this instance
     * (Currently empty implementation)
     */
    disposeResources(): void;
    /**
     * Gets the number of bytes used by the stratum tile data
     * @returns The number of bytes used or undefined if no data is available
     */
    getBytesUsed(): number;
}
