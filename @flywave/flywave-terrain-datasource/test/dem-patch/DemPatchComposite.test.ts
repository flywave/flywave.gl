/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { GeoBox, GeoCoordinates, TileKey } from "@flywave/flywave-geoutils";

import { DEMData } from "../../src/dem-terrain/dem/DemData";
import {
    composeDemTilePixels,
    computeAncestorTileKey,
    computeDemTileGrid,
    resamplePatchToBaseGrid,
    selectPatchTileLevel
} from "../../src/dem-terrain/dem-patch/DemPatchComposite";
import type { SerializedDemPatchTile } from "../../src/dem-terrain/dem-patch/DemPatchTypes";
import { processDEMTile } from "../../src/dem-terrain/TileWorkerDecoder";
import {
    BORDER_SENTINEL_ALTITUDE,
    decodePixelAltitude,
    makeBaseTileImage,
    makeImageData,
    makeUniformPatchImage,
    pixelAlpha
} from "./DemPatchTestHelpers";

const DIM = 4;

function patch(
    imageData: ImageData,
    encoding: SerializedDemPatchTile["encoding"]
): SerializedDemPatchTile {
    return { imageData, encoding };
}

/** mapbox pack via the production encoder, for building raw pixel fixtures */
function packMapbox(altitude: number): [number, number, number, number] {
    return DEMData.pack(altitude, "mapbox");
}

describe("DemPatchComposite（DEM 修正数据合成 · 单瓦片）", function () {
    describe("computeDemTileGrid（基础瓦片网格度量）", function () {
        it("256px 原生瓦片:解码期补 1px 边框,dim 保持 256", function () {
            expect(computeDemTileGrid(256)).to.deep.equal({
                decodePadding: 1,
                borderReady: false,
                dim: 256
            });
        });

        it("258px 预边框瓦片:无需补边框,dim 仍为 256", function () {
            expect(computeDemTileGrid(258)).to.deep.equal({
                decodePadding: 0,
                borderReady: true,
                dim: 256
            });
        });

        it("512px 与 514px 同理", function () {
            expect(computeDemTileGrid(512).dim).to.equal(512);
            expect(computeDemTileGrid(512).decodePadding).to.equal(1);
            expect(computeDemTileGrid(514).dim).to.equal(512);
            expect(computeDemTileGrid(514).borderReady).to.equal(true);
        });
    });

    describe("selectPatchTileLevel（修正层级选择规则）", function () {
        it("基础 18 级、修正最精 16 级 → 取 16 级祖先上采样", function () {
            expect(selectPatchTileLevel(18, 10, 16)).to.equal(16);
        });

        it("基础 14 级落在修正层级范围内 → 取本级 14", function () {
            expect(selectPatchTileLevel(14, 10, 16)).to.equal(14);
        });

        it("基础 16 级、修正范围 10-16 → 取本级 16（黄金路径）", function () {
            expect(selectPatchTileLevel(16, 10, 16)).to.equal(16);
        });

        it("基础 16 级、修正可到 18 级 → 仍取 16（修正可见精度不超过基础网格）", function () {
            expect(selectPatchTileLevel(16, 14, 18)).to.equal(16);
        });

        it("基础 18 级、修正可到 18 级 → 取本级 18（1:1 直拷）", function () {
            expect(selectPatchTileLevel(18, 14, 18)).to.equal(18);
        });

        it("基础粗于修正 minzoom → 无覆盖（不向下拼接）", function () {
            expect(selectPatchTileLevel(5, 10, 16)).to.equal(undefined);
        });
    });

    describe("computeAncestorTileKey（祖先瓦片键）", function () {
        it("level2(3,2) 的 level1 祖先是 (1,1)", function () {
            const base = TileKey.fromRowColumnLevel(2, 3, 2);
            const ancestor = computeAncestorTileKey(base, 1);
            expect(ancestor.level).to.equal(1);
            expect(ancestor.column).to.equal(1);
            expect(ancestor.row).to.equal(1);
        });

        it("level2(3,2) 的 level0 祖先是 (0,0)", function () {
            const base = TileKey.fromRowColumnLevel(2, 3, 2);
            const ancestor = computeAncestorTileKey(base, 0);
            expect(ancestor.column).to.equal(0);
            expect(ancestor.row).to.equal(0);
        });

        it("同级瓦片返回自身坐标", function () {
            const base = TileKey.fromRowColumnLevel(2, 3, 2);
            const same = computeAncestorTileKey(base, 2);
            expect(same.column).to.equal(3);
            expect(same.row).to.equal(2);
        });
    });

    describe("composeDemTilePixels（像素烘焙）", function () {
        it("空补丁列表 = 纯基础,像素零改动", function () {
            const base = makeBaseTileImage(DIM);
            const before = new Uint8ClampedArray(base.data);
            composeDemTilePixels(base, "mapbox", [], 1);
            expect(Array.from(base.data)).to.deep.equal(Array.from(before));
        });

        it("全覆盖修正:内圈像素 = 修正高程,边框保持原样", function () {
            const base = makeBaseTileImage(DIM);
            // integer altitude: exact under mapbox's 0.1m floor quantization
            const patchTile = makeUniformPatchImage(DIM, 123);
            composeDemTilePixels(base, "mapbox", [patch(patchTile, "mapbox")], 1);
            for (let y = 0; y < DIM; y++) {
                for (let x = 0; x < DIM; x++) {
                    expect(decodePixelAltitude(base, x + 1, y + 1)).to.be.closeTo(123, 0.001);
                }
            }
            expect(decodePixelAltitude(base, 0, 0)).to.be.closeTo(BORDER_SENTINEL_ALTITUDE, 0.001);
            expect(decodePixelAltitude(base, DIM + 1, DIM + 1)).to.be.closeTo(
                BORDER_SENTINEL_ALTITUDE,
                0.001
            );
        });

        it("alpha=0 像素视为无数据,基础高程透出", function () {
            const base = makeBaseTileImage(DIM);
            const patchTile = makeUniformPatchImage(DIM, 50.5, "mapbox", (x, y) =>
                y < 2 ? 255 : 0
            );
            composeDemTilePixels(base, "mapbox", [patch(patchTile, "mapbox")], 1);
            for (let x = 0; x < DIM; x++) {
                expect(decodePixelAltitude(base, x + 1, 1)).to.be.closeTo(50.5, 0.001);
                expect(decodePixelAltitude(base, x + 1, 2)).to.be.closeTo(50.5, 0.001);
                // inner rows 2-3 keep the base gradient
                expect(decodePixelAltitude(base, x + 1, 3)).to.be.closeTo(10 + x + 2, 0.001);
                expect(decodePixelAltitude(base, x + 1, 4)).to.be.closeTo(10 + x + 3, 0.001);
            }
        });

        it("升序优先级:后写胜——高优先级只在覆盖处压过低优先级", function () {
            const base = makeBaseTileImage(DIM);
            const low = makeUniformPatchImage(DIM, 11.1);
            const high = makeUniformPatchImage(DIM, 22.2, "mapbox", (x, y) => (y >= 2 ? 255 : 0));
            composeDemTilePixels(base, "mapbox", [patch(low, "mapbox"), patch(high, "mapbox")], 1);
            for (let x = 0; x < DIM; x++) {
                expect(decodePixelAltitude(base, x + 1, 1)).to.be.closeTo(11.1, 0.001);
                expect(decodePixelAltitude(base, x + 1, 3)).to.be.closeTo(22.2, 0.001);
            }
        });

        it("违反升序时退化为后写全胜（文档化:必须按优先级升序传入）", function () {
            const base = makeBaseTileImage(DIM);
            const low = makeUniformPatchImage(DIM, 11.1);
            const high = makeUniformPatchImage(DIM, 22.2, "mapbox", (x, y) => (y >= 2 ? 255 : 0));
            composeDemTilePixels(base, "mapbox", [patch(high, "mapbox"), patch(low, "mapbox")], 1);
            // low covers the full tile and is applied last → whole tile = 11.1
            for (let x = 0; x < DIM; x++) {
                expect(decodePixelAltitude(base, x + 1, 3)).to.be.closeTo(11.1, 0.001);
            }
        });

        it("跨编码:terrarium 修正烘入 mapbox 基础,数值经重编码保持", function () {
            const base = makeBaseTileImage(DIM);
            const patchTile = makeUniformPatchImage(DIM, 77.5, "terrarium");
            composeDemTilePixels(base, "mapbox", [patch(patchTile, "terrarium")], 1);
            for (let y = 0; y < DIM; y++) {
                for (let x = 0; x < DIM; x++) {
                    expect(decodePixelAltitude(base, x + 1, y + 1)).to.be.closeTo(77.5, 0.2);
                }
            }
        });

        it("补丁网格尺寸与内圈不符时跳过且不崩溃", function () {
            const base = makeBaseTileImage(DIM);
            const before = new Uint8ClampedArray(base.data);
            const wrongGrid = makeUniformPatchImage(DIM + 2, 55.5);
            composeDemTilePixels(base, "mapbox", [patch(wrongGrid, "mapbox")], 1);
            expect(Array.from(base.data)).to.deep.equal(Array.from(before));
        });
    });

    describe("resamplePatchToBaseGrid（修正瓦片重采样）", function () {
        // Patch tile at level 0 (0,0), 4x4; altitude encodes its pixel index.
        // Base tile: level 1 (col 1, row 0) → scale 2, offset (1, 0).
        // Sampled source pixels are exactly {(2,0),(3,0),(2,1),(3,1)} — the
        // alpha=0 "no data" pixel sits at (3,1) so it lands in the output.
        const patchTile = makeImageData(4, 4, (x, y) => {
            const rgb = packMapbox(100 * (y * 4 + x + 1));
            const alpha = x === 3 && y === 1 ? 0 : 255;
            return [rgb[0], rgb[1], rgb[2], alpha];
        });

        it("2 倍层级差:基础像素最近邻映射到修正像素(含象限偏移)", function () {
            const base = TileKey.fromRowColumnLevel(0, 1, 1);
            const patchKey = TileKey.fromRowColumnLevel(0, 0, 0);
            const out = resamplePatchToBaseGrid(patchTile, base, patchKey, DIM);
            // px = floor(((1 + x/4)/2)*4) = 2 + floor(x/2); py = floor(y/2)
            for (let y = 0; y < DIM; y++) {
                for (let x = 0; x < DIM; x++) {
                    const expected = 100 * (Math.floor(y / 2) * 4 + 2 + Math.floor(x / 2) + 1);
                    expect(decodePixelAltitude(out, x, y)).to.be.closeTo(expected, 0.001);
                }
            }
        });

        it("源像素 alpha=0 → 重采样结果同为无数据", function () {
            const base = TileKey.fromRowColumnLevel(0, 1, 1);
            const patchKey = TileKey.fromRowColumnLevel(0, 0, 0);
            const out = resamplePatchToBaseGrid(patchTile, base, patchKey, DIM);
            // src (3,1) feeds out x∈{2,3} × y∈{2,3}
            expect(pixelAlpha(out, 2, 2)).to.equal(0);
            expect(pixelAlpha(out, 3, 2)).to.equal(0);
            expect(pixelAlpha(out, 2, 3)).to.equal(0);
            expect(pixelAlpha(out, 3, 3)).to.equal(0);
            expect(pixelAlpha(out, 0, 0)).to.equal(255);
        });

        it("修正比基础细 → 产出空补丁（不覆盖任何像素）", function () {
            const base = TileKey.fromRowColumnLevel(0, 0, 0);
            const patchKey = TileKey.fromRowColumnLevel(1, 0, 1);
            const out = resamplePatchToBaseGrid(patchTile, base, patchKey, DIM);
            for (let i = 3; i < out.data.length; i += 4) {
                expect(out.data[i]).to.equal(0);
            }
        });
    });

    describe("单瓦片端到端（主基础 + 双修正层按优先级烘焙）", function () {
        it("行 0 = 低优先级修正;行 1-3 = 高优先级修正压过重叠区;边框不动", function () {
            const base = makeBaseTileImage(DIM);
            const patchLow = makeUniformPatchImage(DIM, 50.5, "mapbox", (x, y) =>
                y < 2 ? 255 : 0
            );
            const patchHigh = makeUniformPatchImage(DIM, 77.5, "mapbox", (x, y) =>
                y >= 1 ? 255 : 0
            );
            // ascending priority: low first, high last
            composeDemTilePixels(
                base,
                "mapbox",
                [patch(patchLow, "mapbox"), patch(patchHigh, "mapbox")],
                1
            );
            for (let x = 0; x < DIM; x++) {
                expect(decodePixelAltitude(base, x + 1, 1)).to.be.closeTo(50.5, 0.001);
                expect(decodePixelAltitude(base, x + 1, 2)).to.be.closeTo(77.5, 0.001);
                expect(decodePixelAltitude(base, x + 1, 3)).to.be.closeTo(77.5, 0.001);
                expect(decodePixelAltitude(base, x + 1, 4)).to.be.closeTo(77.5, 0.001);
            }
            expect(decodePixelAltitude(base, 0, 2)).to.be.closeTo(BORDER_SENTINEL_ALTITUDE, 0.001);
            expect(decodePixelAltitude(base, DIM + 1, 2)).to.be.closeTo(
                BORDER_SENTINEL_ALTITUDE,
                0.001
            );
        });
    });

    describe("processDEMTile 集成（解码期烘焙,四叉树建立在烘焙后像素上）", function () {
        const geoBox = new GeoBox(new GeoCoordinates(-10, -10), new GeoCoordinates(10, 10));

        it("带补丁解码:dem 读数 = 修正值,pristine 底稿 = 原始基础像素", async function () {
            // 256px tile + decode padding 1 → 258 padded buffer (the common path)
            const base256 = makeImageData(256, 256, () => {
                const c = packMapbox(10);
                return [c[0], c[1], c[2], 255];
            });
            const patchTile = makeUniformPatchImage(256, 88);
            const result = await processDEMTile({
                uid: "test-tile",
                encoding: "mapbox",
                imageData: base256,
                geoBox: geoBox.toArray(),
                padding: 1,
                buildQuadTree: true,
                flipY: false,
                patches: [{ imageData: patchTile, encoding: "mapbox" }]
            });
            const dem = result.dem;
            expect(dem.get(0, 0)).to.be.closeTo(88, 0.2);
            expect(dem.getMinMaxElevation().max).to.be.closeTo(88, 0.2);
            // pristine carries the PRE-composite base pixels for re-baking
            expect(result.pristine).to.not.equal(undefined);
            const pristineImage = new ImageData(
                new Uint8ClampedArray(result.pristine!.buffer),
                258,
                258
            );
            expect(decodePixelAltitude(pristineImage, 1, 1)).to.be.closeTo(10, 0.2);
            expect(decodePixelAltitude(pristineImage, 129, 129)).to.be.closeTo(10, 0.2);
        });

        it("重烘焙合成工作在副本上,不污染 pristine 底稿", async function () {
            const base256 = makeImageData(256, 256, () => {
                const c = packMapbox(10);
                return [c[0], c[1], c[2], 255];
            });
            const result = await processDEMTile({
                uid: "test-tile",
                encoding: "mapbox",
                imageData: base256,
                geoBox: geoBox.toArray(),
                padding: 1,
                buildQuadTree: true,
                flipY: false,
                patches: [{ imageData: makeUniformPatchImage(256, 88), encoding: "mapbox" }]
            });
            const pristineCopy = new Uint8Array(result.pristine!);
            // simulate a re-bake: compose a different patch over a COPY
            const rebakeImage = new ImageData(new Uint8ClampedArray(result.pristine!), 258, 258);
            composeDemTilePixels(
                rebakeImage,
                "mapbox",
                [{ imageData: makeUniformPatchImage(256, 44), encoding: "mapbox" }],
                1
            );
            expect(decodePixelAltitude(rebakeImage, 2, 2)).to.be.closeTo(44, 0.2);
            // the stored pristine bytes are untouched by the re-bake
            expect(Array.from(result.pristine!)).to.deep.equal(Array.from(pristineCopy));
            expect(decodePixelAltitude(rebakeImage, 2, 2)).to.not.be.closeTo(10, 0.001);
        });

        it("不带补丁解码 = 纯基础且无 pristine(回归基线)", async function () {
            const base256 = makeImageData(256, 256, (x, y) => {
                const c = packMapbox(10 + ((x + y) % 7));
                return [c[0], c[1], c[2], 255];
            });
            const result = await processDEMTile({
                uid: "test-tile-plain",
                encoding: "mapbox",
                imageData: base256,
                geoBox: geoBox.toArray(),
                padding: 1,
                buildQuadTree: true,
                flipY: false
            });
            expect(result.dem.get(0, 0)).to.be.closeTo(10, 0.2);
            expect(result.dem.getMinMaxElevation().max).to.be.closeTo(16, 0.2);
        });
    });
});
