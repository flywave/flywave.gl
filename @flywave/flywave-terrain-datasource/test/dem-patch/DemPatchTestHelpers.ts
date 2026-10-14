/* Copyright (C) 2025 flywave.gl contributors */

import { DEMData, type DEMEncoding } from "../../src/dem-terrain/dem/DemData";
import { decodeDemElevation } from "../../src/dem-terrain/dem-patch/DemPatchComposite";

/**
 * Shared fixtures for the DEM patch unit tests. Everything here fabricates
 * imagery in memory — no network, no worker.
 */

/** Sentinel altitude written into border pixels so tests can assert "untouched" */
export const BORDER_SENTINEL_ALTITUDE = -999;

/**
 * Builds a border-padded base DEM tile image (total size = dim + 2).
 * Inner pixel (x-1, y-1) encodes altitude `10 + (x-1) + (y-1)`; the border
 * ring carries the sentinel so "composite must not touch borders" is
 * directly assertable.
 */
export function makeBaseTileImage(dim: number): ImageData {
    return makeImageData(dim + 2, dim + 2, (x, y) => {
        const inner = x >= 1 && x <= dim && y >= 1 && y <= dim;
        const altitude = inner ? 10 + (x - 1) + (y - 1) : BORDER_SENTINEL_ALTITUDE;
        return DEMData.pack(altitude, "mapbox");
    });
}

/** Builds an ImageData with a per-pixel RGBA fill callback */
export function makeImageData(
    width: number,
    height: number,
    fill: (x: number, y: number) => [number, number, number, number]
): ImageData {
    const image = new ImageData(width, height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const [r, g, b, a] = fill(x, y);
            const idx = (y * width + x) * 4;
            image.data[idx] = r;
            image.data[idx + 1] = g;
            image.data[idx + 2] = b;
            image.data[idx + 3] = a;
        }
    }
    return image;
}

/** Builds a dim x dim patch image where every pixel encodes `altitude` */
export function makeUniformPatchImage(
    dim: number,
    altitude: number,
    encoding: DEMEncoding = "mapbox",
    alpha: (x: number, y: number) => number = () => 255
): ImageData {
    const rgb = DEMData.pack(altitude, encoding);
    return makeImageData(dim, dim, (x, y) => [rgb[0], rgb[1], rgb[2], alpha(x, y)]);
}

/** Decodes the altitude encoded in one pixel of an ImageData */
export function decodePixelAltitude(
    image: ImageData,
    x: number,
    y: number,
    encoding: DEMEncoding = "mapbox"
): number {
    const idx = (y * image.width + x) * 4;
    return decodeDemElevation(image.data[idx], image.data[idx + 1], image.data[idx + 2], encoding);
}

/** Reads the alpha byte of one pixel of an ImageData */
export function pixelAlpha(image: ImageData, x: number, y: number): number {
    return image.data[(y * image.width + x) * 4 + 3];
}
