/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { splitFrustum } from "../../src/clouds/splitFrustum";

const EPS = 1e-12;

describe("splitFrustum（CSM 级联切分）", function () {
    it("uniform 模式：线性等分", function () {
        const splits = splitFrustum("uniform", 4, 1, 1000);
        expect(splits).to.have.lengthOf(4);
        expect(splits[0]).to.approximately((1 + (999 * 1) / 4) / 1000, 1e-12);
        expect(splits[1]).to.approximately((1 + (999 * 2) / 4) / 1000, 1e-12);
        expect(splits[2]).to.approximately((1 + (999 * 3) / 4) / 1000, 1e-12);
        expect(splits[3]).to.approximately(1, EPS);
    });

    it("logarithmic 模式：按对数比例切分", function () {
        const splits = splitFrustum("logarithmic", 4, 1, 1000);
        expect(splits[0]).to.approximately(Math.pow(1000, -0.75), 1e-12);
        expect(splits[1]).to.approximately(Math.pow(1000, -0.5), 1e-12);
        expect(splits[2]).to.approximately(Math.pow(1000, -0.25), 1e-12);
        expect(splits[3]).to.approximately(1, EPS);
    });

    it("practical 模式：uniform 与 logarithmic 按 lambda 插值", function () {
        const uniform = splitFrustum("uniform", 4, 1, 1000);
        const logarithmic = splitFrustum("logarithmic", 4, 1, 1000);
        const practical = splitFrustum("practical", 4, 1, 1000, 0.6);
        for (let i = 0; i < 4; ++i) {
            const expected = uniform[i] + (logarithmic[i] - uniform[i]) * 0.6;
            expect(practical[i]).to.approximately(expected, 1e-12);
        }
        // lambda=0 degenerates to uniform, lambda=1 degenerates to logarithmic
        const p0 = splitFrustum("practical", 4, 1, 1000, 0);
        const p1 = splitFrustum("practical", 4, 1, 1000, 1);
        for (let i = 0; i < 4; ++i) {
            expect(p0[i]).to.approximately(uniform[i], 1e-12);
            expect(p1[i]).to.approximately(logarithmic[i], 1e-12);
        }
    });

    it("任意模式：单调不减且终点恒为 1", function () {
        for (const mode of ["uniform", "logarithmic", "practical"] as const) {
            const splits = splitFrustum(mode, 8, 0.5, 50000, 0.75);
            expect(splits).to.have.lengthOf(8);
            for (let i = 1; i < 8; ++i) {
                expect(splits[i]).to.be.at.least(splits[i - 1] - EPS);
            }
            expect(splits[7]).to.be.at.least(1 - EPS);
            expect(splits[7]).to.be.at.most(1 + EPS);
        }
    });

    it("count=1 时返回 [1]", function () {
        expect(splitFrustum("practical", 1, 1, 100)[0]).to.approximately(1, EPS);
    });

    it("复用调用方传入的 result 数组", function () {
        const result: number[] = [];
        splitFrustum("uniform", 3, 1, 100, 0.5, result);
        expect(result).to.have.lengthOf(3);
        const same = splitFrustum("uniform", 2, 1, 100, 0.5, result);
        expect(same).to.equal(result);
        expect(result).to.have.lengthOf(2);
    });
});
