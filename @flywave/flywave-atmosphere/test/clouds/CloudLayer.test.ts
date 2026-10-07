/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";
import { Vector3, Vector4 } from "three/webgpu";

import { CloudLayer, CloudLayers, DensityProfile } from "../../src/clouds/CloudLayer";

describe("DensityProfile", function () {
    it("默认值：expTerm=0, exponent=0, linearTerm=0.75, constantTerm=0.25", function () {
        const p = new DensityProfile();
        expect(p.expTerm).to.equal(0);
        expect(p.exponent).to.equal(0);
        expect(p.linearTerm).to.equal(0.75);
        expect(p.constantTerm).to.equal(0.25);
    });

    it("copy：未提供的字段回退到默认值（nullish 语义）", function () {
        const p = new DensityProfile().copy({ expTerm: 0.5 });
        expect(p.expTerm).to.equal(0.5);
        expect(p.exponent).to.equal(0);
        expect(p.linearTerm).to.equal(0.75);
        expect(p.constantTerm).to.equal(0.25);
    });

    it("set/copy/clone 返回 this 且 clone 深拷贝", function () {
        const p = new DensityProfile();
        expect(p.set(1, 2, 3, 4)).to.equal(p);
        expect(p.copy({})).to.equal(p);
        const c = p.clone();
        expect(c).to.not.equal(p);
        expect(c.expTerm).to.equal(p.expTerm);
        c.expTerm = 42;
        expect(p.expTerm).to.not.equal(42);
    });
});

describe("CloudLayer", function () {
    it("默认值与 CloudLayer.DEFAULT 一致", function () {
        const l = new CloudLayer();
        expect(l.channel).to.equal("r");
        expect(l.altitude).to.equal(0);
        expect(l.height).to.equal(0);
        expect(l.densityScale).to.equal(0.2);
        expect(l.shapeAmount).to.equal(1);
        expect(l.shapeDetailAmount).to.equal(1);
        expect(l.weatherExponent).to.equal(1);
        expect(l.shapeAlteringBias).to.equal(0.35);
        expect(l.coverageFilterWidth).to.equal(0.6);
        expect(l.shadow).to.equal(false);
        expect(CloudLayer.DEFAULT.densityProfile.expTerm).to.equal(l.densityProfile.expTerm);
    });

    it("set 只更新提供的字段（部分更新语义）", function () {
        const l = new CloudLayer({ altitude: 750, height: 650 });
        expect(l.altitude).to.equal(750);
        expect(l.height).to.equal(650);
        expect(l.densityScale).to.equal(0.2);
        expect(l.channel).to.equal("r");
        l.set({ channel: "g" });
        expect(l.channel).to.equal("g");
        expect(l.altitude).to.equal(750);
    });

    it("set(空) 不做任何事", function () {
        const l = new CloudLayer({ altitude: 5 });
        l.set();
        l.set(undefined);
        expect(l.altitude).to.equal(5);
    });

    it("clone/copy 深拷贝 densityProfile", function () {
        const a = new CloudLayer({ densityProfile: { expTerm: 0.25 } });
        const b = a.clone();
        b.densityProfile.expTerm = 99;
        expect(a.densityProfile.expTerm).to.equal(0.25);
        const c = new CloudLayer();
        c.copy(a);
        c.densityProfile.exponent = 77;
        expect(a.densityProfile.exponent).to.equal(0);
    });
});

describe("CloudLayers（4 层容器 + 打包）", function () {
    it("构造恒产生 4 层，缺省位用默认层填充", function () {
        const layers = new CloudLayers([{ altitude: 100 }]);
        expect(layers).to.have.lengthOf(4);
        expect(layers[0].altitude).to.equal(100);
        expect(layers[1].altitude).to.equal(0);
        expect(layers[3].densityScale).to.equal(0.2);
    });

    it("DEFAULT 四层的通道是 rgba", function () {
        expect(new CloudLayers(CloudLayers.DEFAULT).localWeatherChannels).to.equal("rgba");
    });

    it("packValues/packSums/packDensityProfiles 按 x,y,z,w 对应层 0-3", function () {
        const layers = new CloudLayers([
            { altitude: 100, height: 50, densityProfile: { expTerm: 0.1 } },
            { altitude: 200, height: 60, densityProfile: { expTerm: 0.2 } },
            { altitude: 300, height: 70 },
            { altitude: 400, height: 80 }
        ]);
        const v4 = new Vector4();
        layers.packValues("altitude", v4);
        expect([v4.x, v4.y, v4.z, v4.w]).to.deep.equal([100, 200, 300, 400]);

        layers.packSums("altitude", "height", v4);
        expect([v4.x, v4.y, v4.z, v4.w]).to.deep.equal([150, 260, 370, 480]);

        layers.packDensityProfiles("expTerm", v4);
        expect([v4.x, v4.y, v4.z, v4.w]).to.deep.equal([0.1, 0.2, 0, 0]);
    });

    it("packIntervalHeights：DEFAULT 层产出 [0,750] 与 [2200,7500] 两个空隙", function () {
        // Default layers: 0:750-1400, 1:1000-2200 (overlapping), 2:7500-8000, 3:0-0
        // Sorted scan of closure points 0→750, 2200→7500; the third interval is never
        // closed, so it is filled with 0
        const minInt = new Vector3();
        const maxInt = new Vector3();
        new CloudLayers(CloudLayers.DEFAULT).packIntervalHeights(minInt, maxInt);
        expect([minInt.x, minInt.y, minInt.z]).to.deep.equal([0, 2200, 0]);
        expect([maxInt.x, maxInt.y, maxInt.z]).to.deep.equal([750, 7500, 0]);
    });

    it("packIntervalHeights：相邻不重叠层产出中间空隙", function () {
        const layers = new CloudLayers([
            { altitude: 100, height: 50 },
            { altitude: 200, height: 50 }
        ]);
        const minInt = new Vector3();
        const maxInt = new Vector3();
        layers.packIntervalHeights(minInt, maxInt);
        expect([minInt.x, minInt.y]).to.deep.equal([0, 150]);
        expect([maxInt.x, maxInt.y]).to.deep.equal([100, 200]);
    });

    it("packIntervalHeights：重叠层之间不产生空隙", function () {
        const layers = new CloudLayers([
            { altitude: 100, height: 50 }, // 100-150
            { altitude: 120, height: 40 } // 120-160
        ]);
        const minInt = new Vector3();
        const maxInt = new Vector3();
        layers.packIntervalHeights(minInt, maxInt);
        // Only two closure points: 0→100 and 160→(end); the second recorded interval is [0,100]
        expect(maxInt.x).to.equal(100);
        expect(minInt.y).to.equal(0);
    });

    it("set 替换全部层配置", function () {
        const layers = new CloudLayers();
        layers.set([
            { altitude: 1 },
            { altitude: 2 },
            { altitude: 3 },
            { altitude: 4, shadow: true }
        ]);
        expect(layers[0].altitude).to.equal(1);
        expect(layers[3].shadow).to.equal(true);
        expect(layers[0].densityScale).to.equal(0.2); // fields not provided are kept
    });
});
