/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { GeoBox, GeoCoordinates } from "@flywave/flywave-geoutils";

import { DEMData } from "../../src/dem-terrain/dem/DemData";

const GEO_BOX = new GeoBox(new GeoCoordinates(36.4, 118.1), new GeoCoordinates(36.55, 118.25));

/** Pack an altitude into terrarium RGB bytes (local copy for fixtures). */
function packTerrarium(altitude: number): [number, number, number] {
    const v = Math.floor(altitude + 32768);
    return [Math.floor(v / 256), v % 256, 0];
}

function makeDemImage(size: number): ImageData {
    const img = new ImageData(size, size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const altitude =
                100 + 900 * Math.sin((x / size) * Math.PI) * Math.cos((y / size) * Math.PI);
            const [r, g, b] = packTerrarium(altitude);
            const i = (y * size + x) * 4;
            img.data[i] = r;
            img.data[i + 1] = g;
            img.data[i + 2] = b;
            img.data[i + 3] = 255;
        }
    }
    return img;
}

/** Reference bilinear sampler: mirrors the decoder's sampleElevation exactly. */
function referenceSampleElevation(fx: number, fy: number, dem: DEMData): number {
    const demSize = dem.dim;
    const x = Math.max(0, Math.min(fx * demSize - 0.5, demSize - 1));
    const y = Math.max(0, Math.min(fy * demSize - 0.5, demSize - 1));
    const ixMin = Math.floor(x);
    const iyMin = Math.floor(y);
    const ixMax = Math.min(ixMin + 1, demSize - 1);
    const iyMax = Math.min(iyMin + 1, demSize - 1);
    const e00 = dem.get(ixMin, iyMin);
    const e10 = dem.get(ixMax, iyMin);
    const e01 = dem.get(ixMin, iyMax);
    const e11 = dem.get(ixMax, iyMax);
    const lerp = (a: number, b: number, t: number) => a * (1 - t) + b * t;
    return lerp(lerp(e00, e01, y - iyMin), lerp(e10, e11, y - iyMin), x - ixMin);
}

/**
 * Reference implementation of the pre-optimization base mip level: four
 * bilinear corner samples per block, global min/max over all blocks.
 * (TEXEL_SIZE_OF_MIP0 = 2 in DemTree.ts.)
 */
function referenceBaseMipMinMax(dem: DEMData): { min: number; max: number } {
    const demSize = dem.dim;
    const levelCount = Math.ceil(Math.log2(demSize / 2));
    const blockCount = Math.ceil(Math.pow(2, levelCount));
    const blockSize = 1 / blockCount;
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < blockCount; y++) {
        for (let x = 0; x < blockCount; x++) {
            const e0 = referenceSampleElevation(x * blockSize, y * blockSize, dem);
            const e1 = referenceSampleElevation((x + 1) * blockSize, y * blockSize, dem);
            const e2 = referenceSampleElevation((x + 1) * blockSize, (y + 1) * blockSize, dem);
            const e3 = referenceSampleElevation(x * blockSize, (y + 1) * blockSize, dem);
            min = Math.min(min, e0, e1, e2, e3);
            max = Math.max(max, e0, e1, e2, e3);
        }
    }
    return { min, max };
}

/** Reference for the pre-optimization DEMData.get: slice() truncates indices. */
function referenceGet(dem: DEMData, x: number, y: number): number | undefined {
    const cx = Math.min(dem.dim, Math.max(-1, x));
    const cy = Math.min(dem.dim, Math.max(-1, y));
    if (cx < -1 || cx >= dem.dim + 1 || cy < -1 || cy >= dem.dim + 1) return undefined;
    const index = ((cy + 1) * dem.stride + (cx + 1)) * 4;
    const [r, g, b] = dem.pixels.slice(index, index + 3);
    return r * 256 + g + b / 256 - 32768;
}

describe("DEMData.get / DemMinMaxQuadTree mipmap（圆形回归）", function () {
    it("get() 与旧 slice 语义一致（整数/小数坐标）", function () {
        const dem = new DEMData(0, makeDemImage(18), GEO_BOX, "terrarium", false, false);
        const coords: Array<[number, number]> = [
            [0, 0],
            [1, 1],
            [7, 3],
            [dem.dim - 1, dem.dim - 1],
            [3.7, 5.2],
            [-1, -1],
            [dem.dim, dem.dim]
        ];
        for (const [x, y] of coords) {
            expect(dem.get(x, y)).to.equal(referenceGet(dem, x, y));
        }
    });

    it("基级 mip 的全局 min/max 与旧逐块采样一致（角点记忆化不改变数值）", function () {
        for (const size of [18, 34]) {
            const dem = new DEMData(0, makeDemImage(size), GEO_BOX, "terrarium", false, true);
            const oracle = referenceBaseMipMinMax(dem);
            const tree = dem.tree;
            expect(tree.minimums[0]).to.be.closeTo(oracle.min, 1e-3);
            expect(tree.maximums[0]).to.be.closeTo(oracle.max, 1e-3);
        }
    });

    it("两次构建结果确定性一致", function () {
        const img = makeDemImage(18);
        const demA = new DEMData(0, img, GEO_BOX, "terrarium", false, true);
        const demB = new DEMData(0, img, GEO_BOX, "terrarium", false, true);
        const a = demA.tree;
        const b = demB.tree;
        expect(Array.from(a.minimums.slice(0, 64))).to.deep.equal(
            Array.from(b.minimums.slice(0, 64))
        );
        expect(Array.from(a.maximums.slice(0, 64))).to.deep.equal(
            Array.from(b.maximums.slice(0, 64))
        );
        expect(Array.from(a.leaves.slice(0, 64))).to.deep.equal(Array.from(b.leaves.slice(0, 64)));
    });
});
