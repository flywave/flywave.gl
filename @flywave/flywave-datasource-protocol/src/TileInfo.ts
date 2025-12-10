/* Copyright (C) 2025 flywave.gl contributors */

import { type TileKey } from "@flywave/flywave-geoutils";

/**
 * Defines a map tile metadata.
 */
export interface TileInfo {
    readonly tileKey: TileKey;
    readonly setupTime: number;
    readonly transferList?: ArrayBuffer[];
    readonly numBytes: number;
}
