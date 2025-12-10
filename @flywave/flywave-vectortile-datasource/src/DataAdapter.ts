/* Copyright (C) 2025 flywave.gl contributors */

import { type DecodeInfo } from "./DecodeInfo";
import { type IGeometryProcessor } from "./IGeometryProcessor";

/**
 * The class `DataAdapter` prepares vector data so it
 * can be processed by the vector tile decoder.
 */
export interface DataAdapter {
    /**
     * Checks if the given data can be processed by this `DataAdapter`.
     *
     * @param data - The raw data to adapt.
     */
    canProcess(data: ArrayBufferLike | {}): boolean;

    /**
     * Process the given raw data.
     *
     * @param data - The raw data to process.
     * @param decodeInfo - The `DecodeInfo` of the tile to process.
     * @param geometryProcessor - Must be called for every feature providing its geometry
     * (point,line or polygon) and properties. @see {@link IGeometryProcessor} for more details.
     */
    process(
        data: ArrayBufferLike | {},
        decodeInfo: DecodeInfo,
        geometryProcessor: IGeometryProcessor
    ): void;
}
