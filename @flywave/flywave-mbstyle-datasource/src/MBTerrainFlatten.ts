/*
 * §740: DEM terrain flattening under a model footprint — the pure core of
 * applyDemFlattening (mgl tiled_3d_model_bucket.updateDEM, :416-575).
 * Extracted for unit testability: the row mapping here is the one §729
 * corrected (data rows run north→south: sampler reads row n−1−v).
 *
 * Coordinates: the DEM covers the world square [originX, originX+size] ×
 * [originY, originY+size]; data texel (x, y) has its center at world
 * (originX + (x+0.5)/n·size, originY + (n−1−y+0.5)/n·size) — the y term is
 * the north→south flip.
 */

export interface DemFlattenTile {
    /** DEM texels, row-major n×n (row 0 = north edge). */
    data: Float32Array;
    /** DEM resolution (data.length === n*n). */
    n: number;
    originX: number;
    originY: number;
    /** World size of the DEM square (both axes). */
    size: number;
}

/** Region-scratch buffers shared across footprints (mgl lookup/passLookup). */
export interface DemFlattenScratch {
    pass: Uint8Array;
    lookup: Float64Array;
    n: number;
}

export function makeDemFlattenScratch(n: number): DemFlattenScratch {
    return { pass: new Uint8Array(n * n), lookup: new Float64Array(n * n), n };
}

/**
 * Flatten `data` under one footprint ring (absolute world coords).
 * Region A (pixels whose center is inside the ring) is set to the average
 * height over those pixels; region B (demAtt ring, clamped [2,5]) propagates
 * the delta outward with distance attenuation and wave prevention.
 * Returns true when any texel was written (caller uploads the texture).
 */
export function flattenDemFootprint(
    tile: DemFlattenTile,
    wx: number[],
    wy: number[],
    scratch: DemFlattenScratch,
): boolean {
    const { data, n, originX, originY, size } = tile;
    let minWX = Infinity, maxWX = -Infinity, minWY = Infinity, maxWY = -Infinity;
    for (let i = 0; i < wx.length; i++) {
        if (wx[i] < minWX) minWX = wx[i];
        if (wx[i] > maxWX) maxWX = wx[i];
        if (wy[i] < minWY) minWY = wy[i];
        if (wy[i] > maxWY) maxWY = wy[i];
    }
    const pxOf = (w: number, origin: number) => Math.floor((w - origin) / size * n);
    const minDemX = pxOf(minWX, originX);
    const maxDemX = pxOf(maxWX, originX);
    // North→south data rows: the north edge maps to the LOW row index.
    const minDemY = (n - 1) - pxOf(maxWY, originY);
    const maxDemY = (n - 1) - pxOf(minWY, originY);
    const worldYofRow = (y: number) => originY + ((n - 1 - y) + 0.5) / n * size;
    const distanceToBorder = Math.min(n - maxDemY, minDemX, minDemY, n - maxDemX);
    if (distanceToBorder < 0) return false; // mgl: skip tile-border crossings
    const demAtt = Math.min(5, Math.max(2, distanceToBorder));
    const { pass, lookup } = scratch;

    const get = (x: number, y: number) => data[y * n + x];
    const set = (x: number, y: number, val: number) => {
        const idx = y * n + x;
        const delta = val - data[idx];
        data[idx] = val;
        return delta;
    };

    const minx0 = Math.max(0, minDemX - demAtt);
    const miny0 = Math.max(0, minDemY - demAtt);
    const maxx0 = Math.min(maxDemX + demAtt, n - 1);
    const maxy0 = Math.min(maxDemY + demAtt, n - 1);
    for (let y = miny0; y <= maxy0; ++y) {
        for (let x = minx0; x <= maxx0; ++x) pass[y * n + x] = 255;
    }

    // Region A: DEM pixels whose center is inside the footprint (even-odd).
    let heightAcc = 0;
    let count = 0;
    const polyTest = (pxW: number, pyW: number) => {
        let inside = false;
        for (let i = 0, j = wx.length - 1; i < wx.length; j = i++) {
            const xi = wx[i], yi = wy[i], xj = wx[j], yj = wy[j];
            if (((yi > pyW) !== (yj > pyW))
                && (pxW < (xj - xi) * (pyW - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
    };
    for (let y = Math.max(0, minDemY); y <= Math.min(n - 1, maxDemY); ++y) {
        for (let x = Math.max(0, minDemX); x <= Math.min(n - 1, maxDemX); ++x) {
            const idx = y * n + x;
            if (pass[idx] !== 255) continue;
            if (!polyTest(originX + (x + 0.5) / n * size, worldYofRow(y))) continue;
            pass[idx] = 0;
            heightAcc += get(x, y);
            count++;
        }
    }
    if (!count) return false;
    const avgHeight = heightAcc / count;

    let minx = Math.max(1, minDemX - demAtt);
    let miny = Math.max(1, minDemY - demAtt);
    let maxx = Math.min(maxDemX + demAtt, n - 2);
    let maxy = Math.min(maxDemY + demAtt, n - 2);
    for (let y = miny; y <= maxy; ++y) {
        for (let x = minx; x <= maxx; ++x) {
            if (pass[y * n + x] === 0) {
                lookup[y * n + x] = set(x, y, avgHeight);
            }
        }
    }

    // Region B: attenuated outward propagation (wave-prevented).
    for (let p = 1; p < demAtt; ++p) {
        minx = Math.max(1, minDemX - p);
        miny = Math.max(1, minDemY - p);
        maxx = Math.min(maxDemX + p, n - 2);
        maxy = Math.min(maxDemY + p, n - 2);
        for (let y = miny; y <= maxy; ++y) {
            for (let x = minx; x <= maxx; ++x) {
                const idxThis = y * n + x;
                if (pass[idxThis] !== 255) continue;
                let maxDiff = 0;
                let maxDiffAbs = 0;
                let xoffset = -1;
                let yoffset = -1;
                for (let j = -1; j <= 1; ++j) {
                    for (let i = -1; i <= 1; ++i) {
                        const idx = (y + j) * n + (x + i);
                        if (pass[idx] >= p) continue;
                        const diff = lookup[idx];
                        const diffAbs = Math.abs(diff);
                        if (diffAbs > maxDiffAbs) {
                            maxDiff = diff;
                            maxDiffAbs = diffAbs;
                            xoffset = i;
                            yoffset = j;
                        }
                    }
                }
                if (maxDiffAbs > 0.1) {
                    const diagonalAttenuation = Math.abs(xoffset * yoffset) * 0.5;
                    const attenuation = 1 - (p + diagonalAttenuation) / demAtt;
                    const prev = get(x, y);
                    let next = prev + maxDiff * attenuation;
                    const parent = get(x + xoffset, y + yoffset);
                    const child = get(x - xoffset, y - yoffset);
                    if ((next - parent) * (next - child) > 0) {
                        next = (parent + child) / 2;
                    }
                    lookup[idxThis] = set(x, y, next);
                    pass[idxThis] = p;
                }
            }
        }
    }
    return true;
}
