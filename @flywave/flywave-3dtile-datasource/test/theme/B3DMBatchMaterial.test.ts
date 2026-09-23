/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";

import { B3DMBatchMaterial } from "../../src/materials/B3DMBatchMaterial";

function makeStyle(color: string): any {
    return {
        color,
        opacity: 1,
        offset: 0,
        direction: 1,
        metalness: 0,
        roughness: 1,
        emissive: "#000000",
        visible: true,
        highlighted: false,
        highlightColor: "#ffffff",
        useAnimation: false
    };
}

describe("B3DMBatchMaterial（样式纹理与生命周期）", function () {
    it("构造即建好 TSL 节点图（positionNode/colorNode），无 GPU 依赖", function () {
        const material = new B3DMBatchMaterial({ materialParams: { color: 0xffffff } });
        expect(material.positionNode).to.exist;
        expect(material.colorNode).to.exist;
        // uint _BATCHID 的 WGSL 合法性（float(attribute()).round()）需真实渲染验证，
        // 这里保证节点图构建路径不抛错
    });

    it("setBatchStyles 写入批样式并生成样式纹理", function () {
        const material = new B3DMBatchMaterial({});
        material.setBatchStyles(new Map([[0, makeStyle("#ff0000")]]));

        expect((material as any)._batchStyles.get(0).color).to.equal("#ff0000");
        expect((material as any)._styleTexture).to.exist;
    });

    it("同值重复 setBatchStyles 不重建纹理（防纹理 dispose/new 风暴）", function () {
        const material = new B3DMBatchMaterial({});
        material.setBatchStyles(new Map([[0, makeStyle("#ff0000")]]));
        const texture = (material as any)._styleTexture;

        material.setBatchStyles(new Map([[0, makeStyle("#ff0000")]]));
        expect((material as any)._styleTexture).to.equal(texture);
    });

    it("值变更后纹理随行更新", function () {
        const material = new B3DMBatchMaterial({});
        material.setBatchStyles(new Map([[0, makeStyle("#ff0000")]]));

        material.setBatchStyles(new Map([[0, makeStyle("#00ff00")]]));
        expect((material as any)._batchStyles.get(0).color).to.equal("#00ff00");
    });

    it("resetBatchStyles 清空批样式", function () {
        const material = new B3DMBatchMaterial({});
        material.setBatchStyles(new Map([[0, makeStyle("#ff0000")]]));

        material.resetBatchStyles();
        expect((material as any)._batchStyles.size).to.equal(0);
    });

    it("dispose 可安全调用", function () {
        const material = new B3DMBatchMaterial({});
        material.setBatchStyles(new Map([[0, makeStyle("#ff0000")]]));
        expect(() => material.dispose()).to.not.throw();
    });
});
