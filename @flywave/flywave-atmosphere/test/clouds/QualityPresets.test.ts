/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { qualityPresets } from "../../src/clouds/QualityPresets";

describe("QualityPresets（云质量预设）", function () {
    it("四个预设全部存在", function () {
        expect(Object.keys(qualityPresets).sort()).to.deep.equal([
            "high",
            "low",
            "medium",
            "ultra"
        ]);
    });

    it("high 基准值（文档化数值，改动即破坏兼容）", function () {
        const p = qualityPresets.high;
        expect(p.resolutionScale).to.equal(1);
        expect(p.hazeEnabled).to.equal(true);
        expect(p.accuratePhaseFunction).to.equal(false);
        expect(p.maxIterationCount).to.equal(500);
        expect(p.minStepSize).to.equal(50);
        expect(p.maxStepSize).to.equal(1000);
        expect(p.maxRayDistance).to.equal(2e5);
        expect(p.perspectiveStepScale).to.equal(1.01);
        expect(p.minDensity).to.equal(1e-5);
        expect(p.minExtinction).to.equal(1e-5);
        expect(p.minTransmittance).to.equal(1e-2);
        expect(p.maxIterationCountToGround).to.equal(3);
        expect(p.maxIterationCountToSun).to.equal(2);
        expect(p.shadowCascadeCount).to.equal(3);
        expect(p.shadowMapSize).to.equal(512);
        expect(p.shadowMaxIterationCount).to.equal(50);
        expect(p.shadowMinStepSize).to.equal(100);
        expect(p.shadowMinTransmittance).to.equal(1e-4);
        expect(p.maxShadowLengthIterationCount).to.equal(500);
    });

    it("low：迭代/级联/影长全面收缩", function () {
        const low = qualityPresets.low;
        const high = qualityPresets.high;
        expect(low.maxIterationCount).to.be.below(high.maxIterationCount);
        expect(low.maxRayDistance).to.be.below(high.maxRayDistance);
        expect(low.shadowCascadeCount).to.be.below(high.shadowCascadeCount);
        expect(low.shadowMapSize).to.be.below(high.shadowMapSize);
        expect(low.shadowMaxIterationCount).to.be.below(high.shadowMaxIterationCount);
        expect(low.maxShadowLengthIterationCount).to.be.below(high.maxShadowLengthIterationCount);
        // Sampling density thresholds are looser (more aggressive early exit)
        expect(low.minDensity).to.be.above(high.minDensity);
        expect(low.minTransmittance).to.be.above(high.minTransmittance);
    });

    it("medium：介于 low 与 high 之间", function () {
        const medium = qualityPresets.medium;
        const high = qualityPresets.high;
        expect(medium.maxIterationCount).to.equal(high.maxIterationCount);
        expect(medium.shadowMapSize).to.equal(qualityPresets.low.shadowMapSize);
        expect(medium.maxShadowLengthIterationCount).to.equal(300);
        expect(medium.maxIterationCountToGround).to.equal(1);
    });

    it("ultra：精确相位函数 + 更小步长 + 更大阴影图，其余继承 high", function () {
        const ultra = qualityPresets.ultra;
        expect(ultra.accuratePhaseFunction).to.equal(true);
        expect(ultra.minStepSize).to.equal(10);
        expect(ultra.shadowMapSize).to.equal(1024);
        expect(ultra.maxIterationCount).to.equal(qualityPresets.high.maxIterationCount);
        expect(ultra.maxShadowLengthIterationCount).to.equal(500);
    });

    it("所有预设满足数值域不变量（步长/阈值关系）", function () {
        for (const [name, p] of Object.entries(qualityPresets)) {
            expect(p.minStepSize, `${name}.minStepSize`).to.be.at.most(p.maxStepSize);
            expect(p.minStepSize, `${name}.minStepSize>0`).to.be.above(0);
            expect(p.shadowMinStepSize, `${name}.shadowMinStepSize`).to.be.at.most(
                p.shadowMaxStepSize
            );
            expect(p.minTransmittance, `${name}.minTransmittance`).to.be.above(0);
            expect(p.minTransmittance, `${name}.minTransmittance<=1`).to.be.at.most(1);
            expect(p.shadowMinTransmittance, `${name}.shadowMinTransmittance`).to.be.above(0);
            expect(p.maxIterationCountToSun, `${name}.sunMarch`).to.be.at.least(0);
            expect(p.shadowCascadeCount, `${name}.cascades`).to.be.within(1, 4);
        }
    });
});
