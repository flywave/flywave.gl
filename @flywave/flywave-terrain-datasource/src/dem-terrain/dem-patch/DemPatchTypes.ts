/* Copyright (C) 2025 flywave.gl contributors */

import { type GeoBox, type TileKey } from "@flywave/flywave-geoutils";

import { type DEMEncoding } from "../dem/DemData";
import { type DemSourceDescription } from "../dem/DemSourceDescription";

/**
 * User-facing options for one DEM patch (elevation override) layer.
 *
 * A patch layer is a regular raster-dem tile service whose values REPLACE the
 * base terrain elevation wherever the layer has data. The value IS the new
 * elevation (hard override) — never a delta and never an alpha blend. Where
 * several patch layers cover the same pixel, the highest `priority` wins.
 */
export interface DemPatchOptions {
    /** Unique id within the owning terrain source; duplicates are rejected */
    id: string;

    /**
     * The patch data: a URL to a DemSourceDescription JSON or an inline
     * description (same shape as the base DEM source description).
     */
    source: string | DemSourceDescription;

    /**
     * Encoding of the patch tiles; may differ from the base DEM encoding.
     * @default "mapbox"
     */
    encoding?: DEMEncoding;

    /**
     * Conflict priority. When several layers have data for the same pixel the
     * highest priority value is baked into the terrain. Equal priorities are
     * resolved by registration order (later registration wins).
     */
    priority: number;

    /**
     * Disabled layers stay registered but never contribute to any tile.
     * @default true
     */
    enabled?: boolean;
}

/**
 * Read-only snapshot of a registered patch layer (for introspection / UI).
 */
export interface DemPatchState {
    id: string;
    priority: number;
    enabled: boolean;
    encoding: DEMEncoding;
    /** True once a URL-described source finished loading its description */
    ready: boolean;
    /** Declared coverage bounds [west, south, east, north]; null until ready */
    bounds: [number, number, number, number] | null;
    minzoom: number | null;
    maxzoom: number | null;
}

/**
 * One patch tile hit resolved for a base tile bake: the native patch image
 * plus the patch tile key it belongs to (which may be an ancestor of the
 * base tile when the patch dataset is coarser than the base tile).
 */
export interface DemPatchTileHit {
    /** The patch tile the image belongs to (may be an ancestor of the base tile) */
    tileKey: TileKey;
    image: ImageData;
}

/**
 * A patch contribution awaiting resampling, kept as (encoding, hit) pairs in
 * ascending priority order. Produced by {@link DemPatchManager.preparePatchTiles}
 * (network/LRU phase, dimension-free so it can run in parallel with the base
 * tile fetch) and turned into a snapshot by
 * {@link DemPatchManager.resamplePatchTiles} once the base grid size is known.
 */
export interface PendingDemPatchTile {
    encoding: DEMEncoding;
    hit: DemPatchTileHit | undefined;
}

/** Collection returned by preparePatchTiles, stamped with the manager version */
export interface DemPatchTileCollection {
    version: number;
    tiles: PendingDemPatchTile[];
}

/**
 * One patch contribution already resampled into the base tile's inner grid
 * (dim x dim). Pixels with alpha < threshold mean "no data" and keep the
 * base elevation.
 */
export interface SerializedDemPatchTile {
    imageData: ImageData;
    encoding: DEMEncoding;
}

/**
 * Immutable patch set for one decode task. `patches` is in ascending priority
 * order: the worker composite overwrites covered pixels entry by entry, so
 * later (higher priority) entries win.
 */
export interface DemPatchSnapshot {
    version: number;
    patches: SerializedDemPatchTile[];
}

/**
 * Event payload dispatched by {@link DemPatchManager} on any layer change.
 * `affectedBounds` is the union of the changed layers' coverage; null means
 * the affected area is unknown/global and consumers must invalidate broadly.
 */
export interface DemPatchChangeEventParams {
    changeType: "add" | "remove" | "update" | "clear";
    affectedIds: string[];
    affectedBounds: GeoBox | null;
}
