/* Copyright (C) 2025 flywave.gl contributors */

import { GL } from "@flywave/flywave-utils";
import { expect } from "chai";

import Tile3DFeatureTable from "../../src/loader/classes/Tile3DFeatureTable";

function makeFeatureTable(): Tile3DFeatureTable {
    // 纯 JSON 型 feature table（POSITION/SCALE 存在，NORMAL_*/SCALE_NON_UNIFORM 缺失）
    const table = new Tile3DFeatureTable(
        {
            POSITION: [1, 2, 3, 4, 5, 6],
            SCALE: [1.5, 2.5]
        },
        new ArrayBuffer(0)
    );
    table.featuresLength = 2;
    return table;
}

describe("Tile3DFeatureTable（I3DM 可选属性守卫所依赖的语义）", function () {
    it("hasProperty 与 json 内容一致", function () {
        const table = makeFeatureTable();
        expect(table.hasProperty("POSITION")).to.equal(true);
        expect(table.hasProperty("NORMAL_UP")).to.equal(false);
        expect(table.hasProperty("SCALE_NON_UNIFORM")).to.equal(false);
    });

    it("缺失属性 getProperty 返回 undefined（调用方必须守卫，fromArray(undefined) 会崩）", function () {
        const table = makeFeatureTable();
        expect(table.getProperty("NORMAL_UP", GL.FLOAT, 3, 0, [])).to.equal(undefined);
        expect(table.getProperty("NORMAL_RIGHT", GL.FLOAT, 3, 0, [])).to.equal(undefined);
        expect(table.getProperty("SCALE_NON_UNIFORM", GL.FLOAT, 3, 1, [])).to.equal(undefined);
    });

    it("存在属性按 featureId 正确取值", function () {
        const table = makeFeatureTable();
        expect(table.getProperty("SCALE", GL.FLOAT, 1, 1, null)).to.equal(2.5);
        expect(Array.from(table.getProperty("POSITION", GL.FLOAT, 3, 1, []))).to.deep.equal([
            4, 5, 6
        ]);
    });
});
