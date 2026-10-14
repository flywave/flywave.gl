/* Copyright (C) 2025 flywave.gl contributors */

import {
    type GeoBox,
    GeoBox as GeoBoxClass,
    GeoCoordinates,
    TileKey
} from "@flywave/flywave-geoutils";
import { prevPowerOfTwo, warnOnce } from "@flywave/flywave-utils";

import { DEMData, type DEMEncoding } from "../dem/DemData";
import { type SerializedDemPatchTile } from "./DemPatchTypes";

/**
 * Pure geometry/math for the DEM patch (elevation override) pipeline.
 *
 * This module is intentionally DOM-free and side-effect-free so it runs
 * identically on the main thread, inside the decoder worker and in tests.
 * All of it is consumed by {@link processDEMTile} (worker bake) and by the
 * patch layer resampling step (main thread).
 */

/**
 * Alpha (0-255) below which a patch pixel counts as "no data": the pixel is
 * skipped and the base DEM shows through. Matches the brush heightmap mask
 * convention (alpha >= 1 counts as covered).
 */
export const PATCH_ALPHA_THRESHOLD = 1;

/**
 * Grid metrics of a fetched base DEM tile image.
 *
 * DEM tiles always render through a (dim + 2) border-padded pixel grid: an
 * unpadded power-of-two image gets 1px padding added at decode time, while a
 * pre-padded image (size = power of two + 2) already carries its border and
 * is used as-is. The INNER grid the composite writes to therefore always
 * starts at offset 1 in the final pixel buffer.
 */
export interface DemTileGridMetrics {
    /** Extra padding added when converting the fetched image to ImageData */
    decodePadding: number;
    /** True when the fetched image already contains its border ring */
    borderReady: boolean;
    /** Side length of the border-free inner grid (equals DEMData.dim) */
    dim: number;
}

/** Derives decode padding / border readiness / inner grid size for a DEM image */
export function computeDemTileGrid(imageWidth: number): DemTileGridMetrics {
    const buffer = (imageWidth - prevPowerOfTwo(imageWidth)) / 2;
    const decodePadding = 1 - buffer;
    return {
        decodePadding,
        borderReady: decodePadding < 1,
        dim: imageWidth + 2 * decodePadding - 2
    };
}

/**
 * Level-selection rule for baking patch data into a base resource tile at
 * level `baseLevel`:
 * - base coarser than the patch's minzoom → the patch does not participate
 *   (no down-stitching of children);
 * - otherwise use min(baseLevel, patchMaxZoom): the finest patch data that
 *   the base grid can carry, upsampled from a patch ancestor when needed.
 *
 * @returns The patch tile level to use, or undefined for "no coverage".
 */
export function selectPatchTileLevel(
    baseLevel: number,
    patchMinZoom: number,
    patchMaxZoom: number
): number | undefined {
    if (baseLevel < patchMinZoom) {
        return undefined;
    }
    return Math.min(baseLevel, patchMaxZoom);
}

/** Ancestor tile key of `tileKey` at the given (coarser or equal) level */
export function computeAncestorTileKey(tileKey: TileKey, level: number): TileKey {
    const levelOffset = tileKey.level - level;
    return TileKey.fromRowColumnLevel(
        tileKey.row >> levelOffset,
        tileKey.column >> levelOffset,
        level
    );
}

/** Decodes an elevation in meters from mapbox/terrarium terrain-rgb values */
export function decodeDemElevation(r: number, g: number, b: number, encoding: DEMEncoding): number {
    const unpack = DEMData.getUnpackVector(encoding);
    return r * unpack.x + g * unpack.y + b * unpack.z - unpack.w;
}

/**
 * Resamples a native patch tile image into a base tile's inner grid
 * (dim x dim, nearest neighbor, alpha preserved).
 *
 * Both tiles live on the same web-mercator quad tree, so the mapping is an
 * exact binary fraction: base pixel (x, y) maps to patch pixel
 * floor(((offset + x / dim) / scale) * patchSize). Sibling base tiles under
 * one patch tile therefore sample identical source pixels — no seams.
 * Out-of-patch pixels stay alpha 0 ("no coverage").
 */
export function resamplePatchToBaseGrid(
    patchImage: ImageData,
    baseTileKey: TileKey,
    patchTileKey: TileKey,
    dim: number
): ImageData {
    const out = new ImageData(dim, dim);
    if (baseTileKey.level < patchTileKey.level) {
        warnOnce(
            "resamplePatchToBaseGrid: patch tile is finer than the base grid; " +
                "producing an empty (no coverage) patch"
        );
        return out;
    }
    const scale = 1 << (baseTileKey.level - patchTileKey.level);
    const offsetCol = baseTileKey.column - patchTileKey.column * scale;
    const offsetRow = baseTileKey.row - patchTileKey.row * scale;
    const patchWidth = patchImage.width;
    const patchHeight = patchImage.height;
    const src = patchImage.data;
    const dst = out.data;

    for (let y = 0; y < dim; y++) {
        const py = Math.floor(((offsetRow + y / dim) / scale) * patchHeight);
        if (py < 0 || py >= patchHeight) {
            continue;
        }
        for (let x = 0; x < dim; x++) {
            const px = Math.floor(((offsetCol + x / dim) / scale) * patchWidth);
            if (px < 0 || px >= patchWidth) {
                continue;
            }
            const srcIdx = (py * patchWidth + px) * 4;
            const dstIdx = (y * dim + x) * 4;
            dst[dstIdx] = src[srcIdx];
            dst[dstIdx + 1] = src[srcIdx + 1];
            dst[dstIdx + 2] = src[srcIdx + 2];
            dst[dstIdx + 3] = src[srcIdx + 3];
        }
    }
    return out;
}

/** Union of two geographic bounding boxes (shared by manager events and invalidation) */
export function unionGeoBoxes(a: GeoBox, b: GeoBox): GeoBox {
    return new GeoBoxClass(
        new GeoCoordinates(
            Math.min(a.southWest.latitude, b.southWest.latitude),
            Math.min(a.southWest.longitude, b.southWest.longitude)
        ),
        new GeoCoordinates(
            Math.max(a.northEast.latitude, b.northEast.latitude),
            Math.max(a.northEast.longitude, b.northEast.longitude)
        )
    );
}

/**
 * Bakes patch pixels into a base tile's pixel buffer, in place.
 *
 * `patches` MUST be ordered by ascending priority: every covered pixel is
 * overwritten entry by entry, so later (higher priority) entries win. The
 * value IS the new elevation — patch pixels are decoded with their own
 * encoding and re-encoded into the base encoding before overwriting.
 *
 * Only the inner grid is written (border ring at `innerOffset` untouched);
 * borders converge through the regular edge-replication / neighbor backfill
 * mechanism, and neighbors are themselves patched, so seams stay consistent.
 */
export function composeDemTilePixels(
    base: ImageData,
    baseEncoding: DEMEncoding,
    patches: SerializedDemPatchTile[],
    innerOffset: number
): void {
    if (patches.length === 0) {
        return;
    }
    const dim = base.width - 2 * innerOffset;
    if (dim <= 0) {
        warnOnce(`composeDemTilePixels: degenerate inner grid (${base.width}px image)`);
        return;
    }
    const dst = base.data;

    for (const patch of patches) {
        if (patch.imageData.width !== dim || patch.imageData.height !== dim) {
            warnOnce(
                `composeDemTilePixels: patch grid ${patch.imageData.width}x` +
                    `${patch.imageData.height} does not match the base inner grid ` +
                    `${dim}x${dim}; patch skipped`
            );
            continue;
        }
        const src = patch.imageData.data;
        for (let y = 0; y < dim; y++) {
            const dstRowStart = (y + innerOffset) * base.width + innerOffset;
            const srcRowStart = y * dim;
            for (let x = 0; x < dim; x++) {
                const srcIdx = (srcRowStart + x) * 4;
                if (src[srcIdx + 3] < PATCH_ALPHA_THRESHOLD) {
                    continue;
                }
                const elevation = decodeDemElevation(
                    src[srcIdx],
                    src[srcIdx + 1],
                    src[srcIdx + 2],
                    patch.encoding
                );
                const rgb = DEMData.pack(elevation, baseEncoding);
                const dstIdx = (dstRowStart + x) * 4;
                dst[dstIdx] = rgb[0];
                dst[dstIdx + 1] = rgb[1];
                dst[dstIdx + 2] = rgb[2];
            }
        }
    }
}
