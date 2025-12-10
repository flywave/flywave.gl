/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey } from "@flywave/flywave-geoutils";

import { type GeoJson } from "./GeoJsonDataType";

/**
 * General type tiler which can be used to provide tile untiled payloads.
 */
export interface ITiler {
    /**
     * Connect to tiler.
     *
     * Should be implemented by implementations that use special resources that decode jobs like
     * WebWorkers.
     */
    connect(): Promise<void>;

    /**
     * Register index in the tiler. Indexes registered in the tiler can be later used to retrieved
     * tiled payloads using `getTile`.
     *
     * @param indexId - Index identifier.
     * @param indexUrl - Url to the index payload, or direct GeoJson.
     */
    registerIndex(indexId: string, indexUrl: URL | GeoJson): Promise<void>;

    /**
     * Update index in the tiler. Indexes registered in the tiler can be later used to retrieved
     * tiled payloads using `getTile`.
     *
     * @param indexId - Index identifier.
     * @param indexUrl - Url to the index payload, or direct GeoJson.
     */
    updateIndex(indexId: string, indexUrl: URL | GeoJson): Promise<void>;

    /**
     * Retrieves a tile for a previously registered index.
     *
     * @param indexId - Index identifier.
     * @param tileKey - The [[TileKey]] that identifies the tile.
     */
    getTile(indexId: string, tileKey: TileKey): Promise<Record<string, unknown>>;

    /**
     * Free all resources associated with this tiler.
     *
     * Called by users when decoder is no longer used and all resources must be freed.
     */
    dispose(): void;
}
