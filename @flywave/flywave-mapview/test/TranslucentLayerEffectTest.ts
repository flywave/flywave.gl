/* Copyright (C) 2025 flywave.gl contributors */

import { expect } from "chai";
import * as THREE from "three/webgpu";

import {
    TRANSLUCENT_LAYER_BIT,
    TranslucentLayerEffect
} from "../src/composing/vrm/TranslucentLayerEffect";

const BIT_MASK = 1 << TRANSLUCENT_LAYER_BIT;

function makeMesh(): THREE.Mesh {
    return new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
}

describe("TranslucentLayerEffect（注册表与 layer 配置）", function () {
    it("addObject 开 bit 10，removeObject 关掉", function () {
        const effect = new TranslucentLayerEffect();
        const mesh = makeMesh();
        effect.addObject(mesh, "layer-a");
        expect(mesh.layers.mask & BIT_MASK).to.not.equal(0);
        expect(effect.hasObjects).to.equal(true);

        effect.removeObject(mesh);
        expect(mesh.layers.mask & BIT_MASK).to.equal(0);
        expect(effect.hasObjects).to.equal(false);
    });

    it("clearObjects(layerId) 只清指定 layer，其他 layer 注册保留", function () {
        const effect = new TranslucentLayerEffect();
        const meshA = makeMesh();
        const meshB = makeMesh();
        effect.addObject(meshA, "layer-a");
        effect.addObject(meshB, "layer-b");

        effect.clearObjects("layer-a");
        expect(meshA.layers.mask & BIT_MASK).to.equal(0);
        expect(meshB.layers.mask & BIT_MASK).to.not.equal(0);
        expect(effect.hasObjects).to.equal(true);

        effect.clearObjects();
        expect(meshB.layers.mask & BIT_MASK).to.equal(0);
        expect(effect.hasObjects).to.equal(false);
    });

    it("未配置 color 时 highlightColor 为 undefined（保留平光路径）", function () {
        const effect = new TranslucentLayerEffect();
        effect.addLayer("layer-a", { enabled: true } as any);
        expect(effect.highlightColor).to.equal(undefined);
        expect(effect.mixFactor).to.equal(0.5);
    });

    it("配置 color/mixFactor 时透出解析后的高亮色与混合系数", function () {
        const effect = new TranslucentLayerEffect();
        effect.addLayer("layer-a", { color: "#59c2ff", mixFactor: 0.3 } as any);
        const color = effect.highlightColor!;
        expect(color).to.exist;
        // THREE.Color 将 sRGB hex 转换为线性工作域
        const expected = new THREE.Color("#59c2ff");
        expect(color.r).to.be.closeTo(expected.r, 1e-6);
        expect(color.g).to.be.closeTo(expected.g, 1e-6);
        expect(color.b).to.be.closeTo(expected.b, 1e-6);
        expect(effect.mixFactor).to.equal(0.3);
    });
});
