/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { CloudLayers } from "../../src/clouds/CloudLayer";
import { CloudUniforms } from "../../src/clouds/CloudUniforms";

describe("CloudUniforms（默认层打包）", function () {
    let u: CloudUniforms;
    beforeEach(function () {
        u = new CloudUniforms(new CloudLayers(CloudLayers.DEFAULT));
    });

    it("层几何打包：altitude 与 altitude+height", function () {
        expect(u.minLayerHeights.value.toArray()).to.deep.equal([750, 1000, 7500, 0]);
        expect(u.maxLayerHeights.value.toArray()).to.deep.equal([1400, 2200, 8000, 0]);
    });

    it("层材质标量打包", function () {
        expect(u.densityScales.value.toArray()).to.deep.equal([0.2, 0.2, 0.003, 0.2]);
        expect(u.shapeAmounts.value.toArray()).to.deep.equal([1, 1, 0.4, 1]);
        expect(u.shapeDetailAmounts.value.toArray()).to.deep.equal([1, 1, 0, 1]);
        expect(u.weatherExponents.value.toArray()).to.deep.equal([1, 1, 1, 1]);
        expect(u.shapeAlteringBiases.value.toArray()).to.deep.equal([0.35, 0.35, 0.35, 0.35]);
        expect(u.coverageFilterWidths.value.toArray()).to.deep.equal([0.6, 0.6, 0.5, 0.6]);
    });

    it("密度剖面打包为默认剖面", function () {
        expect(u.densityProfileExpTerms.value.toArray()).to.deep.equal([0, 0, 0, 0]);
        expect(u.densityProfileLinearTerms.value.toArray()).to.deep.equal([0.75, 0.75, 0.75, 0.75]);
        expect(u.densityProfileConstantTerms.value.toArray()).to.deep.equal([
            0.25, 0.25, 0.25, 0.25
        ]);
    });

    it("云层总包络与层间空隙", function () {
        expect(u.minHeight.value).to.equal(750);
        expect(u.maxHeight.value).to.equal(8000);
        expect(u.minIntervalHeights.value.toArray()).to.deep.equal([0, 2200, 0]);
        expect(u.maxIntervalHeights.value.toArray()).to.deep.equal([750, 7500, 0]);
    });

    it("云影包络只统计 shadow=true 且 height>0 的层", function () {
        expect(u.shadowTopHeight.value).to.equal(2200);
        expect(u.shadowBottomHeight.value).to.equal(750);
        expect(u.shadowLayerMask.value.toArray()).to.deep.equal([1, 1, 0, 0]);
    });

    it("units 默认值（m → km，与大气 LUT 单位约定一致）", function () {
        expect(u.worldToUnit.value).to.equal(0.001);
    });
});

describe("CloudUniforms（边界回退）", function () {
    it("全部层 height=0：minHeight 回退为 0", function () {
        const u = new CloudUniforms(
            new CloudLayers([
                { altitude: 100 },
                { altitude: 200 },
                { altitude: 300 },
                { altitude: 400 }
            ])
        );
        expect(u.minHeight.value).to.equal(0);
        expect(u.maxHeight.value).to.equal(0);
        expect(u.shadowTopHeight.value).to.equal(0);
    });

    it("densityScale=0 的层不计入包络", function () {
        const u = new CloudUniforms(
            new CloudLayers([
                { altitude: 100, height: 50, densityScale: 0 },
                { altitude: 200, height: 50, densityScale: 0.2 }
            ])
        );
        expect(u.minHeight.value).to.equal(200);
        expect(u.maxHeight.value).to.equal(250);
    });

    it("无 shadow 层时 shadowBottomHeight 回退为 0", function () {
        const u = new CloudUniforms(
            new CloudLayers([{ altitude: 100, height: 50, shadow: false }])
        );
        expect(u.shadowTopHeight.value).to.equal(0);
        expect(u.shadowBottomHeight.value).to.equal(0);
        expect(u.shadowLayerMask.value.toArray()).to.deep.equal([0, 0, 0, 0]);
    });

    it("自定义层配置后包络正确", function () {
        const u = new CloudUniforms(
            new CloudLayers([
                { altitude: 100, height: 100, shadow: true },
                { altitude: 500, height: 100, shadow: false }
            ])
        );
        expect(u.minHeight.value).to.equal(100);
        expect(u.maxHeight.value).to.equal(600);
        expect(u.shadowTopHeight.value).to.equal(200);
        expect(u.shadowBottomHeight.value).to.equal(100);
        expect(u.shadowLayerMask.value.toArray()).to.deep.equal([1, 0, 0, 0]);
    });
});

describe("CloudUniforms（质量预设与动态更新）", function () {
    it("applyQualityPreset 落地到 uniform.value", function () {
        const u = new CloudUniforms();
        u.applyQualityPreset("low");
        expect(u.maxIterationCount.value).to.equal(200);
        expect(u.minStepSize.value).to.equal(100);
        expect(u.shadowCascadeCount.value).to.equal(2);
        expect(u.maxShadowLengthIterationCount.value).to.equal(200);
        expect(u.hazeEnabled.value).to.equal(1);
        u.applyQualityPreset("high");
        expect(u.maxIterationCount.value).to.equal(500);
        expect(u.shadowCascadeCount.value).to.equal(3);
        u.applyQualityPreset("ultra");
        expect(u.accuratePhaseFunction.value).to.equal(1);
        expect(u.minStepSize.value).to.equal(10);
    });

    it("layers.set + updateLayers 后包络重算（set 是逐层部分更新，其余层保持默认）", function () {
        const u = new CloudUniforms(new CloudLayers(CloudLayers.DEFAULT));
        u.layers.set([{ altitude: 2000, height: 500, shadow: true }]);
        u.updateLayers();
        // Layer 0 is replaced with 2000-2500; layer 1 (1000-2200) and layer 2
        // (7500-8000) keep their defaults
        expect(u.minLayerHeights.value.x).to.equal(2000);
        expect(u.minHeight.value).to.equal(1000);
        expect(u.maxHeight.value).to.equal(8000);
        expect(u.shadowTopHeight.value).to.equal(2500);
        expect(u.shadowBottomHeight.value).to.equal(1000);
    });

    it("关键性能相关默认值（守卫：改动需同步性能审计结论）", function () {
        // With accurateSunSkyLight=1 the primary march queries the atmosphere LUT at
        // every sample (a performance hotspot); with multiScatteringOctaves=8 there are
        // 8 phase function evaluations per sample. These two defaults directly determine
        // the GPU cost of the cloud pass, so any change must be reflected in the
        // performance audit conclusions in docs.
        const u = new CloudUniforms();
        expect(u.accurateSunSkyLight.value).to.equal(1);
        expect(u.multiScatteringOctaves.value).to.equal(8);
        expect(u.turbulenceEnabled.value).to.equal(1);
        expect(u.maxIterationCount.value).to.equal(500);
    });
});
