/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GroundModificationEventParams,
    type GroundModificationManager
} from "../../ground-modification-manager";
import { type IHeightMap, QuantizedTileResource } from "../QuantizedTileResource";
import { type StratumTileData } from "./stratum-tile/StratumTileData";

/**
 * A quantized tile resource implementation for stratum data.
 * Extends the base QuantizedTileResource to work with StratumTileData specifically.
 */
export class QuantizedStratumResource extends QuantizedTileResource {
    /**
     * Handles ground modification changes (not implemented in this class)
     * @param event - Ground modification event parameters
     * @param modify - Ground modification manager instance
     * @throws Error - Method not implemented
     */
    protected handleGroundModificationChange(
        event: GroundModificationEventParams,
        modify: GroundModificationManager
    ): Promise<void> {
        throw new Error("Method not implemented.");
    }

    /**
     * Gets the maximum height value from the stratum tile data
     * @returns The maximum height value or 0 if not available
     */
    get maxHeight(): number {
        return this.stratumTileData.header?.maxHeight ?? 0;
    }

    /**
     * Gets the minimum height value from the stratum tile data
     * @returns The minimum height value or 0 if not available
     */
    get minHeight(): number {
        return this.stratumTileData.header?.minHeight ?? 0;
    }

    /**
     * Gets the height map (not implemented in this class)
     * @throws Error - Method not implemented
     */
    get demMap(): IHeightMap {
        throw new Error("Method not implemented.");
    }

    // Private field to store the stratum tile data
    private readonly stratumTileData?: StratumTileData;

    /**
     * Gets the underlying stratum tile data
     * @returns The StratumTileData instance
     */
    get tileData(): StratumTileData {
        return this.stratumTileData;
    }

    /**
     * Creates a new QuantizedStratumResource instance
     * @param stratumTileApi - The stratum tile data to use for this resource
     */
    constructor(stratumTileApi: StratumTileData) {
        // Initialize with the geoBox from the stratum tile data
        super(stratumTileApi.geoBox);
        this.stratumTileData = stratumTileApi;
    }

    protected get geometry() {
        return this.stratumTileData.geometry;
    }

    public get geometryProjection() {
        return this.stratumTileData.projection;
    }

    protected updateGeometryProjection(projection) {
        this.stratumTileData.projection = projection;
        this.stratumTileData.center.copy(this.geometryProjection.projectPoint(this.stratumTileData.geoCener));
    }

    protected get geoCenter() {
        return this.stratumTileData.geoCener;
    }

    /**
     * Disposes of any resources held by this instance
     * (Currently empty implementation)
     */
    disposeResources(): void { }

    /**
     * Gets the number of bytes used by the stratum tile data
     * @returns The number of bytes used or undefined if no data is available
     */
    getBytesUsed() {
        return this.stratumTileData?.getBytesUsed();
    }
}
