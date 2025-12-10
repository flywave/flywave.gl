/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox } from "@flywave/flywave-geoutils";

import { type CopyrightInfo } from "./CopyrightInfo";

/**
 * `CopyrightProvider` is an interface to retrieve copyrights information for geographic region
 * specified by bounding box.
 */
export interface CopyrightProvider {
    /**
     * Retrieves copyrights.
     *
     * @param geoBox - Bounding geo box to get copyrights for.
     * @param level - Zoom level to get copyrights for.
     * @returns Promise with an array of copyrights for this geo box.
     */
    getCopyrights(geoBox: GeoBox, level: number): Promise<CopyrightInfo[]>;
}
