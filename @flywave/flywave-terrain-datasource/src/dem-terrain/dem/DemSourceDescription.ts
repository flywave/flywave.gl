/* Copyright (C) 2025 flywave.gl contributors */

/**
 * Description of a DEM data source
 *
 * This interface describes the structure of a DEM data source, including
 * the tile URL templates, tiling scheme, geographic bounds, zoom levels,
 * and tile size information. It is shared by the base DEM provider and by
 * DEM patch (elevation override) layers, which use the exact same tile
 * service shape.
 */
export interface DemSourceDescription {
    /**
     * Array of tile URL templates
     * Supports placeholders like {z}/{x}/{y} or {zoom}/{x}/{y}
     * Example: ['https://example.com/terrain/{z}/{x}/{y}.png']
     */
    tiles: string[];

    /**
     * Tile coordinate system scheme
     * - "xyz": Standard Web Mercator tile scheme (most common)
     * - "tms": TMS tile scheme with flipped Y-axis
     * - "custom": Custom coordinate system
     */
    scheme: "xyz" | "tms" | "custom";

    /**
     * Geographic bounds [west, south, east, north] in degrees
     * Example: [-180, -85.0511, 180, 85.0511] for global coverage
     */
    bounds: [number, number, number, number];

    /**
     * Minimum zoom level (0-22)
     * The minimum zoom level at which tiles are available
     */
    minzoom: number;

    /**
     * Maximum zoom level (0-22)
     * The maximum zoom level at which tiles are available
     */
    maxzoom: number;

    /**
     * Tile size in pixels
     * Typically 256 or 512
     * Modern map services often use 512x512 tiles
     */
    tileSize: number;

    /**
     * Data source type
     * For terrain data, must be set to "raster-dem"
     */
    type: "raster-dem";

    /**
     * Data source attribution
     * Copyright information displayed on the map
     */
    attribution?: string;

    /**
     * Volatility flag
     * If true, indicates tile content may change frequently, cache strategy will be more aggressive
     */
    volatile?: boolean;

    /**
     * Tile coordinate system definition
     * Transformation matrix for custom coordinate systems
     * Typically [1, -1, -1, 1] or [1, 0, 0, 1], etc.
     */
    tileSystem?: number[];

    /**
     * CORS cross-origin settings
     * - "anonymous": Anonymous cross-origin requests, no credentials sent
     * - "use-credentials": Cross-origin requests with credentials
     */
    crossOrigin?: "anonymous" | "use-credentials";

    /**
     * Elevation data units
     * - "meters": Meters (default)
     * - "feet": Feet
     */
    units?: "meters" | "feet";

    /**
     * Maximum tile cache size
     * Controls the number of tiles cached in memory, affects performance
     */
    maxCacheSize?: number;

    /**
     * Retry count
     * Number of retries when tile loading fails
     */
    retries?: number;

    /**
     * Minimum tile recognizability
     * Controls the detail level threshold for tile loading
     */
    minimumTileRecognizability?: number;

    /**
     * Request parameters
     * Additional query parameters appended to tile URLs
     */
    queryParameters?: Record<string, string>;

    /**
     * Request headers
     * HTTP headers for tile requests
     */
    headers?: Record<string, string>;

    /**
     * Error handling callback
     * Handler function when tile loading fails
     */
    onError?: (error: Error, tile: { z: number; x: number; y: number }) => void;

    /**
     * Preprocessing function
     * Function to preprocess loaded tile data
     */
    preprocess?: (
        data: ArrayBuffer,
        tile: { z: number; x: number; y: number }
    ) => ArrayBuffer | Promise<ArrayBuffer>;
}
