/* Copyright (C) 2025 flywave.gl contributors */

//    Mocha discourages using arrow functions, see https://mochajs.org/#arrow-functions

import { assert } from "chai";

import { SubTiles } from "../src/tiling/SubTiles";
import { TileKey } from "../src/tiling/TileKey";

describe("SubTiles", function () {
    it("iterates through all subtiles", function () {
        const subTiles = new SubTiles(TileKey.fromRowColumnLevel(0, 0, 0), 1, 2);
        const actualSubtiles: TileKey[] = [];

        for (const subTile of subTiles) {
            actualSubtiles.push(subTile);
        }

        assert.equal(actualSubtiles.length, 2);
    });
});
