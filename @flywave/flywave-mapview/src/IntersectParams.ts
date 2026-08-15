/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Parameters to customize behaviour of {@link (MapView.intersectMapObjects)}
 * and {@link (MapView.pick)}.
 */
export interface IntersectParams {
    /**
     * The maximum number of results to be retrieved from the intersection test. If set, only the
     * first maxResultCount results will be returned, following an order by distance first, then
     * by reversed render order (topmost/highest render order first).
     */
    maxResultCount?: number;

    pickAnchor?: boolean;

    /**
     * Picking strategy when GPU picking is available (`enableGpuPicking: true`).
     *
     * - `"auto"` (default): GPU depth first (O(1)); fall back to CPU raycast on miss.
     * - `true`: GPU only — fastest, but only returns the nearest hit and no
     *   per-face details (no UV, no face normal).
     * - `false`: CPU only — full intersection details, slower on large scenes.
     *
     * Ignored when GPU picking is disabled.
     */
    useGpuPick?: boolean | "auto";
}
