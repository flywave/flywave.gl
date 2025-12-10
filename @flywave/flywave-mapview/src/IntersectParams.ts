/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Parameters to customize behaviour of {@link (MapView.intersectMapObjects)}.
 */
export interface IntersectParams {
    /**
     * The maximum number of results to be retrieved from the intersection test. If set, only the
     * first maxResultCount results will be returned, following an order by distance first, then
     * by reversed render order (topmost/highest render order first).
     */
    maxResultCount?: number;

    pickAnchor?: boolean;
}
