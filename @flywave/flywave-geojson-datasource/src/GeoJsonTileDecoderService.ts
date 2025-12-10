/* Copyright (C) 2025 flywave.gl contributors */

import { LoggerManager } from "@flywave/flywave-utils";

const logger = LoggerManager.instance.create("WorkerService", { enabled: false });

/**
 * @deprecated GeoJsonTileDecoderService Use
 *             {@link @flywave/flywave-vectortile-datasource#VectorTileDecoderService} instead.
 */
export class GeoJsonTileDecoderService {
    /**
     * @deprecated GeoJsonTileDecoderService Use
     *             {@link @flywave/flywave-vectortile-datasource#VectorTileDecoderService} instead.
     */
    start() {
        logger.warn(
            "GeoJsonTileDecoderService class is deprecated, please use VectorTileDecoderService"
        );
    }
}
